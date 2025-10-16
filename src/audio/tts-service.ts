/**
 * TTS Service
 *
 * Wrapper for Kokoro-82M TTS service.
 * Handles audio synthesis requests and response parsing.
 */

import axios, { AxiosInstance } from 'axios';
import {
  AudioServiceError,
  AudioSegment,
  KokoroBatchRequest,
  KokoroBatchResponse,
  KokoroHealthResponse,
  KokoroSynthesizeRequest,
  KokoroSynthesizeResponse,
  KokoroVoicesResponse,
  SynthesizedAudioSegment,
} from './types';

export class TTSService {
  private client: AxiosInstance;
  private serviceUrl: string;
  private healthCheckInterval?: NodeJS.Timeout;
  private isHealthy: boolean = false;

  constructor(serviceUrl: string) {
    this.serviceUrl = serviceUrl;
    this.client = axios.create({
      baseURL: serviceUrl,
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Start periodic health checks
   */
  private startHealthMonitoring(): void {
    // Initial health check
    this.checkHealth().catch(() => {
      console.warn('[TTSService] Initial health check failed - service may not be ready yet');
    });

    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        console.error('[TTSService] Health check failed:', error);
      }
    }, 30000);
  }

  /**
   * Stop health monitoring
   */
  public stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  /**
   * Check service health
   */
  public async checkHealth(): Promise<KokoroHealthResponse> {
    try {
      const response = await this.client.get<KokoroHealthResponse>('/health');
      this.isHealthy = response.data.status === 'healthy';

      if (this.isHealthy) {
        console.log('[TTSService] Health check passed:', response.data);
      }

      return response.data;
    } catch (error) {
      this.isHealthy = false;
      throw new AudioServiceError(
        'Kokoro TTS service health check failed',
        'kokoro',
        'HEALTH_CHECK_FAILED',
        (error as any).response?.status
      );
    }
  }

  /**
   * Get available voices
   */
  public async getVoices(): Promise<KokoroVoicesResponse> {
    try {
      const response = await this.client.get<KokoroVoicesResponse>('/voices');
      return response.data;
    } catch (error) {
      throw new AudioServiceError(
        'Failed to fetch available voices',
        'kokoro',
        'VOICES_FETCH_FAILED',
        (error as any).response?.status
      );
    }
  }

  /**
   * Synthesize single text segment
   */
  public async synthesize(
    text: string,
    voice: string,
    speed: number = 1.0,
    format: 'wav' | 'mp3' = 'mp3'
  ): Promise<{ audio: Buffer; duration: number; sizeBytes: number }> {
    if (!this.isHealthy) {
      console.warn('[TTSService] Service may be unhealthy, attempting synthesis anyway');
    }

    try {
      const request: KokoroSynthesizeRequest = {
        text,
        voice,
        speed,
        format,
        sample_rate: 24000,
      };

      console.log(`[TTSService] Synthesizing: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" (voice: ${voice}, speed: ${speed})`);

      const response = await this.client.post<KokoroSynthesizeResponse>(
        '/synthesize',
        request
      );

      if (!response.data.success) {
        throw new Error('Synthesis failed - service returned success=false');
      }

      // Decode base64 audio
      const audioBuffer = Buffer.from(response.data.audio, 'base64');

      console.log(`[TTSService] Synthesis complete: ${response.data.duration}s, ${response.data.size_bytes} bytes`);

      return {
        audio: audioBuffer,
        duration: response.data.duration,
        sizeBytes: response.data.size_bytes,
      };
    } catch (error) {
      const axiosError = error as any;
      throw new AudioServiceError(
        `Audio synthesis failed: ${axiosError.message}`,
        'kokoro',
        axiosError.response?.data?.error_code || 'SYNTHESIS_FAILED',
        axiosError.response?.status
      );
    }
  }

  /**
   * Synthesize multiple segments in batch
   */
  public async synthesizeBatch(
    segments: AudioSegment[],
    format: 'wav' | 'mp3' = 'mp3'
  ): Promise<SynthesizedAudioSegment[]> {
    if (!this.isHealthy) {
      console.warn('[TTSService] Service may be unhealthy, attempting batch synthesis anyway');
    }

    try {
      const request: KokoroBatchRequest = {
        segments: segments.map((seg) => ({
          id: seg.id,
          text: seg.text,
          voice: seg.voiceConfig.voice,
          speed: seg.voiceConfig.speed,
        })),
        format,
      };

      console.log(`[TTSService] Batch synthesizing ${segments.length} segments`);

      const response = await this.client.post<KokoroBatchResponse>(
        '/synthesize/batch',
        request
      );

      if (!response.data.success) {
        throw new Error('Batch synthesis failed - service returned success=false');
      }

      console.log(
        `[TTSService] Batch synthesis complete: ${response.data.total_duration}s total, ` +
        `${response.data.processing_time_ms}ms processing time`
      );

      // Combine response data with original segments
      const synthesizedSegments: SynthesizedAudioSegment[] = segments.map((seg, index) => {
        const responseSegment = response.data.segments[index];
        const audioBuffer = Buffer.from(responseSegment.audio, 'base64');

        return {
          ...seg,
          audioBuffer,
          duration: responseSegment.duration,
          sizeBytes: responseSegment.size_bytes,
          url: `/api/audio/${seg.id}.mp3`,
        };
      });

      return synthesizedSegments;
    } catch (error) {
      const axiosError = error as any;

      // If batch endpoint not available, fall back to individual synthesis
      if (axiosError.response?.status === 404) {
        console.warn('[TTSService] Batch endpoint not available, falling back to individual synthesis');
        return this.synthesizeIndividually(segments, format);
      }

      throw new AudioServiceError(
        `Batch audio synthesis failed: ${axiosError.message}`,
        'kokoro',
        axiosError.response?.data?.error_code || 'BATCH_SYNTHESIS_FAILED',
        axiosError.response?.status
      );
    }
  }

  /**
   * Synthesize segments individually (fallback for batch)
   */
  private async synthesizeIndividually(
    segments: AudioSegment[],
    format: 'wav' | 'mp3' = 'mp3'
  ): Promise<SynthesizedAudioSegment[]> {
    console.log(`[TTSService] Synthesizing ${segments.length} segments individually`);

    const promises = segments.map(async (seg) => {
      const result = await this.synthesize(
        seg.text,
        seg.voiceConfig.voice,
        seg.voiceConfig.speed,
        format
      );

      return {
        ...seg,
        audioBuffer: result.audio,
        duration: result.duration,
        sizeBytes: result.sizeBytes,
        url: `/api/audio/${seg.id}.mp3`,
      };
    });

    return Promise.all(promises);
  }

  /**
   * Check if service is healthy
   */
  public isServiceHealthy(): boolean {
    return this.isHealthy;
  }

  /**
   * Get service URL
   */
  public getServiceUrl(): string {
    return this.serviceUrl;
  }
}
