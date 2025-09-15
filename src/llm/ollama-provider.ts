/**
 * Ollama LLM Provider
 * Handles Ollama integration with auto-download and model management
 */

import axios, { AxiosInstance } from 'axios';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
  LLMProvider, 
  LLMPrompt, 
  LLMResponse, 
  ModelCapabilities,
  WorldContext,
  Event
} from './types';

export interface OllamaConfig {
  host: string;
  port: number;
  model: string;
  fallbackModel: string;
  temperature: number;
  contextWindow: number;
  autoDownload: boolean;
  ollamaPath?: string;
}

export class OllamaProvider implements LLMProvider {
  private config: OllamaConfig;
  private client: AxiosInstance;
  private ollamaProcess: ChildProcess | null = null;
  private isReady: boolean = false;
  private currentModel: string;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = {
      host: 'localhost',
      port: 11434,
      model: 'gemma2:9b',
      fallbackModel: 'mistral:7b',
      temperature: 0.7,
      contextWindow: 8192,
      autoDownload: true,
      ...config
    };

    this.currentModel = this.config.model;
    this.client = axios.create({
      baseURL: `http://${this.config.host}:${this.config.port}`,
      timeout: 120000 // 2 minutes for model downloads
    });
  }

  async initialize(modelPath?: string): Promise<void> {
    console.log('[OllamaProvider] Initializing Ollama integration...');

    try {
      // Check if Ollama is already running
      const isRunning = await this.isOllamaRunning();
      if (!isRunning) {
        console.log('[OllamaProvider] Ollama not accessible, attempting to start or install...');
        if (this.config.autoDownload) {
          await this.downloadAndStartOllama();
        } else {
          throw new Error('Ollama is not running and auto-download is disabled');
        }
      } else {
        console.log('[OllamaProvider] Ollama is already running');
      }

      // Ensure the model is available
      await this.ensureModelAvailable(this.currentModel);

      this.isReady = true;
      console.log(`[OllamaProvider] Ready with model: ${this.currentModel}`);

    } catch (error) {
      console.error('[OllamaProvider] Initialization failed:', error);
      
      // Try fallback model
      if (this.currentModel !== this.config.fallbackModel) {
        console.log(`[OllamaProvider] Trying fallback model: ${this.config.fallbackModel}`);
        this.currentModel = this.config.fallbackModel;
        await this.ensureModelAvailable(this.currentModel);
        this.isReady = true;
      } else {
        throw error;
      }
    }
  }

  async complete(prompt: LLMPrompt): Promise<LLMResponse> {
    if (!this.isReady) {
      throw new Error('OllamaProvider not initialized');
    }

    const formattedPrompt = this.formatPrompt(prompt);
    const startTime = Date.now();
    
    try {
      console.log(`[OllamaProvider] Generating response with ${this.currentModel}...`);
      const response = await this.client.post('/api/generate', {
        model: this.currentModel,
        prompt: formattedPrompt,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_ctx: this.config.contextWindow
        }
      });

      const responseTime = Date.now() - startTime;
      console.log(`[OllamaProvider] Response generated in ${responseTime}ms (${(responseTime/1000).toFixed(1)}s)`);

      return this.parseResponse(response.data.response, prompt);

    } catch (error: any) {
      const errorTime = Date.now() - startTime;
      console.error(`[OllamaProvider] Generation failed after ${errorTime}ms (${(errorTime/1000).toFixed(1)}s):`, error.message);
      
      // Try fallback model if current model fails
      if (this.currentModel !== this.config.fallbackModel) {
        console.log('[OllamaProvider] Trying fallback model...');
        const oldModel = this.currentModel;
        await this.switchModel(this.config.fallbackModel);
        
        try {
          return await this.complete(prompt);
        } catch (fallbackError) {
          // Restore original model and rethrow
          this.currentModel = oldModel;
          throw error;
        }
      }
      
      throw error;
    }
  }

  async switchModel(newModel: string): Promise<void> {
    console.log(`[OllamaProvider] Switching from ${this.currentModel} to ${newModel}`);
    
    await this.ensureModelAvailable(newModel);
    this.currentModel = newModel;
    
    console.log(`[OllamaProvider] Model switched to: ${newModel}`);
  }

  getModelInfo(): ModelCapabilities {
    return {
      name: this.currentModel,
      contextWindow: this.config.contextWindow,
      supportsSystemMessages: true,
      supportsTools: false, // Ollama doesn't support tool calling yet
      maxTokensPerSecond: 50, // Estimated
      modelSize: this.getModelSize(this.currentModel)
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.get('/api/tags');
      return true;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    console.log('[OllamaProvider] Shutting down...');
    
    if (this.ollamaProcess) {
      this.ollamaProcess.kill('SIGTERM');
      this.ollamaProcess = null;
    }
    
    this.isReady = false;
  }

  // Private methods
  private async isOllamaRunning(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/tags');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private async downloadAndStartOllama(): Promise<void> {
    console.log('[OllamaProvider] Downloading and starting Ollama...');
    
    // Check if ollama binary exists
    const ollamaPath = this.config.ollamaPath || await this.findOllamaPath();
    
    if (!fs.existsSync(ollamaPath)) {
      await this.downloadOllama();
    }

    // Start Ollama service
    await this.startOllamaService();
    
    // Wait for service to be ready
    await this.waitForOllamaReady();
  }

  private async findOllamaPath(): Promise<string> {
    const possiblePaths = [
      '/usr/local/bin/ollama',
      '/usr/bin/ollama',
      path.join(os.homedir(), '.local/bin/ollama'),
      'ollama' // Try global PATH
    ];

    for (const ollamaPath of possiblePaths) {
      try {
        if (fs.existsSync(ollamaPath)) {
          return ollamaPath;
        }
      } catch {
        // Continue to next path
      }
    }

    return 'ollama'; // Default to PATH lookup
  }

  private async downloadOllama(): Promise<void> {
    console.log('[OllamaProvider] Downloading Ollama binary...');
    
    const platform = os.platform();
    const arch = os.arch();
    
    let downloadUrl: string;
    let fileName: string;
    
    if (platform === 'darwin') {
      downloadUrl = 'https://github.com/ollama/ollama/releases/latest/download/ollama-darwin';
      fileName = 'ollama';
    } else if (platform === 'linux') {
      downloadUrl = 'https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64';
      fileName = 'ollama';
    } else if (platform === 'win32') {
      downloadUrl = 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.exe';
      fileName = 'ollama.exe';
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const installDir = path.join(os.homedir(), '.nengine', 'ollama');
    const ollamaPath = path.join(installDir, fileName);
    
    // Create install directory
    fs.mkdirSync(installDir, { recursive: true });
    
    // Download binary
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(ollamaPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        // Make executable on Unix systems
        if (platform !== 'win32') {
          fs.chmodSync(ollamaPath, 0o755);
        }
        
        this.config.ollamaPath = ollamaPath;
        console.log(`[OllamaProvider] Ollama downloaded to: ${ollamaPath}`);
        resolve();
      });
      
      writer.on('error', reject);
    });
  }

  private async startOllamaService(): Promise<void> {
    const ollamaPath = this.config.ollamaPath || 'ollama';
    
    console.log(`[OllamaProvider] Starting Ollama service: ${ollamaPath}`);
    
    this.ollamaProcess = spawn(ollamaPath, ['serve'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OLLAMA_HOST: `${this.config.host}:${this.config.port}`
      }
    });

    this.ollamaProcess.on('error', (error) => {
      console.error('[OllamaProvider] Ollama process error:', error);
    });

    this.ollamaProcess.on('exit', (code) => {
      console.log(`[OllamaProvider] Ollama process exited with code: ${code}`);
      this.ollamaProcess = null;
    });

    // Log output in debug mode
    if (process.env.DEBUG_MODE === 'true') {
      this.ollamaProcess.stdout?.on('data', (data) => {
        console.log(`[Ollama] ${data.toString().trim()}`);
      });

      this.ollamaProcess.stderr?.on('data', (data) => {
        console.error(`[Ollama Error] ${data.toString().trim()}`);
      });
    }
  }

  private async waitForOllamaReady(): Promise<void> {
    const maxAttempts = 30; // 30 seconds
    let attempts = 0;

    while (attempts < maxAttempts) {
      if (await this.isOllamaRunning()) {
        console.log('[OllamaProvider] Ollama service is ready');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error('Ollama service failed to start within 30 seconds');
  }

  private async ensureModelAvailable(modelName: string): Promise<void> {
    try {
      // Check if model is already downloaded
      const response = await this.client.get('/api/tags');
      const models = response.data.models || [];
      
      const modelExists = models.some((model: any) => 
        model.name === modelName || model.name.startsWith(modelName + ':')
      );

      if (modelExists) {
        console.log(`[OllamaProvider] Model ${modelName} is available`);
        return;
      }

      // Download the model
      console.log(`[OllamaProvider] Downloading model: ${modelName}`);
      
      const pullResponse = await this.client.post('/api/pull', 
        { name: modelName },
        { 
          timeout: 600000, // 10 minutes for large models
          responseType: 'stream'
        }
      );

      // Stream the download progress
      pullResponse.data.on('data', (chunk: Buffer) => {
        try {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            const data = JSON.parse(line);
            if (data.status) {
              console.log(`[OllamaProvider] ${data.status}`);
            }
          }
        } catch {
          // Ignore JSON parsing errors in streaming response
        }
      });

      return new Promise((resolve, reject) => {
        pullResponse.data.on('end', () => {
          console.log(`[OllamaProvider] Model ${modelName} downloaded successfully`);
          resolve();
        });

        pullResponse.data.on('error', (error: any) => {
          console.error(`[OllamaProvider] Model download failed:`, error);
          reject(error);
        });
      });

    } catch (error: any) {
      console.error(`[OllamaProvider] Failed to ensure model availability:`, error.message);
      throw error;
    }
  }

  private formatPrompt(prompt: LLMPrompt): string {
    const parts: string[] = [];

    // System context
    if (prompt.systemContext) {
      parts.push(`SYSTEM: ${prompt.systemContext}`);
    }

    // World state
    if (prompt.worldState) {
      parts.push(`\nCURRENT SITUATION:`);
      parts.push(`Location: ${prompt.worldState.currentRoomName || 'Unknown Location'}`);
      parts.push(`Description: ${prompt.worldState.roomDescription || 'An unremarkable location.'}`);
      
      if (prompt.worldState.presentNPCs?.length > 0) {
        parts.push(`Present NPCs: ${prompt.worldState.presentNPCs.map(npc => npc.name).join(', ')}`);
      }
      
      if (prompt.worldState.visibleItems?.length > 0) {
        parts.push(`Visible items: ${prompt.worldState.visibleItems.join(', ')}`);
      }
    } else {
      parts.push(`\nCURRENT SITUATION:`);
      parts.push(`Location: Unknown`);
      parts.push(`Description: The world around you is unclear.`);
    }

    // Recent history
    if (prompt.recentHistory.length > 0) {
      parts.push(`\nRECENT EVENTS:`);
      const recentEvents = prompt.recentHistory
        .slice(-5) // Last 5 events
        .map(event => `- ${event.description}`)
        .join('\n');
      parts.push(recentEvents);
    }

    // Available actions
    if (prompt.availableActions.length > 0) {
      parts.push(`\nAVAILABLE ACTIONS:`);
      const actions = prompt.availableActions
        .map(action => `- ${action.name}: ${action.description}`)
        .join('\n');
      parts.push(actions);
    }

    // The query/request
    parts.push(`\n${prompt.query}`);
    
    parts.push(`\nRespond with vivid, immersive narrative. Include dialogue if NPCs speak. Describe sensory details and atmosphere.`);

    return parts.join('\n');
  }

  private parseResponse(rawResponse: string, originalPrompt: LLMPrompt): LLMResponse {
    // Simple response parsing - in a full implementation, this would be more sophisticated
    const lines = rawResponse.split('\n').filter(Boolean);
    
    let narrative = rawResponse;
    let dialogue: string | undefined;
    let actions: string[] = [];
    let mood = 'neutral';

    // Extract dialogue if present (simple heuristic)
    const dialogueMatch = rawResponse.match(/"([^"]+)"/g);
    if (dialogueMatch && dialogueMatch.length > 0) {
      dialogue = dialogueMatch[0].replace(/"/g, '');
      narrative = rawResponse.replace(dialogueMatch[0], '').trim();
    }

    // Detect mood from content (simple heuristics)
    const lowerResponse = rawResponse.toLowerCase();
    if (lowerResponse.includes('danger') || lowerResponse.includes('threat')) {
      mood = 'tense';
    } else if (lowerResponse.includes('peaceful') || lowerResponse.includes('calm')) {
      mood = 'relaxed';
    } else if (lowerResponse.includes('mysterious') || lowerResponse.includes('strange')) {
      mood = 'mysterious';
    } else if (lowerResponse.includes('combat') || lowerResponse.includes('fight')) {
      mood = 'action';
    }

    return {
      narrative: narrative.trim(),
      dialogue,
      actions,
      mood,
      nextPrompts: [] // Could generate suggested player responses
    };
  }

  private getModelSize(modelName: string): string {
    // Model size heuristics based on name
    if (modelName.includes('9b')) return '9B parameters';
    if (modelName.includes('7b')) return '7B parameters';
    if (modelName.includes('13b')) return '13B parameters';
    if (modelName.includes('3b')) return '3B parameters';
    if (modelName.includes('1b')) return '1B parameters';
    return 'Unknown size';
  }
}