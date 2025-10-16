/**
 * Audio System Type Definitions
 *
 * Types for the TTS audio pipeline including speaker detection,
 * voice synthesis, and audio segment management.
 */

// ============================================================================
// Voice Configuration
// ============================================================================

export interface VoiceConfig {
  voice: string;        // Kokoro voice ID (e.g., "af_bella", "af_sarah")
  speed: number;        // Speed multiplier (0.5-2.0, default 1.0)
  style?: string;       // Optional style hint (e.g., "formal", "casual")
}

export interface CharacterVoiceConfig {
  id: string;           // Character ID
  name: string;         // Display name
  aliases: string[];    // Alternative names/references (e.g., "the redhead")
  description: string;  // Description for Gemma 3 context
  audio: VoiceConfig;   // Voice configuration
}

export interface AudioConfig {
  enabled: boolean;
  provider: 'kokoro';
  defaultVoice: string;           // Narrator voice

  // Service URLs
  kokoroServiceUrl: string;       // TTS service (e.g., http://192.168.1.95:8001)
  speakerDetectionUrl: string;    // Speaker detection (e.g., http://192.168.1.95:8002)

  // Settings
  speakerDetection: {
    provider: 'micro-llm';
    model: string;                // e.g., "gemma-3-270m"
    narratorFallbackThreshold: number;  // Confidence threshold (e.g., 0.5)
    timeout: number;              // Request timeout in ms
  };

  narrator: VoiceConfig;          // Narrator voice config
  characters: Record<string, CharacterVoiceConfig>;  // Character voice map
}

// ============================================================================
// Audio Segments
// ============================================================================

export interface AudioSegment {
  id: string;           // Unique segment ID (hash-based)
  speaker: string;      // "narrator" or character ID
  text: string;         // Text content to synthesize
  voiceConfig: VoiceConfig;  // Voice settings for this segment
  confidence: number;   // Speaker detection confidence (0.0-1.0)
  reasoning?: string;   // Optional: why this speaker was chosen
}

export interface SynthesizedAudioSegment extends AudioSegment {
  audioBuffer: Buffer;  // MP3 audio data
  duration: number;     // Duration in seconds
  sizeBytes: number;    // File size in bytes
  url: string;          // URL for client to fetch (/api/audio/{id}.mp3)
}

// ============================================================================
// Kokoro TTS Service API
// ============================================================================

export interface KokoroSynthesizeRequest {
  text: string;
  voice: string;
  speed?: number;
  format?: 'wav' | 'mp3';
  sample_rate?: number;
}

export interface KokoroSynthesizeResponse {
  success: boolean;
  audio: string;        // Base64-encoded audio
  format: string;
  duration: number;
  sample_rate: number;
  size_bytes: number;
  metadata: {
    text: string;
    voice: string;
    speed: number;
  };
}

export interface KokoroBatchRequest {
  segments: Array<{
    id: string;
    text: string;
    voice: string;
    speed?: number;
  }>;
  format?: 'wav' | 'mp3';
}

export interface KokoroBatchResponse {
  success: boolean;
  segments: Array<{
    id: string;
    audio: string;      // Base64-encoded audio
    duration: number;
    size_bytes: number;
  }>;
  total_duration: number;
  processing_time_ms: number;
}

export interface KokoroHealthResponse {
  status: 'healthy' | 'unhealthy';
  model: string;
  version: string;
  available_voices: string[];
  gpu_available: boolean;
}

export interface KokoroVoice {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  accent: string;
  description: string;
}

export interface KokoroVoicesResponse {
  voices: KokoroVoice[];
}

// ============================================================================
// Speaker Detection Service API (Gemma 3)
// ============================================================================

export interface SpeakerDetectionCharacter {
  id: string;
  name: string;
  aliases: string[];
  description: string;
}

export interface SpeakerDetectionRequest {
  narrative: string;
  characters: SpeakerDetectionCharacter[];
  context?: {
    currentRoom?: string;
    recentSpeakers?: string[];
  };
}

export interface DetectedSpeaker {
  text: string;
  speaker: string;      // Character ID or "narrator"
  confidence: number;
  reasoning: string;
}

export interface SpeakerDetectionResponse {
  success: boolean;
  segments: DetectedSpeaker[];
  processing_time_ms: number;
}

export interface SpeakerDetectionHealthResponse {
  status: 'healthy' | 'unhealthy';
  model: string;
  version: string;
  inference_device: string;
}

// ============================================================================
// Audio Response (sent to client)
// ============================================================================

export interface AudioSegmentResponse {
  id: string;
  speaker: string;
  url: string;          // /api/audio/{id}.mp3
  text: string;
  duration: number;     // Duration in seconds
}

export interface AudioResponse {
  segments: AudioSegmentResponse[];
  totalDuration: number;
  autoPlay: boolean;
}

export interface NarrativeWithAudio {
  text: string;         // Full narrative text
  audio?: AudioResponse;  // Optional audio data
}

// ============================================================================
// Error Types
// ============================================================================

export class AudioServiceError extends Error {
  constructor(
    message: string,
    public service: 'kokoro' | 'speaker-detection',
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AudioServiceError';
  }
}

// ============================================================================
// Internal Types
// ============================================================================

export interface AudioPipelineContext {
  gameId: string;
  currentRoom: string;
  presentCharacters: string[];  // Character IDs
  recentSpeakers: string[];     // Recent speaker history
}
