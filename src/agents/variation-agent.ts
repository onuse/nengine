/**
 * Variation Agent
 * Generates multiple narrative responses with different approaches
 */

import { BaseAgent, BaseAgentConfig } from './base-agent';
import { AgentInput, AgentOutput, VariationOutput } from './types';
import { LLMPrompt } from '../llm/types';

export interface VariationAgentConfig extends BaseAgentConfig {
  variationCount?: number;
}

export class VariationAgent extends BaseAgent {
  private variationCount: number;

  constructor(config: VariationAgentConfig = {}) {
    super('variation-agent', 'variation', {
      model: config.model || 'gemma2:3b',
      temperature: config.temperature || 0.9,
      ...config
    });
    
    this.variationCount = config.variationCount || 3;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    
    try {
      if (!this.validateInput(input)) {
        return {
          success: false,
          content: null,
          error: 'Invalid input provided'
        };
      }

      console.log(`[${this.id}] Generating ${this.variationCount} narrative variations...`);
      global.statusBroadcaster?.broadcast(`📝 Writing sensory-focused narrative...`);
      console.log(`[${this.id}] DEBUG: input.context is:`, input.context ? 'valid object' : 'null/undefined');
      if (input.context) {
        console.log(`[${this.id}] DEBUG: currentRoomName =`, input.context.currentRoomName);
      }

      const variations = await this.generateVariations(input);
      
      if (variations.length === 0) {
        throw new Error('No variations generated');
      }

      const duration = Date.now() - startTime;
      
      const result: VariationOutput = {
        proposals: variations,
        approaches: this.getApproachLabels(),
        confidence: this.calculateConfidence(variations)
      };

      console.log(`[${this.id}] Generated ${variations.length} variations in ${duration}ms`);

      return {
        success: true,
        content: result,
        metadata: {
          model: this.model,
          duration,
          confidence: result.confidence
        }
      };

    } catch (error) {
      console.error(`[${this.id}] Variation generation failed:`, error);
      return {
        success: false,
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async generateVariations(input: AgentInput): Promise<string[]> {
    const approaches = this.buildApproachPrompts(input);
    const approachNames = ['🌅 sensory', '⚡ action', '💭 emotional'];
    
    try {
      const variations = await Promise.all(
        approaches.map((prompt, index) => {
          global.statusBroadcaster?.broadcast(`✍️ Crafting ${approachNames[index]} narrative...`);
          return this.callLLM(prompt);
        })
      );
      
      return variations.filter(v => v && v.trim().length > 0);
    } catch (error) {
      console.warn(`[${this.id}] Parallel generation failed, trying sequential...`);
      
      const variations: string[] = [];
      for (const prompt of approaches) {
        try {
          const variation = await this.callLLM(prompt);
          if (variation && variation.trim().length > 0) {
            variations.push(variation);
          }
        } catch (e) {
          console.warn(`[${this.id}] Single variation failed:`, e);
        }
      }
      
      return variations;
    }
  }

  private buildApproachPrompts(input: AgentInput): LLMPrompt[] {
    const baseContext = this.buildBaseContext(input);
    const actionDescription = this.describeAction(input);
    const mechanicalInfo = this.formatMechanicalResults(input);
    const worldState = input.context;

    return [
      this.buildSensoryPrompt(baseContext, actionDescription, mechanicalInfo, worldState),
      this.buildActionPrompt(baseContext, actionDescription, mechanicalInfo, worldState),
      this.buildEmotionalPrompt(baseContext, actionDescription, mechanicalInfo, worldState)
    ];
  }

  private buildBaseContext(input: AgentInput): string {
    let context = '';
    
    if (input.context) {
      context += `Location: ${input.context.currentRoomName}\n`;
      context += `Description: ${input.context.roomDescription}\n`;
      
      if (input.context.presentNPCs.length > 0) {
        context += `Present: ${input.context.presentNPCs.map(npc => npc.name).join(', ')}\n`;
      }
      
      if (input.context.visibleItems.length > 0) {
        context += `Items visible: ${input.context.visibleItems.join(', ')}\n`;
      }
      
      if (input.context.environment) {
        const env = input.context.environment;
        if (env.lighting !== 'normal') context += `Lighting: ${env.lighting}\n`;
        if (env.sounds.length > 0) context += `Sounds: ${env.sounds.join(', ')}\n`;
        if (env.smells.length > 0) context += `Smells: ${env.smells.join(', ')}\n`;
      }
    }
    
    return context;
  }

  private describeAction(input: AgentInput): string {
    const action = input.action;
    return `Player action: "${action.rawInput}" (${action.type})`;
  }

  private formatMechanicalResults(input: AgentInput): string {
    if (!input.mechanicalResults) return '';
    
    let results = '';
    
    if (input.mechanicalResults.skillCheck) {
      const check = input.mechanicalResults.skillCheck;
      results += `Skill check: ${check.success ? 'SUCCESS' : 'FAILURE'} (${check.roll?.total || 0} vs DC ${check.difficulty})\n`;
    }
    
    if (input.mechanicalResults.combat) {
      const combat = input.mechanicalResults.combat;
      results += `Combat: ${combat.hit ? 'HIT' : 'MISS'}${combat.damage ? ` for ${combat.damage} damage` : ''}\n`;
    }
    
    if (input.mechanicalResults.movement) {
      const movement = input.mechanicalResults.movement;
      results += `Movement: ${movement.success ? 'SUCCESS' : 'BLOCKED'} - ${movement.message}\n`;
    }
    
    return results;
  }

  private buildSensoryPrompt(context: string, action: string, mechanical: string, worldState: any): LLMPrompt {
    return {
      systemContext: this.buildSystemPrompt('Focus on sensory details - what the player sees, hears, feels, smells. Be vivid and immersive.'),
      worldState: this.createFallbackWorldState(worldState),
      recentHistory: [],
      availableActions: [],
      query: `${context}\n${action}\n${mechanical}

Generate a sensory-focused narrative response. Emphasize:
- Visual details and atmosphere
- Sounds and ambient noise  
- Tactile sensations
- Smells and tastes if relevant
- Environmental mood

Keep it engaging and immersive. Do not use generic phrases.`
    };
  }

  private buildActionPrompt(context: string, action: string, mechanical: string, worldState: any): LLMPrompt {
    return {
      systemContext: this.buildSystemPrompt('Focus on action and movement - dynamic descriptions of what happens.'),
      worldState: this.createFallbackWorldState(worldState),
      recentHistory: [],
      availableActions: [],
      query: `${context}\n${action}\n${mechanical}

Generate an action-focused narrative response. Emphasize:
- Dynamic movement and activity
- Cause and effect sequences
- Physical interactions
- Immediate consequences
- Forward momentum

Keep it energetic and engaging. Vary your sentence structure.`
    };
  }

  private buildEmotionalPrompt(context: string, action: string, mechanical: string, worldState: any): LLMPrompt {
    return {
      systemContext: this.buildSystemPrompt('Focus on emotion and character psychology - inner thoughts and feelings.'),
      worldState: this.createFallbackWorldState(worldState),
      recentHistory: [],
      availableActions: [],
      query: `${context}\n${action}\n${mechanical}

Generate an emotion-focused narrative response. Emphasize:
- Character feelings and motivations
- Psychological state
- Emotional reactions
- Inner thoughts and concerns
- Character relationships

Keep it psychologically rich and meaningful. Avoid cliches.`
    };
  }

  private getApproachLabels(): string[] {
    return ['sensory', 'action', 'emotional'];
  }

  private calculateConfidence(variations: string[]): number {
    if (variations.length === 0) return 0;
    if (variations.length < this.variationCount) return 0.5;
    
    const avgLength = variations.reduce((sum, v) => sum + v.length, 0) / variations.length;
    const lengthScore = Math.min(1, avgLength / 200); // Assume 200 chars is good length
    
    const uniquenessScore = this.calculateUniqueness(variations);
    
    return (lengthScore + uniquenessScore) / 2;
  }

  private calculateUniqueness(variations: string[]): number {
    if (variations.length <= 1) return 1;
    
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (let i = 0; i < variations.length; i++) {
      for (let j = i + 1; j < variations.length; j++) {
        totalSimilarity += this.calculateSimilarity(variations[i], variations[j]);
        comparisons++;
      }
    }
    
    const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;
    return 1 - avgSimilarity; // Higher uniqueness = lower similarity
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  protected createFallbackWorldState(worldState: any): any {
    if (worldState) {
      return worldState;
    }
    
    return {
      currentRoomName: 'Unknown Location',
      roomDescription: 'The details of this place are unclear.',
      presentNPCs: [],
      visibleItems: [],
      environment: {
        lighting: 'normal',
        sounds: [],
        smells: []
      }
    };
  }
}