/**
 * Base Agent Class
 * Foundation for all agent implementations
 */

import { Agent, AgentInput, AgentOutput, AgentRole } from './types';
import { OllamaProvider } from '../llm/ollama-provider';
import { LLMPrompt } from '../llm/types';

export interface BaseAgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export abstract class BaseAgent implements Agent {
  id: string;
  role: AgentRole;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  
  protected llmProvider: OllamaProvider;
  protected initialized: boolean = false;

  constructor(id: string, role: AgentRole, config: BaseAgentConfig = {}) {
    this.id = id;
    this.role = role;
    this.model = config.model || 'gemma2:3b';
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 2048;
    this.timeoutMs = config.timeoutMs || 10000;
    
    this.llmProvider = new OllamaProvider({
      model: this.model,
      temperature: this.temperature,
      contextWindow: this.maxTokens,
      autoDownload: false
    });
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      try {
        await this.llmProvider.initialize();
        this.initialized = true;
        console.log(`[${this.id}] Agent initialized with model: ${this.model}`);
      } catch (error) {
        console.error(`[${this.id}] Failed to initialize:`, error);
        throw error;
      }
    }
  }

  abstract execute(input: AgentInput): Promise<AgentOutput>;
  
  validateInput(input: AgentInput): boolean {
    return input.action !== undefined && input.action.rawInput !== undefined;
  }

  protected async callLLM(prompt: LLMPrompt): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const startTime = Date.now();
      const response = await this.llmProvider.complete(prompt);
      const duration = Date.now() - startTime;
      
      console.log(`[${this.id}] LLM call completed in ${duration}ms`);
      return response.narrative || response.dialogue || '';
    } catch (error) {
      console.error(`[${this.id}] LLM call failed:`, error);
      throw error;
    }
  }

  protected buildSystemPrompt(additionalContext?: string): string {
    let prompt = `You are a ${this.role} agent in a text adventure game.
ABSOLUTE RULES:
- MAXIMUM 80 words per response
- NEVER control the player character
- NEVER use "you do/move/feel/decide"
- Describe ONLY what the player observes
- Always end with "What do you do?"`;

    if (additionalContext) {
      prompt += ` ${additionalContext}`;
    }

    return prompt;
  }

  protected extractVariants(text: string, pattern: RegExp = /VARIANT_(\d+):\s*(.+?)(?=VARIANT_|$)/gs): string[] {
    const variants: string[] = [];
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      const content = match[2].trim();
      if (content) {
        variants.push(content);
      }
    }
    
    return variants.length > 0 ? variants : [text.trim()];
  }

  protected parseScores(text: string): any {
    const scores: any = {};
    const patterns = {
      novelty: /(?:NOVELTY|NOVEL):\s*(\d+)/i,
      coherence: /COHERENCE:\s*(\d+)/i,
      appropriateness: /(?:APPROPRIATE|APPROPRIATENESS):\s*(\d+)/i,
      variety: /VARIETY:\s*(\d+)/i
    };
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        scores[key] = Math.min(10, Math.max(0, parseInt(match[1])));
      }
    }
    
    return scores;
  }

  async shutdown(): Promise<void> {
    if (this.initialized && this.llmProvider) {
      await this.llmProvider.shutdown();
      this.initialized = false;
      console.log(`[${this.id}] Agent shut down`);
    }
  }
}