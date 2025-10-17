/**
 * Audio Assembler
 *
 * Coordinates the complete audio pipeline:
 * 1. Text analysis (speaker detection)
 * 2. TTS synthesis (Kokoro)
 * 3. File storage
 * 4. Response assembly
 */

import fs from 'fs/promises';
import path from 'path';
import {
  AudioConfig,
  AudioResponse,
  AudioSegment,
  AudioSegmentResponse,
  CharacterVoiceConfig,
  SynthesizedAudioSegment,
} from './types';
import { CharacterMatcher } from './character-matcher';
import { TextAnalyzer, TextAnalyzerContext } from './text-analyzer';
import { TTSService } from './tts-service';

export interface AudioAssemblerOptions {
  audioConfig: AudioConfig;
  gameId: string;
  audioStoragePath?: string;  // Default: games/{gameId}/generated-audio
  mcpManager?: any;  // MCP Manager to load character data
}

export class AudioAssembler {
  private config: AudioConfig;
  private gameId: string;
  private audioStoragePath: string;
  private mcpManager: any;

  private ttsService: TTSService;
  private textAnalyzer: TextAnalyzer;
  private characterMatcher: CharacterMatcher;

  // In-memory storage for quick lookup (id -> file path)
  private audioSegments: Map<string, SynthesizedAudioSegment> = new Map();

  constructor(options: AudioAssemblerOptions) {
    this.config = options.audioConfig;
    this.gameId = options.gameId;
    this.mcpManager = options.mcpManager;
    this.audioStoragePath =
      options.audioStoragePath || path.join('games', this.gameId, 'generated-audio');

    // Initialize services
    this.ttsService = new TTSService(this.config.kokoroServiceUrl);
    this.textAnalyzer = new TextAnalyzer(
      this.config.speakerDetectionUrl,
      this.config.speakerDetection.narratorFallbackThreshold
    );

    // Initialize character matcher with empty list - will be populated from MCP
    this.characterMatcher = new CharacterMatcher([]);

    console.log(`[AudioAssembler] Initialized for game: ${this.gameId}`);
    console.log(`[AudioAssembler] Audio storage: ${this.audioStoragePath}`);
    console.log(`[AudioAssembler] TTS service: ${this.config.kokoroServiceUrl}`);
    console.log(`[AudioAssembler] Speaker detection: ${this.config.speakerDetectionUrl}`);

    // Ensure storage directory exists
    this.ensureStorageDirectory();

    // Load character voice configs from MCP
    this.loadCharacterVoices();
  }

  /**
   * Load character voice configurations from Entity Content MCP
   */
  private async loadCharacterVoices(): Promise<void> {
    if (!this.mcpManager) {
      console.warn('[AudioAssembler] No MCP manager provided - character voices will not be loaded');
      return;
    }

    try {
      // Get all NPCs from entity content MCP
      const entityMCP = this.mcpManager.getServer('entity-content');
      if (!entityMCP) {
        console.warn('[AudioAssembler] Entity Content MCP not found');
        return;
      }

      const npcs = await this.mcpManager.executeTool('entity-content', 'getAllNPCs', {});

      if (!npcs || !Array.isArray(npcs)) {
        console.warn('[AudioAssembler] No NPCs returned from MCP');
        return;
      }

      // Convert NPC data to CharacterVoiceConfig format
      for (const npc of npcs) {
        if (npc.audio) {
          const voiceConfig: CharacterVoiceConfig = {
            id: npc.id,
            name: npc.name,
            aliases: npc.audio.aliases || [],
            description: npc.description || '',
            audio: {
              voice: npc.audio.voice,
              speed: npc.audio.speed || 1.0,
              style: npc.audio.style
            }
          };

          this.characterMatcher.addCharacter(voiceConfig);
          console.log(`[AudioAssembler] Loaded voice for ${npc.name}: ${npc.audio.voice} (${npc.audio.speed}x)`);
        }
      }

      console.log(`[AudioAssembler] Loaded ${this.characterMatcher.size()} character voices`);
    } catch (error) {
      console.error('[AudioAssembler] Failed to load character voices from MCP:', error);
    }
  }

  /**
   * Ensure audio storage directory exists
   */
  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.audioStoragePath, { recursive: true });
    } catch (error) {
      console.error(`[AudioAssembler] Failed to create storage directory:`, error);
    }
  }

  /**
   * Process narrative text and generate audio
   */
  public async processNarrative(
    narrative: string,
    context?: TextAnalyzerContext
  ): Promise<AudioResponse> {
    if (!this.config.enabled) {
      throw new Error('Audio is disabled in configuration');
    }

    console.log(`[AudioAssembler] Processing narrative (${narrative.length} chars)`);

    // Step 1: Analyze text and detect speakers
    const segments = await this.textAnalyzer.analyzeText(
      narrative,
      this.characterMatcher.getAllCharacters(),
      this.config.narrator,
      context
    );

    console.log(`[AudioAssembler] Text analysis complete: ${segments.length} segments`);

    // Step 2: Synthesize audio for all segments (using WAV format)
    const synthesizedSegments = await this.ttsService.synthesizeBatch(segments, 'wav');

    console.log(`[AudioAssembler] Audio synthesis complete`);

    // Step 3: Save audio files
    await this.saveAudioSegments(synthesizedSegments);

    // Step 4: Build response for client
    const response = this.buildAudioResponse(synthesizedSegments);

    console.log(`[AudioAssembler] Processing complete: ${response.totalDuration.toFixed(2)}s total`);

    return response;
  }

  /**
   * Save synthesized audio segments to disk
   */
  private async saveAudioSegments(segments: SynthesizedAudioSegment[]): Promise<void> {
    const savePromises = segments.map(async (segment) => {
      const filePath = path.join(this.audioStoragePath, `${segment.id}.wav`);

      try {
        await fs.writeFile(filePath, segment.audioBuffer);
        this.audioSegments.set(segment.id, segment);
        console.log(`[AudioAssembler] Saved audio segment: ${segment.id} (${segment.sizeBytes} bytes)`);
      } catch (error) {
        console.error(`[AudioAssembler] Failed to save segment ${segment.id}:`, error);
        throw error;
      }
    });

    await Promise.all(savePromises);
  }

  /**
   * Build audio response for client
   */
  private buildAudioResponse(segments: SynthesizedAudioSegment[]): AudioResponse {
    const segmentResponses: AudioSegmentResponse[] = segments.map((seg) => ({
      id: seg.id,
      speaker: seg.speaker,
      url: `/api/audio/${seg.id}.wav`,
      text: seg.text,
      duration: seg.duration,
    }));

    const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

    return {
      segments: segmentResponses,
      totalDuration,
      autoPlay: true,  // Can be configurable later
    };
  }

  /**
   * Get audio segment by ID
   */
  public getSegment(id: string): SynthesizedAudioSegment | undefined {
    return this.audioSegments.get(id);
  }

  /**
   * Get audio segment file path
   */
  public getSegmentPath(id: string): string {
    return path.join(this.audioStoragePath, `${id}.wav`);
  }

  /**
   * Check if segment exists
   */
  public hasSegment(id: string): boolean {
    return this.audioSegments.has(id);
  }

  /**
   * Get audio buffer for segment
   */
  public async getSegmentBuffer(id: string): Promise<Buffer | null> {
    const filePath = this.getSegmentPath(id);

    try {
      return await fs.readFile(filePath);
    } catch (error) {
      console.error(`[AudioAssembler] Failed to read segment ${id}:`, error);
      return null;
    }
  }

  /**
   * Check service health
   */
  public async checkHealth(): Promise<{
    tts: boolean;
    speakerDetection: boolean;
  }> {
    const [tts, speakerDetection] = await Promise.all([
      this.ttsService.checkHealth().then(() => true).catch(() => false),
      this.textAnalyzer.checkHealth().then(() => true).catch(() => false),
    ]);

    return { tts, speakerDetection };
  }

  /**
   * Get service status
   */
  public getStatus(): {
    enabled: boolean;
    ttsHealthy: boolean;
    speakerDetectionHealthy: boolean;
    segmentCount: number;
    characterCount: number;
    speakerDetectionStats?: {
      totalAttempts: number;
      successfulAttempts: number;
      failedAttempts: number;
      retryCount: number;
      successRate: string;
    };
  } {
    return {
      enabled: this.config.enabled,
      ttsHealthy: this.ttsService.isServiceHealthy(),
      speakerDetectionHealthy: this.textAnalyzer.isServiceHealthy(),
      segmentCount: this.audioSegments.size,
      characterCount: this.characterMatcher.size(),
      speakerDetectionStats: this.textAnalyzer.getStats(),
    };
  }

  /**
   * Add or update a character dynamically
   */
  public addCharacter(character: CharacterVoiceConfig): void {
    this.characterMatcher.addCharacter(character);
    this.config.characters[character.id] = character;
  }

  /**
   * Remove a character
   */
  public removeCharacter(id: string): boolean {
    delete this.config.characters[id];
    return this.characterMatcher.removeCharacter(id);
  }

  /**
   * Clear audio cache
   */
  public async clearCache(): Promise<void> {
    try {
      const files = await fs.readdir(this.audioStoragePath);
      const deletePromises = files
        .filter((f) => f.endsWith('.wav'))
        .map((f) => fs.unlink(path.join(this.audioStoragePath, f)));

      await Promise.all(deletePromises);
      this.audioSegments.clear();

      console.log(`[AudioAssembler] Cleared ${files.length} audio files from cache`);
    } catch (error) {
      console.error('[AudioAssembler] Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Get cache size in bytes
   */
  public async getCacheSize(): Promise<number> {
    try {
      const files = await fs.readdir(this.audioStoragePath);
      let totalSize = 0;

      for (const file of files) {
        if (file.endsWith('.wav')) {
          const stats = await fs.stat(path.join(this.audioStoragePath, file));
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch (error) {
      console.error('[AudioAssembler] Failed to calculate cache size:', error);
      return 0;
    }
  }

  /**
   * Stop health monitoring
   */
  public cleanup(): void {
    this.ttsService.stopHealthMonitoring();
    console.log('[AudioAssembler] Cleanup complete');
  }
}
