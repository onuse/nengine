/**
 * LLM Integration Types
 * Defines interfaces for language model integration
 */

export interface LLMPrompt {
  systemContext: string;      // Character description, personality
  worldState: WorldContext;   // Current location, present NPCs
  recentHistory: Event[];     // Last N actions/conversations
  availableActions: Action[]; // Valid actions in current context
  query: string;              // "What do you do?" or specific interaction
}

export interface WorldContext {
  currentRoom: string;
  currentRoomName: string;
  roomDescription: string;
  connectedRooms: string[];
  presentNPCs: NPCContext[];
  visibleItems: string[];
  environment: {
    lighting: string;
    sounds: string[];
    smells: string[];
    hazards: string[];
  };
  gameTime: {
    timeOfDay: string;
    weatherCondition?: string;
  };
}

export interface NPCContext {
  id: string;
  name: string;
  description: string;
  currentMood: string;
  relationship: {
    trust: number;
    fear: number;
    respect: number;
  };
  recentMemories: string[];
}

export interface Event {
  timestamp: number;
  type: 'action' | 'dialogue' | 'observation' | 'system';
  actor: string;
  target?: string;
  description: string;
  outcome?: string;
}

export interface Action {
  id: string;
  name: string;
  description: string;
  requirements?: string[];
  difficulty?: number;
  consequences?: string[];
}

export interface LLMResponse {
  narrative: string;           // Main narrative description
  dialogue?: string;          // NPC speech (if applicable)
  actions?: string[];         // Triggered game actions
  stateChanges?: any;         // Suggested state modifications
  mood?: string;              // Scene mood/tone
  nextPrompts?: string[];     // Suggested player responses
}

export interface ModelCapabilities {
  name: string;
  contextWindow: number;
  supportsSystemMessages: boolean;
  supportsTools: boolean;
  maxTokensPerSecond: number;
  modelSize: string;
}

export interface LLMProvider {
  initialize(modelPath: string): Promise<void>;
  complete(prompt: LLMPrompt): Promise<LLMResponse>;
  switchModel(newModel: string): Promise<void>;
  getModelInfo(): ModelCapabilities;
  isAvailable(): Promise<boolean>;
  shutdown(): Promise<void>;
  generateImage?(prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResult>;
}

export interface ImageGenerationOptions {
  size?: '512x512' | '768x768' | '1024x1024';
  steps?: number;
  cfgScale?: number;
  negativePrompt?: string;
  seed?: number;
}

export interface ImageGenerationResult {
  success: boolean;
  imageData?: string; // base64 encoded image
  error?: string;
  metadata?: {
    prompt: string;
    size: string;
    steps: number;
    seed?: number;
  };
}

export interface LLMConfig {
  provider: 'creative-server';  // Only creative-server supported
  model: string;
  contextWindow: number;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  // Creative server specific options
  creativeServer?: {
    baseUrl?: string;
    adminUrl?: string;
    autoSwitch?: boolean;
  };
}

// Narrative generation specific types
export interface NarrativeRequest {
  type: 'action_response' | 'npc_dialogue' | 'scene_description' | 'combat_narration';
  context: WorldContext;
  previousEvents: Event[];
  playerAction?: string;
  involvedNPCs?: string[];
  mechanicalResult?: any; // Dice rolls, skill check results, etc.
}

export interface DialogueContext {
  speaker: string;
  listener: string;
  relationship: any;
  conversationHistory: Event[];
  currentTopic?: string;
  mood: string;
  location: string;
}

// Clean Slate Context types
export interface CuratedContext {
  immediateSituation: string;           // Last 2-3 turns, verbatim
  relevantHistory: string;              // Key events that matter now
  characterStates: Map<string, string>; // Current state of each actor
  worldContext: string;                 // Important location/time info
  mechanicalRequirements: string;       // Rules that apply
  narrativeTone: string;                // Suggested tone based on arc
  timestamp: number;                    // When this context was built
  tokenCount: number;                   // Estimated token usage
}

export interface ContextCurationParams {
  currentAction: string;
  actors: string[];
  location: string;
  maxTokens: number;
  importance: 'high' | 'medium' | 'low';
  timeframe: 'immediate' | 'recent' | 'extended';
}