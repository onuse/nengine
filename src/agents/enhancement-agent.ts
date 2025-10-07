/**
 * Enhancement Agent
 * Post-processes selected narratives to add progressive revelation and continuity
 */

import { BaseAgent, BaseAgentConfig } from './base-agent';
import { AgentInput, AgentOutput } from './types';
import { LLMPrompt } from '../llm/types';

export interface EnhancementAgentConfig extends BaseAgentConfig {
  // Enhancement-specific configuration
}

export class EnhancementAgent extends BaseAgent {
  constructor(config: EnhancementAgentConfig = {}) {
    super('enhancement-agent', 'enhancement', {
      model: config.model || 'MHKetbi/Unsloth_gemma3-12b-it:q4_K_M',
      temperature: config.temperature || 0.7,
      ...config
    });
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

      // Extract the selected narrative to enhance
      const selectedNarrative = input.context?.selectedNarrative;
      if (!selectedNarrative) {
        return {
          success: false,
          content: null,
          error: 'No selected narrative provided for enhancement'
        };
      }

      console.log(`[${this.id}] Enhancing selected narrative...`);
      global.statusBroadcaster?.broadcast(`🎨 Enhancing narrative with progressive details...`);

      const enhanced = await this.enhanceNarrative(selectedNarrative, input);
      const duration = Date.now() - startTime;

      console.log(`[${this.id}] Enhancement completed in ${duration}ms`);

      return {
        success: true,
        content: enhanced,
        metadata: {
          model: this.model,
          duration,
          confidence: 0.9 // Enhancement typically high confidence
        }
      };

    } catch (error) {
      console.error(`[${this.id}] Enhancement failed:`, error);
      return {
        success: false,
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async enhanceNarrative(narrative: string, input: AgentInput): Promise<string> {
    const prompt = this.buildEnhancementPrompt(narrative, input);
    const enhanced = await this.callLLM(prompt);

    // Fallback to original if enhancement failed
    return enhanced?.trim() || narrative;
  }

  private buildEnhancementPrompt(narrative: string, input: AgentInput): LLMPrompt {
    const history = input.recentHistory || [];
    const action = input.action;

    let historyContext = '';
    if (history.length > 0) {
      historyContext = `Previous events:\n${history.slice(-2).map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\n`;
    }

    return {
      systemContext: this.buildSystemPrompt('Enhance narrative with progressive revelation and mystery elements.'),
      worldState: this.createFallbackWorldState(input.context),
      recentHistory: history,
      availableActions: [],
      query: `${historyContext}Current player action: "${action.rawInput}"

Selected narrative to enhance:
"${narrative}"

ENHANCEMENT GOALS:
- Add ONE meaningful detail that builds on previous events (if any)
- Create subtle progression or escalation from recent history
- Include actionable mystery elements (clues, opportunities, tensions)
- Maintain the same word count and structure
- Preserve the original tone and "What do you do?" ending

ENHANCEMENT TYPES (choose most appropriate):
1. Progressive Detail: Build on something mentioned before
2. Escalating Tension: Increase urgency subtly
3. Mystery Element: Add a meaningful clue or unusual detail
4. Environmental Evolution: Show how the scene has changed

Enhanced narrative (same length, improved continuity and intrigue):`
    };
  }

  private createFallbackWorldState(worldState: any): any {
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

  validateInput(input: AgentInput): boolean {
    return super.validateInput(input) && input.context?.selectedNarrative !== undefined;
  }
}