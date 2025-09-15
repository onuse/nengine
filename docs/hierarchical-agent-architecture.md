# Hierarchical Agent Architecture for Narrative Engine

## Problem Statement

LLMs tend to generate repetitive content in text adventures, especially in dialogue and narrative descriptions. This manifests as:
- NPCs using similar speech patterns regardless of personality
- Repetitive narrative structures ("You see...", "The room contains...")
- Lack of variety in action descriptions
- Predictable conversation flows

## Solution: Multi-Agent Hierarchical Refinement

### Core Concept

Instead of a single LLM generating responses directly, we implement a hierarchical system where specialized agents research, propose, evaluate, and refine responses before final output. This mirrors human creative processes: brainstorm → evaluate → refine → deliver.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Player Input                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                 Orchestration Layer                      │
│            (Narrative Controller Enhanced)               │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Research    │   │  Research    │   │  Research    │
│   Agent 1    │   │   Agent 2    │   │   Agent 3    │
│  (Context)   │   │ (Narrative)  │   │ (Dialogue)   │
└──────────────┘   └──────────────┘   └──────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Synthesis Agent                        │
│          (Combines research into proposals)              │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Evaluation Agent                        │
│    (Scores for novelty, coherence, appropriateness)      │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Refinement Agent                        │
│         (Final polish and consistency check)             │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Final Response                        │
└─────────────────────────────────────────────────────────┘
```

## Agent Roles and Responsibilities

### 1. Research Agents (Parallel Execution)

#### Context Research Agent
- **Purpose**: Gather comprehensive world state and history
- **Tasks**:
  - Query MCP servers for room data, NPCs, items
  - Retrieve recent narrative history
  - Check for relevant past events
  - Identify current game state flags
- **Output**: Structured context document

#### Narrative Research Agent
- **Purpose**: Generate creative narrative variations
- **Tasks**:
  - Propose 2-3 different narrative approaches
  - Vary sentence structure and vocabulary
  - Consider different sensory focuses (visual, auditory, tactile)
  - Generate atmosphere variations
- **Output**: Multiple narrative proposals

#### Dialogue Research Agent
- **Purpose**: Create character-appropriate dialogue options
- **Tasks**:
  - Generate 2-3 dialogue variations per NPC
  - Apply personality traits and current mood
  - Consider relationship dynamics
  - Vary speech patterns and vocabulary
- **Output**: Multiple dialogue proposals with justifications

### 2. Synthesis Agent

- **Purpose**: Combine research outputs into coherent proposals
- **Input**: All research agent outputs
- **Tasks**:
  - Merge context with narrative proposals
  - Integrate dialogue into narratives
  - Create 2-3 complete response variations
  - Ensure mechanical accuracy
- **Output**: Complete response candidates

### 3. Evaluation Agent

- **Purpose**: Score and rank proposals
- **Scoring Criteria**:
  ```typescript
  interface EvaluationCriteria {
    novelty: number;        // 0-10: How different from recent outputs
    coherence: number;      // 0-10: Internal consistency
    appropriateness: number;// 0-10: Fits context and tone
    variety: number;        // 0-10: Linguistic diversity
    characterization: number;// 0-10: NPC personality consistency
  }
  ```
- **Tasks**:
  - Compare against recent history for repetition
  - Check narrative coherence
  - Verify character consistency
  - Select best candidate or request regeneration
- **Output**: Selected response with scores and improvements

### 4. Refinement Agent

- **Purpose**: Final polish and consistency check
- **Tasks**:
  - Apply final stylistic improvements
  - Ensure consistent tense and voice
  - Verify all mechanical results are incorporated
  - Check for any remaining repetitive patterns
- **Output**: Polished final response

## Implementation Strategy

### Phase 1: Agent Framework (Week 1)

```typescript
// Base agent interface
interface Agent {
  id: string;
  role: 'research' | 'synthesis' | 'evaluation' | 'refinement';
  model?: string; // Can use different models for different agents
  temperature?: number;
  
  execute(input: AgentInput): Promise<AgentOutput>;
}

// Agent manager
class AgentOrchestrator {
  private agents: Map<string, Agent>;
  private executionPipeline: AgentPipeline;
  
  async processAction(action: PlayerAction): Promise<NarrativeResult> {
    // Phase 1: Parallel research
    const research = await this.runResearchPhase(action);
    
    // Phase 2: Synthesis
    const proposals = await this.runSynthesisPhase(research);
    
    // Phase 3: Evaluation
    const selected = await this.runEvaluationPhase(proposals);
    
    // Phase 4: Refinement
    const refined = await this.runRefinementPhase(selected);
    
    return refined;
  }
}
```

### Phase 2: Research Agents (Week 2)

```typescript
class ContextResearchAgent implements Agent {
  async execute(input: AgentInput): Promise<ContextResearch> {
    const context = await this.gatherContext(input);
    const history = await this.searchHistory(input);
    const relationships = await this.getRelationships(input);
    
    return {
      worldState: context,
      relevantHistory: history,
      activeRelationships: relationships,
      suggestedTone: this.analyzeTone(context, history)
    };
  }
}

class NarrativeResearchAgent implements Agent {
  async execute(input: AgentInput): Promise<NarrativeProposals> {
    // Generate multiple variations with different approaches
    const proposals = await Promise.all([
      this.generateSensoryFocused(input),
      this.generateActionFocused(input),
      this.generateEmotionalFocused(input)
    ]);
    
    return { proposals, reasoning: this.explainChoices(proposals) };
  }
}
```

### Phase 3: Evaluation System (Week 3)

```typescript
class EvaluationAgent implements Agent {
  private historyAnalyzer: RepetitionAnalyzer;
  
  async execute(input: EvaluationInput): Promise<EvaluationResult> {
    const scores = await Promise.all(
      input.proposals.map(p => this.scoreProposal(p))
    );
    
    // Check for repetition patterns
    const repetitionScores = await this.checkRepetition(input.proposals);
    
    // Combine scores
    const finalScores = this.combineScores(scores, repetitionScores);
    
    // Select best or request regeneration
    if (Math.max(...finalScores) < this.threshold) {
      return { action: 'regenerate', feedback: this.generateFeedback(scores) };
    }
    
    return { 
      selected: input.proposals[this.getBestIndex(finalScores)],
      scores: finalScores,
      improvements: this.suggestImprovements(scores)
    };
  }
}
```

### Phase 4: Anti-Repetition Mechanisms

#### Pattern Detection
```typescript
class RepetitionAnalyzer {
  private patterns: Map<string, number> = new Map();
  private phraseHistory: string[] = [];
  
  detectPatterns(text: string): RepetitionScore {
    const phrases = this.extractPhrases(text);
    const sentenceStarters = this.extractStarters(text);
    const structuralPatterns = this.analyzeStructure(text);
    
    return {
      phraseRepetition: this.scorePhraseNovelty(phrases),
      starterVariety: this.scoreStarterVariety(sentenceStarters),
      structuralDiversity: this.scoreStructure(structuralPatterns)
    };
  }
}
```

#### Variation Enforcement
```typescript
class VariationEnforcer {
  private recentPatterns: CircularBuffer<Pattern>;
  
  enforceVariation(proposal: string): string {
    // Force different sentence starters
    if (this.hasRecentStarter(proposal)) {
      proposal = this.replaceStarter(proposal);
    }
    
    // Vary descriptive patterns
    if (this.hasRecentStructure(proposal)) {
      proposal = this.restructure(proposal);
    }
    
    return proposal;
  }
}
```

## Performance Optimization

### 1. Model Selection Strategy
- **Small, fast models** for research agents (3B-7B parameters)
- **Medium model** for synthesis (7B-9B)
- **Larger model** for evaluation (9B-13B)
- **Small model** for refinement (3B-7B)

### 2. Parallel Execution
```typescript
// Execute research agents in parallel
const research = await Promise.all([
  contextAgent.execute(input),
  narrativeAgent.execute(input),
  dialogueAgent.execute(input)
]);
```

### 3. Caching Strategy
```typescript
class AgentCache {
  private contextCache: LRUCache<string, ContextResearch>;
  private evaluationCache: Map<string, EvaluationResult>;
  
  // Cache common patterns and evaluations
  cacheResult(key: string, result: any, ttl: number): void;
  getCached(key: string): any | null;
}
```

### 4. Progressive Enhancement
- Start with basic response while agents work
- Stream updates as refinements complete
- Show "thinking" indicators during processing

## Configuration and Tuning

```yaml
# agent-config.yaml
agents:
  context_research:
    model: "gemma2:3b"
    temperature: 0.3
    timeout: 5000
    
  narrative_research:
    model: "mistral:7b"
    temperature: 0.9
    variations: 3
    
  dialogue_research:
    model: "gemma2:3b"
    temperature: 0.8
    variations: 3
    
  synthesis:
    model: "gemma2:9b"
    temperature: 0.5
    
  evaluation:
    model: "gemma2:9b"
    temperature: 0.2
    threshold: 7.0
    
  refinement:
    model: "gemma2:3b"
    temperature: 0.4

performance:
  max_parallel_agents: 3
  cache_ttl: 300
  timeout_ms: 15000
  fallback_to_direct: true
```

## Metrics and Monitoring

```typescript
interface AgentMetrics {
  avgResponseTime: number;
  repetitionScore: number;
  varietyScore: number;
  regenerationRate: number;
  userSatisfaction: number;
}

class MetricsCollector {
  trackExecution(agent: string, duration: number): void;
  trackRepetition(score: number): void;
  trackRegeneration(reason: string): void;
  
  getReport(): AgentMetrics;
}
```

## Fallback Strategy

```typescript
class FallbackHandler {
  async handleFailure(error: Error, action: PlayerAction): Promise<NarrativeResult> {
    // If agent system fails, fall back to direct generation
    if (this.shouldFallback(error)) {
      console.warn('Agent system failed, using direct generation');
      return this.directGeneration(action);
    }
    
    throw error;
  }
}
```

## Expected Improvements

1. **Variety**: 70-80% reduction in repetitive patterns
2. **Quality**: More nuanced, character-appropriate responses
3. **Creativity**: Unexpected but appropriate narrative elements
4. **Consistency**: Better adherence to established world rules
5. **Performance**: 10-15 second response time (acceptable for quality improvement)

## Testing Strategy

### Unit Tests
- Individual agent behavior
- Pattern detection accuracy
- Evaluation scoring consistency

### Integration Tests
- Full pipeline execution
- Fallback scenarios
- Performance under load

### A/B Testing
- Compare agent-generated vs direct responses
- Measure player engagement metrics
- Track repetition complaints

## Rollout Plan

1. **Week 1**: Implement base agent framework
2. **Week 2**: Deploy research agents
3. **Week 3**: Add synthesis and evaluation
4. **Week 4**: Integrate refinement and anti-repetition
5. **Week 5**: Performance optimization
6. **Week 6**: Testing and tuning
7. **Week 7**: Gradual rollout with metrics
8. **Week 8**: Full deployment

## Future Enhancements

1. **Learning System**: Agents learn from successful patterns
2. **Player Preference**: Adapt to individual player style preferences
3. **Dynamic Model Selection**: Choose models based on scene complexity
4. **Collaborative Refinement**: Multiple refinement agents vote on changes
5. **Style Personas**: Different narrative styles for different game genres