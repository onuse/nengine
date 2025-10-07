/**
 * Agent Orchestrator
 * Coordinates the agent pipeline: Variation → Evaluation → Selection
 */

import { VariationAgent } from './variation-agent';
import { NoveltyScorer } from './novelty-scorer';
import { EnhancementAgent } from './enhancement-agent';
import { AgentConfig, AgentMetrics } from './types';
import { PlayerAction, NarrativeResult } from '../llm/narrative-controller';
import { WorldContext } from '../llm/types';
import { MCPServerManager } from '../mcp/mcp-server-manager';

// Global status broadcaster for live UI updates
declare global {
  var statusBroadcaster: {
    broadcast: (status: string, details?: any) => void;
  } | undefined;
}

export interface OrchestrationResult {
  success: boolean;
  narrative: string;
  dialogue?: string;
  metadata: {
    agentGenerated: boolean;
    selectedIndex?: number;
    scores?: any;
    variationCount?: number;
    totalDuration?: number;
    fallbackReason?: string;
  };
}

export class AgentOrchestrator {
  private variationAgent: VariationAgent;
  private noveltyScorer: NoveltyScorer;
  private enhancementAgent: EnhancementAgent;
  private config: AgentConfig;
  private metrics: AgentMetrics;
  private mcpManager: MCPServerManager;
  private fallbackHandler: (action: PlayerAction, context: WorldContext, mechanicalResults?: any) => Promise<NarrativeResult>;

  constructor(
    mcpManager: MCPServerManager,
    fallbackHandler: (action: PlayerAction, context: WorldContext, mechanicalResults?: any) => Promise<NarrativeResult>,
    config: Partial<AgentConfig> = {}
  ) {
    this.mcpManager = mcpManager;
    this.fallbackHandler = fallbackHandler;
    const defaultConfig = {
      enabled: true,
      fallbackOnError: true,
      timeoutMs: 600000,  // 10 minutes - disabled for testing
      maxRetries: 1,
      variation: {
        model: 'MHKetbi/Unsloth_gemma3-12b-it:q4_K_M',  // 12B for quality
        temperature: 0.9,
        variationCount: 2  // Reduced for 12B model performance
      },
      evaluation: {
        model: 'MHKetbi/Unsloth_gemma3-12b-it:q4_K_M',  // 12B for quality
        temperature: 0.2,
        minScore: 6.0
      }
    };
    
    this.config = {
      ...defaultConfig,
      ...config,
      variation: {
        ...defaultConfig.variation,
        ...config.variation
      },
      evaluation: {
        ...defaultConfig.evaluation,
        ...config.evaluation
      }
    };

    this.variationAgent = new VariationAgent({
      model: this.config.variation.model,
      temperature: this.config.variation.temperature,
      variationCount: this.config.variation.variationCount,
      timeoutMs: this.config.timeoutMs
    });

    this.noveltyScorer = new NoveltyScorer({
      model: this.config.evaluation.model,
      temperature: this.config.evaluation.temperature,
      minScore: this.config.evaluation.minScore,
      timeoutMs: this.config.timeoutMs
    });

    this.enhancementAgent = new EnhancementAgent({
      model: this.config.variation.model, // Use same model as variation for consistency
      temperature: 0.7, // Slightly creative for enhancement
      timeoutMs: this.config.timeoutMs
    });

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      fallbackRequests: 0,
      avgResponseTime: 0,
      avgNoveltyScore: 0,
      regenerationCount: 0
    };
  }

  async initialize(): Promise<void> {
    console.log('[AgentOrchestrator] Initializing agents...');
    
    try {
      await Promise.all([
        this.variationAgent.initialize(),
        this.noveltyScorer.initialize(),
        this.enhancementAgent.initialize()
      ]);
      
      console.log('[AgentOrchestrator] All agents initialized successfully');
    } catch (error) {
      console.error('[AgentOrchestrator] Agent initialization failed:', error);
      throw error;
    }
  }

  async processAction(
    action: PlayerAction,
    context: WorldContext,
    mechanicalResults?: any
  ): Promise<OrchestrationResult> {
    if (!this.config.enabled) {
      return this.fallback('Agent system disabled', action, context, mechanicalResults);
    }

    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      console.log(`[AgentOrchestrator] Processing action: ${action.type} - "${action.rawInput}"`);
      console.log(`[AgentOrchestrator] DEBUG: context is:`, context ? 'valid object' : 'null/undefined');
      console.log(`[AgentOrchestrator] DEBUG: using timeout ${this.config.timeoutMs}ms`);
      if (context) {
        console.log(`[AgentOrchestrator] DEBUG: currentRoomName =`, context.currentRoomName);
      }
      
      // Broadcast status to UI
      global.statusBroadcaster?.broadcast('🧠 Initializing multi-agent narrative system...');

      // Fetch recent narrative history for continuity
      const recentHistory = await this.getRecentHistory();
      
      // Phase 1: Generate variations
      global.statusBroadcaster?.broadcast(`🎭 Generating ${this.config.variation.variationCount} narrative variations...`);
      const variationResult = await this.executeWithTimeout(
        this.variationAgent.execute({
          action,
          context,
          mechanicalResults,
          recentHistory
        }),
        this.config.timeoutMs,
        'Variation generation timed out'
      );

      if (!variationResult.success) {
        return this.fallback('Variation generation failed', action, context, mechanicalResults, variationResult.error);
      }

      const variations = variationResult.content.proposals;
      console.log(`[AgentOrchestrator] Generated ${variations.length} variations`);
      global.statusBroadcaster?.broadcast(`✨ Generated ${variations.length} unique narrative approaches`);

      // Phase 2: Evaluate and select
      global.statusBroadcaster?.broadcast('🔍 Evaluating narratives for novelty and quality...');
      const evaluationResult = await this.executeWithTimeout(
        this.noveltyScorer.execute({
          action,
          context: {
            ...context,
            proposals: variations
          },
          mechanicalResults,
          recentHistory
        }),
        this.config.timeoutMs,
        'Evaluation timed out'
      );

      if (!evaluationResult.success) {
        return this.fallback('Evaluation failed', action, context, mechanicalResults, evaluationResult.error);
      }

      const selectedNarrative = evaluationResult.content.selected;
      const scores = evaluationResult.content.scores;
      global.statusBroadcaster?.broadcast('🎯 Selected optimal narrative variation');

      // Phase 3: Enhance the selected narrative with progressive details
      global.statusBroadcaster?.broadcast('🎨 Enhancing narrative with progressive details...');
      const enhancementResult = await this.executeWithTimeout(
        this.enhancementAgent.execute({
          action,
          context: {
            ...context,
            selectedNarrative
          },
          mechanicalResults,
          recentHistory
        }),
        this.config.timeoutMs,
        'Enhancement timed out'
      );

      let finalNarrative = selectedNarrative;
      if (enhancementResult.success && enhancementResult.content) {
        finalNarrative = enhancementResult.content;
        global.statusBroadcaster?.broadcast('✨ Narrative enhanced with progressive elements');
      } else {
        console.warn('[AgentOrchestrator] Enhancement failed, using original:', enhancementResult.error);
        global.statusBroadcaster?.broadcast('⚠️ Enhancement failed, using original narrative');
      }
      
      const totalDuration = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(true, totalDuration, scores.novelty);

      console.log(`[AgentOrchestrator] Agent processing completed in ${totalDuration}ms`);
      global.statusBroadcaster?.broadcast(`🎉 Multi-agent narrative complete (${(totalDuration/1000).toFixed(1)}s)`);

      return {
        success: true,
        narrative: finalNarrative,
        dialogue: this.extractDialogue(finalNarrative),
        metadata: {
          agentGenerated: true,
          selectedIndex: this.findSelectedIndex(variations, selectedNarrative),
          scores,
          variationCount: variations.length,
          totalDuration
        }
      };

    } catch (error) {
      console.error('[AgentOrchestrator] Processing failed:', error);
      return this.fallback('Unexpected error', action, context, mechanicalResults, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async fallback(
    reason: string,
    action: PlayerAction,
    context: WorldContext,
    mechanicalResults?: any,
    errorDetail?: string
  ): Promise<OrchestrationResult> {
    if (!this.config.fallbackOnError) {
      throw new Error(`Agent system failed: ${reason}${errorDetail ? ` - ${errorDetail}` : ''}`);
    }

    console.warn(`[AgentOrchestrator] Falling back to direct generation: ${reason}`);
    global.statusBroadcaster?.broadcast('🔄 Agent system busy, using direct narrative generation...');
    
    try {
      const fallbackResult = await this.fallbackHandler(action, context, mechanicalResults);
      this.updateMetrics(false, 0, 0);
      
      return {
        success: true,
        narrative: fallbackResult.narrative,
        dialogue: fallbackResult.dialogue,
        metadata: {
          agentGenerated: false,
          fallbackReason: reason
        }
      };
    } catch (fallbackError) {
      console.error('[AgentOrchestrator] Fallback also failed:', fallbackError);
      throw fallbackError;
    }
  }

  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    let isResolved = false;
    
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        if (!isResolved) {
          reject(new Error(timeoutMessage));
        }
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      isResolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (error) {
      isResolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      throw error;
    }
  }

  private extractDialogue(narrative: string): string | undefined {
    const dialogueMatch = narrative.match(/"([^"]+)"/);
    return dialogueMatch ? dialogueMatch[1] : undefined;
  }

  private findSelectedIndex(proposals: string[], selected: string): number {
    return proposals.findIndex(p => p === selected);
  }

  private updateMetrics(success: boolean, duration: number, noveltyScore: number): void {
    if (success) {
      this.metrics.successfulRequests++;
      
      // Update rolling average response time
      const totalSuccessful = this.metrics.successfulRequests;
      this.metrics.avgResponseTime = 
        (this.metrics.avgResponseTime * (totalSuccessful - 1) + duration) / totalSuccessful;
      
      // Update rolling average novelty score
      this.metrics.avgNoveltyScore = 
        (this.metrics.avgNoveltyScore * (totalSuccessful - 1) + noveltyScore) / totalSuccessful;
    } else {
      this.metrics.fallbackRequests++;
    }
  }

  getMetrics(): AgentMetrics {
    return {
      ...this.metrics,
      successRate: this.metrics.totalRequests > 0 ? 
        this.metrics.successfulRequests / this.metrics.totalRequests : 0,
      fallbackRate: this.metrics.totalRequests > 0 ? 
        this.metrics.fallbackRequests / this.metrics.totalRequests : 0
    } as AgentMetrics & { successRate: number; fallbackRate: number };
  }

  getNoveltyHistory(): any {
    return this.noveltyScorer.getHistoryStats();
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(`[AgentOrchestrator] Agent system ${enabled ? 'enabled' : 'disabled'}`);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  updateConfig(partialConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...partialConfig };
    console.log('[AgentOrchestrator] Configuration updated');
  }

  async shutdown(): Promise<void> {
    console.log('[AgentOrchestrator] Shutting down agents...');
    
    try {
      await Promise.all([
        this.variationAgent.shutdown(),
        this.noveltyScorer.shutdown()
      ]);
      
      console.log('[AgentOrchestrator] All agents shut down successfully');
    } catch (error) {
      console.error('[AgentOrchestrator] Error during shutdown:', error);
    }
  }

  async regenerateResponse(
    action: PlayerAction,
    context: WorldContext,
    mechanicalResults?: any,
    excludeProposals: string[] = []
  ): Promise<OrchestrationResult> {
    console.log('[AgentOrchestrator] Regenerating response with exclusions...');
    
    this.metrics.regenerationCount++;
    
    // Add excluded proposals as constraints
    const constrainedInput = {
      action,
      context,
      mechanicalResults,
      constraints: excludeProposals.map(p => `Avoid similar phrasing to: "${p.substring(0, 100)}..."`)
    };

    // For now, just run normal process - in future could implement constraint handling
    return this.processAction(action, context, mechanicalResults);
  }

  private async getRecentHistory(): Promise<string[]> {
    try {
      const result = await this.mcpManager.executeTool('narrative-history', 'getRecentTurns', { count: 3 });
      if (result.success && Array.isArray(result.data)) {
        return result.data.map((turn: any) => turn.narrative).filter(Boolean);
      }
    } catch (error) {
      console.warn('[AgentOrchestrator] Failed to fetch narrative history:', error);
    }
    return [];
  }
}