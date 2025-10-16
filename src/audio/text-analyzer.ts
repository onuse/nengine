/**
 * Text Analyzer
 *
 * Analyzes narrative text to detect speakers and split into audio segments.
 * Uses Gemma 3 270M micro LLM for intelligent speaker detection.
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import {
  AudioSegment,
  AudioServiceError,
  CharacterVoiceConfig,
  SpeakerDetectionCharacter,
  SpeakerDetectionHealthResponse,
  SpeakerDetectionRequest,
  SpeakerDetectionResponse,
  VoiceConfig,
} from './types';

export interface TextAnalyzerContext {
  currentRoom: string;
  recentSpeakers: string[];  // Recent speaker IDs for context
}

export class TextAnalyzer {
  private client: AxiosInstance;
  private serviceUrl: string;
  private narratorFallbackThreshold: number;
  private isHealthy: boolean = false;

  constructor(
    serviceUrl: string,
    narratorFallbackThreshold: number = 0.5
  ) {
    this.serviceUrl = serviceUrl;
    this.narratorFallbackThreshold = narratorFallbackThreshold;
    this.client = axios.create({
      baseURL: serviceUrl,
      timeout: 5000, // 5 second timeout (longer for LLM inference)
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Initial health check
    this.checkHealth().catch(() => {
      console.warn('[TextAnalyzer] Initial health check failed - service may not be ready yet');
    });
  }

  /**
   * Check service health
   */
  public async checkHealth(): Promise<SpeakerDetectionHealthResponse> {
    try {
      const response = await this.client.get<SpeakerDetectionHealthResponse>('/health');
      this.isHealthy = response.data.status === 'healthy';

      if (this.isHealthy) {
        console.log('[TextAnalyzer] Health check passed:', response.data);
      }

      return response.data;
    } catch (error) {
      this.isHealthy = false;
      throw new AudioServiceError(
        'Speaker detection service health check failed',
        'speaker-detection',
        'HEALTH_CHECK_FAILED',
        (error as any).response?.status
      );
    }
  }

  /**
   * Analyze narrative text and detect speakers
   */
  public async analyzeText(
    narrative: string,
    characters: CharacterVoiceConfig[],
    narratorVoice: VoiceConfig,
    context?: TextAnalyzerContext
  ): Promise<AudioSegment[]> {
    if (!this.isHealthy) {
      console.warn('[TextAnalyzer] Service may be unhealthy, attempting analysis anyway');
    }

    // First, extract quotes to see if there's any dialogue
    const hasDialogue = this.hasQuotedText(narrative);

    if (!hasDialogue) {
      // No dialogue - entire narrative is narrator
      console.log('[TextAnalyzer] No dialogue detected, using narrator voice for entire text');
      return [
        {
          id: this.generateSegmentId(narrative, 'narrator'),
          speaker: 'narrator',
          text: narrative.trim(),
          voiceConfig: narratorVoice,
          confidence: 1.0,
          reasoning: 'No dialogue quotes detected',
        },
      ];
    }

    // Call Gemma 3 for speaker detection
    try {
      const detectionRequest: SpeakerDetectionRequest = {
        narrative,
        characters: this.formatCharactersForDetection(characters),
        context: context
          ? {
              currentRoom: context.currentRoom,
              recentSpeakers: context.recentSpeakers,
            }
          : undefined,
      };

      console.log(`[TextAnalyzer] Analyzing text (${narrative.length} chars) with ${characters.length} characters`);

      const response = await this.client.post<SpeakerDetectionResponse>(
        '/parse-speakers',
        detectionRequest
      );

      if (!response.data.success) {
        throw new Error('Speaker detection failed - service returned success=false');
      }

      console.log(
        `[TextAnalyzer] Detection complete: ${response.data.segments.length} segments, ` +
        `${response.data.processing_time_ms}ms processing time`
      );

      // Convert detected segments to audio segments
      const audioSegments: AudioSegment[] = response.data.segments.map((detected) => {
        // Apply narrator fallback for low confidence
        let speaker = detected.speaker;
        let voiceConfig: VoiceConfig;
        let confidence = detected.confidence;

        if (confidence < this.narratorFallbackThreshold) {
          console.log(
            `[TextAnalyzer] Low confidence (${confidence.toFixed(2)}) for "${detected.text.substring(0, 30)}...", ` +
            `falling back to narrator`
          );
          speaker = 'narrator';
          voiceConfig = narratorVoice;
        } else if (speaker === 'narrator') {
          voiceConfig = narratorVoice;
        } else {
          // Look up character voice config
          const character = characters.find((c) => c.id === speaker);
          if (character) {
            voiceConfig = character.audio;
          } else {
            console.warn(`[TextAnalyzer] Unknown character "${speaker}", falling back to narrator`);
            speaker = 'narrator';
            voiceConfig = narratorVoice;
            confidence = 0.5;
          }
        }

        return {
          id: this.generateSegmentId(detected.text, speaker),
          speaker,
          text: detected.text,
          voiceConfig,
          confidence,
          reasoning: detected.reasoning,
        };
      });

      return audioSegments;
    } catch (error) {
      const axiosError = error as any;

      // If speaker detection fails, fall back to narrator for entire text
      console.error('[TextAnalyzer] Speaker detection failed, falling back to narrator:', axiosError.message);

      return [
        {
          id: this.generateSegmentId(narrative, 'narrator'),
          speaker: 'narrator',
          text: narrative.trim(),
          voiceConfig: narratorVoice,
          confidence: 0.3,
          reasoning: 'Speaker detection service failed - fallback to narrator',
        },
      ];
    }
  }

  /**
   * Check if text contains quoted dialogue
   */
  private hasQuotedText(text: string): boolean {
    // Look for double or single quotes
    return /"[^"]+"|'[^']+'/.test(text);
  }

  /**
   * Format characters for speaker detection service
   */
  private formatCharactersForDetection(
    characters: CharacterVoiceConfig[]
  ): SpeakerDetectionCharacter[] {
    return characters.map((char) => ({
      id: char.id,
      name: char.name,
      aliases: char.aliases || [],
      description: char.description || '',
    }));
  }

  /**
   * Generate unique segment ID based on content
   */
  private generateSegmentId(text: string, speaker: string): string {
    const hash = crypto
      .createHash('md5')
      .update(`${text}:${speaker}:${Date.now()}`)
      .digest('hex');
    return `seg_${hash.substring(0, 12)}`;
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
