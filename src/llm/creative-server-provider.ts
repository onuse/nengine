/**
 * Creative Server LLM Provider
 * Handles integration with the creative working set server (Llama 3.3 70B + FLUX Unchained)
 * API: http://192.168.1.95:8000
 */

import axios, { AxiosInstance } from 'axios';
import {
  LLMProvider,
  LLMPrompt,
  LLMResponse,
  ModelCapabilities,
  ImageGenerationOptions,
  ImageGenerationResult
} from './types';

export interface CreativeServerConfig {
  baseUrl: string;
  adminUrl: string;
  textModel: string;
  imageModel: string;
  temperature: number;
  contextWindow: number;
  autoSwitch: boolean; // Automatically switch to creative working set
  timeout: number; // Request timeout in ms
}

export class CreativeServerProvider implements LLMProvider {
  private config: CreativeServerConfig;
  private client: AxiosInstance;
  private adminClient: AxiosInstance;
  private isReady: boolean = false;
  private currentModel: string;

  constructor(config: Partial<CreativeServerConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://192.168.1.95:8000/v1',
      adminUrl: config.adminUrl || 'http://192.168.1.95:8000/admin',
      textModel: config.textModel || 'llama-3.3-70b-abliterated',
      imageModel: config.imageModel || 'flux-unchained:12b',
      temperature: config.temperature !== undefined ? config.temperature : 0.9,
      contextWindow: config.contextWindow || 32000,
      autoSwitch: config.autoSwitch !== undefined ? config.autoSwitch : true,
      timeout: config.timeout || 600000 // 10 minutes for slow LLM responses
    };

    this.currentModel = this.config.textModel;

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.adminClient = axios.create({
      baseURL: this.config.adminUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async initialize(modelPath?: string): Promise<void> {
    console.log('[CreativeServerProvider] Initializing creative server integration...');

    try {
      // Check server availability
      const isAvailable = await this.isServerAvailable();
      if (!isAvailable) {
        throw new Error('Creative server is not reachable at ' + this.config.baseUrl);
      }

      // Check and switch working set if needed
      if (this.config.autoSwitch) {
        await this.ensureCreativeSetActive();
      }

      // Override model if specified
      if (modelPath) {
        this.currentModel = modelPath;
      }

      this.isReady = true;
      console.log(`[CreativeServerProvider] Ready with model: ${this.currentModel}`);

    } catch (error: any) {
      console.error('[CreativeServerProvider] Initialization failed:', error.message);
      throw error;
    }
  }

  async complete(prompt: LLMPrompt): Promise<LLMResponse> {
    if (!this.isReady) {
      throw new Error('CreativeServerProvider not initialized');
    }

    const formattedMessages = this.formatPromptToMessages(prompt);
    const startTime = Date.now();

    try {
      console.log(`[CreativeServerProvider] Generating response with ${this.currentModel}...`);

      const response = await this.client.post('/chat/completions', {
        model: this.currentModel,
        messages: formattedMessages,
        temperature: this.config.temperature
        // No max_tokens - let the LLM decide when to stop naturally based on context
      });

      const responseTime = Date.now() - startTime;
      console.log(`[CreativeServerProvider] Response generated in ${responseTime}ms (${(responseTime/1000).toFixed(1)}s)`);

      const content = response.data.choices[0].message.content;
      return this.parseResponse(content, prompt);

    } catch (error: any) {
      const errorTime = Date.now() - startTime;
      console.error(`[CreativeServerProvider] Generation failed after ${errorTime}ms:`, error.message);

      if (error.response?.status === 503 && error.response?.data?.detail?.includes('No chat model')) {
        throw new Error('Creative working set is not active. Please switch to creative set or enable autoSwitch.');
      }

      throw error;
    }
  }

  async generateImage(prompt: string, options: ImageGenerationOptions = {}): Promise<ImageGenerationResult> {
    if (!this.isReady) {
      throw new Error('CreativeServerProvider not initialized');
    }

    const startTime = Date.now();

    try {
      console.log(`[CreativeServerProvider] Generating image: "${prompt.substring(0, 50)}..."`);

      const requestBody: any = {
        model: this.config.imageModel,
        prompt: prompt,
        size: options.size || '512x512',
        n: 1
      };

      // Add optional parameters
      if (options.negativePrompt) {
        requestBody.negative_prompt = options.negativePrompt;
      }
      if (options.steps) {
        requestBody.steps = options.steps;
      }
      if (options.cfgScale) {
        requestBody.cfg_scale = options.cfgScale;
      }
      if (options.seed !== undefined) {
        requestBody.seed = options.seed;
      }

      const response = await this.client.post('/images/generations', requestBody, {
        timeout: 300000 // 5 minutes for image generation
      });

      const responseTime = Date.now() - startTime;
      console.log(`[CreativeServerProvider] Image generated in ${responseTime}ms (${(responseTime/1000).toFixed(1)}s)`);

      const imageB64 = response.data.data[0].b64_json;

      return {
        success: true,
        imageData: imageB64,
        metadata: {
          prompt: prompt,
          size: requestBody.size,
          steps: requestBody.steps || 20,
          seed: requestBody.seed
        }
      };

    } catch (error: any) {
      const errorTime = Date.now() - startTime;
      console.error(`[CreativeServerProvider] Image generation failed after ${errorTime}ms:`, error.message);

      return {
        success: false,
        error: error.message
      };
    }
  }

  async switchModel(newModel: string): Promise<void> {
    console.log(`[CreativeServerProvider] Switching from ${this.currentModel} to ${newModel}`);
    this.currentModel = newModel;
    console.log(`[CreativeServerProvider] Model switched to: ${newModel}`);
  }

  getModelInfo(): ModelCapabilities {
    return {
      name: this.currentModel,
      contextWindow: this.config.contextWindow,
      supportsSystemMessages: true,
      supportsTools: false, // Could be added if needed
      maxTokensPerSecond: 8.5, // ~114ms/token based on specs
      modelSize: '70B parameters (Q5_K_M quantization)'
    };
  }

  async isAvailable(): Promise<boolean> {
    return await this.isServerAvailable();
  }

  async shutdown(): Promise<void> {
    console.log('[CreativeServerProvider] Shutting down...');
    this.isReady = false;
  }

  // Private helper methods

  private async isServerAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.config.baseUrl.replace('/v1', '')}/health`, {
        timeout: 5000
      });
      return response.data.status === 'healthy';
    } catch {
      return false;
    }
  }

  private async ensureCreativeSetActive(): Promise<void> {
    try {
      // Check current working set
      const response = await this.adminClient.get('/sets');
      const currentSet = response.data.current;

      if (currentSet !== 'creative') {
        console.log(`[CreativeServerProvider] Switching from "${currentSet}" to "creative" working set...`);

        await this.adminClient.post('/sets/switch', {
          target_set: 'creative'
        });

        console.log('[CreativeServerProvider] Waiting 60s for models to load...');
        await new Promise(resolve => setTimeout(resolve, 60000));

        console.log('[CreativeServerProvider] Creative working set is now active');
      } else {
        console.log('[CreativeServerProvider] Creative working set already active');
      }
    } catch (error: any) {
      console.error('[CreativeServerProvider] Failed to switch working set:', error.message);
      throw new Error('Could not activate creative working set. Is the admin API available?');
    }
  }

  private formatPromptToMessages(prompt: LLMPrompt): any[] {
    const messages: any[] = [];

    // System message with context
    if (prompt.systemContext) {
      messages.push({
        role: 'system',
        content: prompt.systemContext
      });
    }

    // Build context message
    let contextContent = '';

    // World state
    if (prompt.worldState) {
      contextContent += `CURRENT SITUATION:\n`;
      contextContent += `Location: ${prompt.worldState.currentRoomName || 'Unknown Location'}\n`;
      contextContent += `Description: ${prompt.worldState.roomDescription || 'An unremarkable location.'}\n`;

      if (prompt.worldState.presentNPCs?.length > 0) {
        contextContent += `\nCHARACTERS PRESENT:\n`;
        for (const npc of prompt.worldState.presentNPCs) {
          contextContent += `- ${npc.name}: ${npc.description}\n`;
        }
      }

      if (prompt.worldState.visibleItems?.length > 0) {
        contextContent += `Visible items: ${prompt.worldState.visibleItems.join(', ')}\n`;
      }

      contextContent += '\n';
    }

    // Recent history (use full history provided - controller manages the limit)
    if (prompt.recentHistory.length > 0) {
      contextContent += `RECENT EVENTS:\n`;
      const recentEvents = prompt.recentHistory
        .map(event => `- ${event.description}`)
        .join('\n');
      contextContent += recentEvents + '\n\n';
    }

    // Available actions
    if (prompt.availableActions.length > 0) {
      contextContent += `AVAILABLE ACTIONS:\n`;
      const actions = prompt.availableActions
        .map(action => `- ${action.name}: ${action.description}`)
        .join('\n');
      contextContent += actions + '\n\n';
    }

    if (contextContent) {
      messages.push({
        role: 'user',
        content: contextContent
      });
    }

    // The actual query
    messages.push({
      role: 'user',
      content: prompt.query + '\n\nRespond with vivid, immersive narrative. Include dialogue if NPCs speak. Describe sensory details and atmosphere.'
    });

    return messages;
  }

  private parseResponse(rawResponse: string, originalPrompt: LLMPrompt): LLMResponse {
    // Parse the response for narrative elements
    let narrative = rawResponse;
    let dialogue: string | undefined;
    let mood = 'neutral';

    // Extract dialogue if present (quoted text)
    const dialogueMatches = rawResponse.match(/"([^"]+)"/g);
    if (dialogueMatches && dialogueMatches.length > 0) {
      dialogue = dialogueMatches.map(match => match.replace(/"/g, '')).join(' ');
    }

    // Detect mood from content
    const lowerResponse = rawResponse.toLowerCase();
    if (lowerResponse.includes('danger') || lowerResponse.includes('threat') || lowerResponse.includes('tense')) {
      mood = 'tense';
    } else if (lowerResponse.includes('peaceful') || lowerResponse.includes('calm') || lowerResponse.includes('serene')) {
      mood = 'relaxed';
    } else if (lowerResponse.includes('mysterious') || lowerResponse.includes('strange') || lowerResponse.includes('eerie')) {
      mood = 'mysterious';
    } else if (lowerResponse.includes('combat') || lowerResponse.includes('fight') || lowerResponse.includes('battle')) {
      mood = 'action';
    }

    return {
      narrative: narrative.trim(),
      dialogue,
      actions: [],
      mood,
      nextPrompts: []
    };
  }
}
