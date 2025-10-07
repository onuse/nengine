/**
 * Novelty Scorer
 * Evaluates narrative variations for repetition and selects the best one
 */

import { BaseAgent, BaseAgentConfig } from './base-agent';
import { AgentInput, AgentOutput, EvaluationOutput, EvaluationScore, NoveltyScore, RepetitionPattern } from './types';
import { LLMPrompt } from '../llm/types';

export interface NoveltyScorerConfig extends BaseAgentConfig {
  minScore?: number;
  historySize?: number;
  noveltyWeight?: number;
  qualityWeight?: number;
}

export class NoveltyScorer extends BaseAgent {
  private minScore: number;
  private historySize: number;
  private noveltyWeight: number;
  private qualityWeight: number;
  
  private phraseHistory: Map<string, RepetitionPattern> = new Map();
  private sentenceStarters: string[] = [];
  private recentNarratives: string[] = [];

  constructor(config: NoveltyScorerConfig = {}) {
    super('novelty-scorer', 'evaluation', {
      model: config.model || 'gemma2:9b',
      temperature: config.temperature || 0.2,
      ...config
    });
    
    this.minScore = config.minScore || 6.0;
    this.historySize = config.historySize || 50;
    this.noveltyWeight = config.noveltyWeight || 0.6;
    this.qualityWeight = config.qualityWeight || 0.4;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    
    try {
      if (!input.context || !Array.isArray(input.context.proposals)) {
        return {
          success: false,
          content: null,
          error: 'No proposals provided for evaluation'
        };
      }

      const proposals: string[] = input.context.proposals;
      console.log(`[${this.id}] Evaluating ${proposals.length} proposals...`);

      const scores = await this.scoreAllProposals(proposals, input);
      const bestIndex = this.selectBestProposal(scores);
      
      if (scores[bestIndex].total < this.minScore) {
        console.warn(`[${this.id}] Best score ${scores[bestIndex].total} below threshold ${this.minScore}`);
        // Could trigger regeneration here, but for Phase 1 we'll accept it
      }

      // Update history with selected proposal
      this.updateHistory(proposals[bestIndex]);
      
      const duration = Date.now() - startTime;
      const result: EvaluationOutput = {
        selected: proposals[bestIndex],
        scores: scores[bestIndex],
        allScores: scores,
        reasoning: this.explainSelection(bestIndex, scores)
      };

      console.log(`[${this.id}] Selected proposal ${bestIndex} (score: ${scores[bestIndex].total.toFixed(1)}) in ${duration}ms`);

      return {
        success: true,
        content: result,
        metadata: {
          model: this.model,
          duration,
          confidence: scores[bestIndex].total / 10
        }
      };

    } catch (error) {
      console.error(`[${this.id}] Evaluation failed:`, error);
      return {
        success: false,
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async scoreAllProposals(proposals: string[], input: AgentInput): Promise<EvaluationScore[]> {
    const scores: EvaluationScore[] = [];
    
    for (let i = 0; i < proposals.length; i++) {
      const proposal = proposals[i];
      
      const noveltyScore = this.scoreNovelty(proposal);
      const qualityScore = await this.scoreQuality(proposal, input);
      
      const totalScore = (noveltyScore.overall * this.noveltyWeight) + 
                        (qualityScore.overall * this.qualityWeight);
      
      scores.push({
        novelty: noveltyScore.overall,
        coherence: qualityScore.coherence,
        appropriateness: qualityScore.appropriateness,
        variety: qualityScore.variety,
        total: totalScore
      });
      
      console.log(`[${this.id}] Proposal ${i}: novelty=${noveltyScore.overall.toFixed(1)}, quality=${qualityScore.overall.toFixed(1)}, total=${totalScore.toFixed(1)}`);
    }
    
    return scores;
  }

  private scoreNovelty(text: string): NoveltyScore {
    const phraseScore = this.scorePhraseNovelty(text);
    const starterScore = this.scoreStarterVariety(text);
    const structureScore = this.scoreStructuralDiversity(text);
    
    const overall = (phraseScore * 0.4) + (starterScore * 0.3) + (structureScore * 0.3);
    
    return {
      phraseRepetition: phraseScore,
      starterVariety: starterScore,
      structuralDiversity: structureScore,
      overall
    };
  }

  private scorePhraseNovelty(text: string): number {
    const phrases = this.extractPhrases(text, 3);
    let repetitionPenalty = 0;
    
    for (const phrase of phrases) {
      const pattern = this.phraseHistory.get(phrase);
      if (pattern) {
        const timeSinceLastSeen = Date.now() - pattern.lastSeen;
        const recencyFactor = Math.max(0, 1 - (timeSinceLastSeen / (1000 * 60 * 10))); // 10 minutes
        repetitionPenalty += pattern.count * recencyFactor;
      }
    }
    
    return Math.max(0, 10 - repetitionPenalty);
  }

  private scoreStarterVariety(text: string): number {
    const starters = this.extractSentenceStarters(text);
    if (starters.length === 0) return 10;
    
    const recentStarters = this.sentenceStarters.slice(-20); // Last 20 sentence starters
    let repetitionCount = 0;
    
    for (const starter of starters) {
      if (recentStarters.includes(starter)) {
        repetitionCount++;
      }
    }
    
    const repetitionRate = repetitionCount / starters.length;
    return Math.max(0, 10 - (repetitionRate * 10));
  }

  private scoreStructuralDiversity(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length <= 1) return 10;
    
    const structures = sentences.map(s => this.analyzeStructure(s.trim()));
    const uniqueStructures = new Set(structures);
    
    const diversityRatio = uniqueStructures.size / structures.length;
    return diversityRatio * 10;
  }

  private analyzeStructure(sentence: string): string {
    const words = sentence.split(/\s+/);
    if (words.length <= 3) return 'short';
    if (words.length <= 8) return 'medium';
    if (words.length <= 15) return 'long';
    return 'very_long';
  }

  private async scoreQuality(text: string, input: AgentInput): Promise<any> {
    const prompt: LLMPrompt = {
      systemContext: this.buildSystemPrompt('Evaluate the quality of this narrative text. Be objective and consistent.'),
      worldState: input.context,
      recentHistory: input.recentHistory || [],
      availableActions: [],
      query: `Evaluate this narrative response for a text adventure game:

"${text}"

Context: Player action was "${input.action.rawInput}"

Score on a scale of 1-10:
COHERENCE: How well does it flow and make sense?
APPROPRIATENESS: How well does it fit the action and context?
VARIETY: How varied is the vocabulary and sentence structure?

Provide scores in exact format:
COHERENCE: [1-10]
APPROPRIATENESS: [1-10]  
VARIETY: [1-10]`
    };

    try {
      const response = await this.callLLM(prompt);
      const scores = this.parseScores(response);
      
      return {
        coherence: scores.coherence || 5,
        appropriateness: scores.appropriateness || 5,
        variety: scores.variety || 5,
        overall: ((scores.coherence || 5) + (scores.appropriateness || 5) + (scores.variety || 5)) / 3
      };
    } catch (error) {
      console.warn(`[${this.id}] Quality scoring failed, using defaults:`, error);
      return { coherence: 5, appropriateness: 5, variety: 5, overall: 5 };
    }
  }

  private selectBestProposal(scores: EvaluationScore[]): number {
    let bestIndex = 0;
    let bestScore = scores[0].total;
    
    for (let i = 1; i < scores.length; i++) {
      if (scores[i].total > bestScore) {
        bestScore = scores[i].total;
        bestIndex = i;
      }
    }
    
    return bestIndex;
  }

  private updateHistory(selectedText: string): void {
    // Update phrase history
    const phrases = this.extractPhrases(selectedText, 3);
    for (const phrase of phrases) {
      const existing = this.phraseHistory.get(phrase);
      this.phraseHistory.set(phrase, {
        phrase,
        count: (existing?.count || 0) + 1,
        lastSeen: Date.now()
      });
    }
    
    // Update sentence starters
    const starters = this.extractSentenceStarters(selectedText);
    this.sentenceStarters.push(...starters);
    
    // Update recent narratives
    this.recentNarratives.push(selectedText);
    
    // Trim history to size limits
    this.trimHistory();
  }

  private trimHistory(): void {
    // Trim phrase history by removing oldest entries
    if (this.phraseHistory.size > this.historySize * 2) {
      const entries = Array.from(this.phraseHistory.entries());
      entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      
      const toRemove = entries.slice(0, entries.length - this.historySize);
      for (const [phrase] of toRemove) {
        this.phraseHistory.delete(phrase);
      }
    }
    
    // Trim sentence starters
    if (this.sentenceStarters.length > this.historySize) {
      this.sentenceStarters = this.sentenceStarters.slice(-this.historySize);
    }
    
    // Trim recent narratives
    if (this.recentNarratives.length > 20) {
      this.recentNarratives = this.recentNarratives.slice(-20);
    }
  }

  private extractPhrases(text: string, n: number): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    const phrases: string[] = [];
    for (let i = 0; i <= words.length - n; i++) {
      phrases.push(words.slice(i, i + n).join(' '));
    }
    
    return phrases;
  }

  private extractSentenceStarters(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences
      .map(s => s.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase())
      .filter(starter => starter.length > 0);
  }

  private explainSelection(selectedIndex: number, scores: EvaluationScore[]): string {
    const selected = scores[selectedIndex];
    const reasons: string[] = [];
    
    if (selected.novelty >= 8) reasons.push('high novelty');
    if (selected.coherence >= 8) reasons.push('excellent coherence');
    if (selected.appropriateness >= 8) reasons.push('very appropriate');
    if (selected.variety >= 8) reasons.push('good variety');
    
    if (reasons.length === 0) {
      reasons.push('best available option');
    }
    
    return `Selected proposal ${selectedIndex} for: ${reasons.join(', ')}`;
  }

  getHistoryStats(): any {
    return {
      phraseHistorySize: this.phraseHistory.size,
      sentenceStarterCount: this.sentenceStarters.length,
      recentNarrativesCount: this.recentNarratives.length,
      topPhrases: Array.from(this.phraseHistory.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([phrase, pattern]) => ({ phrase, count: pattern.count }))
    };
  }
}