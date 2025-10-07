/**
 * Agent System Types
 * Core interfaces for the hierarchical agent system
 */

import { PlayerAction } from '../llm/narrative-controller';
import { WorldContext } from '../llm/types';

export interface AgentInput {
  action: PlayerAction;
  context?: WorldContext;
  mechanicalResults?: any;
  previousAttempts?: string[];
  constraints?: string[];
  recentHistory?: string[];  // Recent narrative history for continuity
}

export interface AgentOutput {
  success: boolean;
  content: any;
  metadata?: {
    model?: string;
    duration?: number;
    tokensUsed?: number;
    confidence?: number;
  };
  error?: string;
}

export type AgentRole = 'variation' | 'evaluation' | 'synthesis' | 'refinement' | 'enhancement';

export interface Agent {
  id: string;
  role: AgentRole;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  
  execute(input: AgentInput): Promise<AgentOutput>;
  validateInput?(input: AgentInput): boolean;
}

export interface VariationOutput {
  proposals: string[];
  approaches: string[];
  confidence: number;
}

export interface NoveltyScore {
  phraseRepetition: number;    // 0-10, higher is more novel
  starterVariety: number;      // 0-10, higher is more varied
  structuralDiversity: number; // 0-10, higher is more diverse
  overall: number;             // 0-10, combined score
}

export interface EvaluationScore {
  novelty: number;         // 0-10
  coherence: number;       // 0-10
  appropriateness: number; // 0-10
  variety: number;         // 0-10
  total: number;           // Sum of above
}

export interface EvaluationOutput {
  selected: string;
  scores: EvaluationScore;
  allScores: EvaluationScore[];
  reasoning?: string;
}

export interface AgentConfig {
  enabled: boolean;
  fallbackOnError: boolean;
  timeoutMs: number;
  maxRetries: number;
  
  variation: {
    model: string;
    temperature: number;
    variationCount: number;
  };
  
  evaluation: {
    model: string;
    temperature: number;
    minScore: number;
  };
}

export interface RepetitionPattern {
  phrase: string;
  count: number;
  lastSeen: number;
}

export interface AgentMetrics {
  totalRequests: number;
  successfulRequests: number;
  fallbackRequests: number;
  avgResponseTime: number;
  avgNoveltyScore: number;
  regenerationCount: number;
}