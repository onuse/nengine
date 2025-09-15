# Agent System Implementation Roadmap

## Quick Start Guide

This document provides a practical, step-by-step guide to implementing the hierarchical agent system in the existing Narrative Engine codebase.

## Phase 1: Minimal Viable Agent System (Days 1-3)

### Step 1: Create Agent Types and Interfaces

```typescript
// src/agents/types.ts
export interface AgentInput {
  action: PlayerAction;
  context?: WorldContext;
  previousAttempts?: string[];
  constraints?: string[];
}

export interface AgentOutput {
  success: boolean;
  content: any;
  metadata?: {
    model?: string;
    duration?: number;
    tokensUsed?: number;
  };
}

export type AgentRole = 'research' | 'synthesis' | 'evaluation' | 'refinement';

export interface Agent {
  id: string;
  role: AgentRole;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  
  execute(input: AgentInput): Promise<AgentOutput>;
  validateInput?(input: AgentInput): boolean;
}

export interface ResearchOutput {
  proposals: string[];
  context: any;
  confidence: number;
}

export interface EvaluationScore {
  novelty: number;      // 0-10
  coherence: number;    // 0-10
  appropriateness: number; // 0-10
  variety: number;      // 0-10
}
```

### Step 2: Create Base Agent Class

```typescript
// src/agents/base-agent.ts
import { Agent, AgentInput, AgentOutput, AgentRole } from './types';
import { OllamaProvider } from '../llm/ollama-provider';

export abstract class BaseAgent implements Agent {
  id: string;
  role: AgentRole;
  model: string;
  temperature: number;
  maxTokens: number;
  protected llmProvider: OllamaProvider;

  constructor(id: string, role: AgentRole, config: any = {}) {
    this.id = id;
    this.role = role;
    this.model = config.model || 'gemma2:3b';
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 2048;
    
    this.llmProvider = new OllamaProvider({
      model: this.model,
      temperature: this.temperature,
      contextWindow: this.maxTokens
    });
  }

  abstract execute(input: AgentInput): Promise<AgentOutput>;
  
  validateInput(input: AgentInput): boolean {
    return input.action !== undefined;
  }
}
```

### Step 3: Create Simple Research Agent

```typescript
// src/agents/narrative-research-agent.ts
export class NarrativeResearchAgent extends BaseAgent {
  constructor(config?: any) {
    super('narrative-research', 'research', config);
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const prompt = {
      systemContext: `You are a creative narrative generator for a text adventure.
        Generate 3 different narrative responses for the player action.
        Vary your approach: one sensory-focused, one action-focused, one emotional.`,
      worldState: input.context,
      recentHistory: [],
      availableActions: [],
      query: `Player action: "${input.action.rawInput}"
        
        Generate 3 varied narrative responses. Format as:
        VARIANT_1: [sensory-focused response]
        VARIANT_2: [action-focused response]  
        VARIANT_3: [emotional-focused response]`
    };

    const response = await this.llmProvider.complete(prompt);
    const variants = this.parseVariants(response.narrative);
    
    return {
      success: true,
      content: { proposals: variants },
      metadata: { model: this.model }
    };
  }

  private parseVariants(text: string): string[] {
    const variants = [];
    const matches = text.match(/VARIANT_\d+:\s*(.+?)(?=VARIANT_|$)/gs);
    if (matches) {
      for (const match of matches) {
        const content = match.replace(/VARIANT_\d+:\s*/, '').trim();
        variants.push(content);
      }
    }
    return variants.length > 0 ? variants : [text];
  }
}
```

### Step 4: Create Simple Evaluation Agent

```typescript
// src/agents/evaluation-agent.ts
export class EvaluationAgent extends BaseAgent {
  private recentHistory: string[] = [];
  
  constructor(config?: any) {
    super('evaluation', 'evaluation', {
      ...config,
      temperature: 0.2 // Lower temperature for more consistent evaluation
    });
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const proposals = input.context?.proposals || [];
    
    // Score each proposal
    const scores = await Promise.all(
      proposals.map(p => this.scoreProposal(p, input))
    );
    
    // Select best
    const bestIndex = scores.reduce((best, score, i) => 
      score.total > scores[best].total ? i : best, 0
    );
    
    return {
      success: true,
      content: {
        selected: proposals[bestIndex],
        scores: scores[bestIndex],
        allScores: scores
      }
    };
  }

  private async scoreProposal(proposal: string, input: AgentInput): Promise<any> {
    // Check for repetition
    const noveltyScore = this.scoreNovelty(proposal);
    
    // Use LLM for quality assessment
    const prompt = {
      systemContext: `Score this narrative response on a scale of 1-10 for:
        - Coherence: Does it make sense and flow well?
        - Appropriateness: Does it fit the action and context?
        - Variety: Does it use varied vocabulary and structure?`,
      worldState: input.context,
      recentHistory: [],
      availableActions: [],
      query: `Proposal to evaluate: "${proposal}"
        
        Provide scores in format:
        COHERENCE: [1-10]
        APPROPRIATENESS: [1-10]
        VARIETY: [1-10]`
    };

    const response = await this.llmProvider.complete(prompt);
    const scores = this.parseScores(response.narrative);
    
    return {
      novelty: noveltyScore,
      coherence: scores.coherence || 5,
      appropriateness: scores.appropriateness || 5,
      variety: scores.variety || 5,
      total: noveltyScore + (scores.coherence || 5) + 
             (scores.appropriateness || 5) + (scores.variety || 5)
    };
  }

  private scoreNovelty(text: string): number {
    // Simple novelty check against recent history
    if (this.recentHistory.length === 0) return 10;
    
    let maxSimilarity = 0;
    for (const recent of this.recentHistory) {
      const similarity = this.calculateSimilarity(text, recent);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
    
    return Math.max(0, 10 - (maxSimilarity * 10));
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple word overlap similarity
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private parseScores(text: string): any {
    const scores: any = {};
    const patterns = {
      coherence: /COHERENCE:\s*(\d+)/i,
      appropriateness: /APPROPRIATENESS:\s*(\d+)/i,
      variety: /VARIETY:\s*(\d+)/i
    };
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        scores[key] = parseInt(match[1]);
      }
    }
    
    return scores;
  }
}
```

### Step 5: Create Agent Orchestrator

```typescript
// src/agents/agent-orchestrator.ts
import { NarrativeResearchAgent } from './narrative-research-agent';
import { EvaluationAgent } from './evaluation-agent';
import { PlayerAction, NarrativeResult } from '../llm/narrative-controller';

export class AgentOrchestrator {
  private researchAgent: NarrativeResearchAgent;
  private evaluationAgent: EvaluationAgent;
  private enabled: boolean = true;
  private fallbackHandler: any;

  constructor(fallbackHandler: any) {
    this.researchAgent = new NarrativeResearchAgent();
    this.evaluationAgent = new EvaluationAgent();
    this.fallbackHandler = fallbackHandler;
  }

  async processAction(
    action: PlayerAction, 
    context: any
  ): Promise<NarrativeResult> {
    if (!this.enabled) {
      return this.fallbackHandler(action, context);
    }

    try {
      // Step 1: Research phase - generate variations
      console.log('[AgentOrchestrator] Starting research phase...');
      const researchResult = await this.researchAgent.execute({
        action,
        context
      });

      if (!researchResult.success) {
        return this.fallbackHandler(action, context);
      }

      // Step 2: Evaluation phase - select best
      console.log('[AgentOrchestrator] Starting evaluation phase...');
      const evalResult = await this.evaluationAgent.execute({
        action,
        context: {
          ...context,
          proposals: researchResult.content.proposals
        }
      });

      if (!evalResult.success) {
        return this.fallbackHandler(action, context);
      }

      // Return the selected narrative
      return {
        success: true,
        narrative: evalResult.content.selected,
        dialogue: '', // Extract if present
        stateChanges: [],
        nextActions: [],
        metadata: {
          agentGenerated: true,
          scores: evalResult.content.scores
        }
      };

    } catch (error) {
      console.error('[AgentOrchestrator] Error:', error);
      return this.fallbackHandler(action, context);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
```

### Step 6: Integrate with Existing NarrativeController

```typescript
// Modify src/llm/narrative-controller.ts

import { AgentOrchestrator } from '../agents/agent-orchestrator';

export class NarrativeController {
  // ... existing code ...
  private agentOrchestrator?: AgentOrchestrator;
  private useAgents: boolean = false;

  constructor(mcpManager: MCPServerManager, config: Partial<NarrativeConfig> = {}) {
    // ... existing code ...
    
    // Initialize agent system if configured
    if (config.useAgents) {
      this.useAgents = true;
      this.agentOrchestrator = new AgentOrchestrator(
        (action: PlayerAction, context: any) => 
          this.generateDirectResponse(action, context)
      );
    }
  }

  private async generateNarrativeResponse(
    context: WorldContext, 
    action: PlayerAction, 
    mechanicalResults: any
  ): Promise<LLMResponse> {
    // Try agent system first if enabled
    if (this.useAgents && this.agentOrchestrator) {
      try {
        const agentResult = await this.agentOrchestrator.processAction(
          action,
          { ...context, mechanicalResults }
        );
        
        if (agentResult.success) {
          return {
            narrative: agentResult.narrative,
            dialogue: agentResult.dialogue,
            stateChanges: {}
          };
        }
      } catch (error) {
        console.warn('[NarrativeController] Agent system failed, falling back', error);
      }
    }

    // Fallback to existing direct generation
    return this.generateDirectResponse(action, context);
  }

  private async generateDirectResponse(
    action: PlayerAction, 
    context: any
  ): Promise<LLMResponse> {
    // Existing generation code
    let systemContext = "You are the narrator...";
    // ... rest of existing code
  }
}
```

## Phase 2: Enhanced Agents (Days 4-6)

### Add More Specialized Agents

```typescript
// src/agents/dialogue-research-agent.ts
export class DialogueResearchAgent extends BaseAgent {
  async execute(input: AgentInput): Promise<AgentOutput> {
    // Generate varied dialogue options for NPCs
  }
}

// src/agents/context-research-agent.ts  
export class ContextResearchAgent extends BaseAgent {
  async execute(input: AgentInput): Promise<AgentOutput> {
    // Gather comprehensive context from MCP servers
  }
}

// src/agents/synthesis-agent.ts
export class SynthesisAgent extends BaseAgent {
  async execute(input: AgentInput): Promise<AgentOutput> {
    // Combine outputs from multiple research agents
  }
}

// src/agents/refinement-agent.ts
export class RefinementAgent extends BaseAgent {
  async execute(input: AgentInput): Promise<AgentOutput> {
    // Polish and improve selected response
  }
}
```

## Phase 3: Anti-Repetition System (Days 7-9)

### Implement Pattern Detection

```typescript
// src/agents/repetition-analyzer.ts
export class RepetitionAnalyzer {
  private phraseHistory: Map<string, number> = new Map();
  private sentencePatterns: string[] = [];
  private maxHistorySize = 100;

  analyzeRepetition(text: string): RepetitionScore {
    const phrases = this.extractPhrases(text, 3); // 3-word phrases
    const starters = this.extractSentenceStarters(text);
    
    // Check phrase frequency
    let phraseRepetition = 0;
    for (const phrase of phrases) {
      const count = this.phraseHistory.get(phrase) || 0;
      phraseRepetition += count;
    }

    // Check sentence starter variety
    const starterVariety = this.calculateStarterVariety(starters);

    // Update history
    this.updateHistory(phrases, starters);

    return {
      phraseRepetition: Math.min(10, phraseRepetition),
      starterVariety: starterVariety,
      overall: (10 - phraseRepetition) * 0.6 + starterVariety * 0.4
    };
  }

  private extractPhrases(text: string, n: number): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const phrases = [];
    
    for (let i = 0; i <= words.length - n; i++) {
      phrases.push(words.slice(i, i + n).join(' '));
    }
    
    return phrases;
  }

  private extractSentenceStarters(text: string): string[] {
    const sentences = text.split(/[.!?]+/);
    return sentences
      .map(s => s.trim().split(/\s+/).slice(0, 3).join(' '))
      .filter(s => s.length > 0);
  }

  private calculateStarterVariety(starters: string[]): number {
    if (starters.length === 0) return 10;
    
    const uniqueStarters = new Set(starters);
    return Math.min(10, (uniqueStarters.size / starters.length) * 10);
  }

  private updateHistory(phrases: string[], starters: string[]): void {
    // Update phrase counts
    for (const phrase of phrases) {
      const count = this.phraseHistory.get(phrase) || 0;
      this.phraseHistory.set(phrase, count + 1);
    }

    // Add sentence patterns
    this.sentencePatterns.push(...starters);

    // Trim history if too large
    if (this.phraseHistory.size > this.maxHistorySize) {
      const entries = Array.from(this.phraseHistory.entries());
      entries.sort((a, b) => a[1] - b[1]); // Sort by count
      
      // Remove least frequent
      for (let i = 0; i < 20; i++) {
        this.phraseHistory.delete(entries[i][0]);
      }
    }

    if (this.sentencePatterns.length > this.maxHistorySize) {
      this.sentencePatterns = this.sentencePatterns.slice(-50);
    }
  }
}
```

## Testing Strategy

### 1. Unit Tests

```typescript
// src/agents/__tests__/narrative-research-agent.test.ts
describe('NarrativeResearchAgent', () => {
  it('should generate multiple variations', async () => {
    const agent = new NarrativeResearchAgent();
    const result = await agent.execute({
      action: { type: 'movement', rawInput: 'go north' },
      context: { currentRoom: 'tavern' }
    });
    
    expect(result.content.proposals).toHaveLength(3);
    expect(result.content.proposals[0]).not.toBe(result.content.proposals[1]);
  });
});
```

### 2. Integration Test

```typescript
// src/agents/__tests__/agent-orchestrator.test.ts
describe('AgentOrchestrator', () => {
  it('should process action through full pipeline', async () => {
    const orchestrator = new AgentOrchestrator(fallbackFn);
    const result = await orchestrator.processAction(
      { type: 'interaction', rawInput: 'examine the sword' },
      { currentRoom: 'armory' }
    );
    
    expect(result.success).toBe(true);
    expect(result.narrative).toBeDefined();
    expect(result.metadata?.agentGenerated).toBe(true);
  });
});
```

## Configuration

```yaml
# config/agents.yaml
agents:
  enabled: true
  fallback_on_error: true
  
  research:
    narrative:
      model: "gemma2:3b"
      temperature: 0.9
      variations: 3
    
    dialogue:
      model: "gemma2:3b"
      temperature: 0.8
      variations: 3
  
  evaluation:
    model: "gemma2:9b"
    temperature: 0.2
    min_score: 6.0
    
  refinement:
    model: "gemma2:3b"
    temperature: 0.4

performance:
  timeout_ms: 10000
  cache_results: true
  parallel_research: true
```

## Monitoring and Metrics

```typescript
// src/agents/metrics.ts
export class AgentMetrics {
  private metrics = {
    totalRequests: 0,
    agentSuccess: 0,
    fallbacks: 0,
    avgResponseTime: 0,
    avgNoveltyScore: 0,
    regenerations: 0
  };

  recordRequest(success: boolean, duration: number, scores?: any): void {
    this.metrics.totalRequests++;
    if (success) this.metrics.agentSuccess++;
    
    // Update rolling average
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.totalRequests - 1) + duration) 
      / this.metrics.totalRequests;
    
    if (scores?.novelty) {
      this.metrics.avgNoveltyScore = 
        (this.metrics.avgNoveltyScore * (this.metrics.totalRequests - 1) + scores.novelty)
        / this.metrics.totalRequests;
    }
  }

  getReport(): any {
    return {
      ...this.metrics,
      successRate: this.metrics.agentSuccess / this.metrics.totalRequests,
      fallbackRate: this.metrics.fallbacks / this.metrics.totalRequests
    };
  }
}
```

## Deployment Checklist

- [ ] Implement base agent framework
- [ ] Create narrative research agent
- [ ] Create evaluation agent
- [ ] Integrate with NarrativeController
- [ ] Add configuration options
- [ ] Implement fallback handling
- [ ] Add metrics collection
- [ ] Create unit tests
- [ ] Run integration tests
- [ ] Test with actual game scenarios
- [ ] Monitor performance metrics
- [ ] Tune agent parameters
- [ ] Enable gradually (feature flag)
- [ ] Collect user feedback
- [ ] Iterate based on results

## Expected Timeline

- **Days 1-3**: Basic agent system working
- **Days 4-6**: Enhanced agents and synthesis
- **Days 7-9**: Anti-repetition system
- **Days 10-12**: Testing and tuning
- **Days 13-14**: Deployment and monitoring

## Success Metrics

1. **Repetition Reduction**: 60%+ reduction in repeated phrases
2. **Response Time**: < 15 seconds for agent-generated responses
3. **Quality Score**: Average evaluation score > 7/10
4. **Fallback Rate**: < 10% of requests fall back to direct generation
5. **User Satisfaction**: Positive feedback on variety and quality