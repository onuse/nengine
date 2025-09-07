/**
 * Narrative History MCP Server
 * Implements Clean Slate Context with complete research → synthesize → purge → respond cycle
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseMCPServer } from './base-mcp-server';
import { MCPTool } from '../types/mcp-types';
import { CuratedContext, ContextCurationParams } from '../llm/types';

export interface TurnRecord {
  id: string;
  timestamp: number;
  turnNumber: number;
  playerAction: string;
  worldState: any;
  npcsInvolved: string[];
  mechanicalResults: any;
  narrative: string;
  dialogue?: string;
  stateChanges: any[];
  mood: string;
}

export interface ContextChunk {
  content: string;
  relevance: number;
  timestamp: number;
  turnNumber: number;
  entities: string[];
  importance: 'high' | 'medium' | 'low';
}

export interface Interaction {
  timestamp: number;
  entity1: string;
  entity2: string;
  type: 'dialogue' | 'action' | 'combat';
  description: string;
  outcome?: string;
}

export interface KeyEvent {
  timestamp: number;
  turnNumber: number;
  character: string;
  event: string;
  importance: number;
  consequences: string[];
}

export interface EmotionSequence {
  character: string;
  sequence: Array<{
    timestamp: number;
    emotion: string;
    intensity: number;
    trigger: string;
  }>;
  currentEmotion: string;
  trajectory: 'rising' | 'falling' | 'stable' | 'chaotic';
}

export class NarrativeHistoryMCP extends BaseMCPServer {
  private transcript: TurnRecord[] = [];
  private contextCache: Map<string, CuratedContext> = new Map();
  private gamePath: string;
  private transcriptFile: string;
  private maxTranscriptSize: number = 1000; // Max turns to keep in memory
  private maxCacheSize: number = 50; // Max cached contexts

  constructor(gamePath: string) {
    super('narrative-history-mcp', '1.0.0', ['narrative-history', 'context-curation', 'clean-slate']);
    this.gamePath = gamePath;
    this.transcriptFile = path.join(gamePath, 'narrative-transcript.json');
  }

  async initialize(): Promise<void> {
    try {
      await this.loadTranscript();
      this.log('Narrative History MCP initialized', {
        transcriptLength: this.transcript.length,
        cacheSize: this.contextCache.size
      });
    } catch (error) {
      this.handleError('initialization failed', error);
    }
  }

  listTools(): MCPTool[] {
    return [
      this.createTool(
        'recordTurn',
        'Record a complete turn in the narrative history',
        {
          type: 'object',
          properties: {
            turn: {
              type: 'object',
              properties: {
                playerAction: { type: 'string' },
                worldState: { type: 'object' },
                npcsInvolved: { type: 'array', items: { type: 'string' } },
                mechanicalResults: { type: 'object' },
                narrative: { type: 'string' },
                dialogue: { type: 'string' },
                stateChanges: { type: 'array' },
                mood: { type: 'string' }
              },
              required: ['playerAction', 'narrative']
            }
          },
          required: ['turn']
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            turnId: { type: 'string' }
          }
        }
      ),

      this.createTool(
        'searchTranscript',
        'Search the narrative transcript for relevant content',
        {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            maxResults: { type: 'number', description: 'Maximum results to return' },
            entityFilter: { type: 'string', description: 'Filter by entity name (optional)' },
            timeRange: {
              type: 'object',
              properties: {
                start: { type: 'number' },
                end: { type: 'number' }
              },
              description: 'Time range filter (optional)'
            }
          },
          required: ['query', 'maxResults']
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Context chunks' }
        }
      ),

      this.createTool(
        'getRecentTurns',
        'Get the most recent turns',
        {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of recent turns to return' }
          },
          required: ['count']
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Turn records' }
        }
      ),

      this.createTool(
        'findInteractions',
        'Find interactions between specific entities',
        {
          type: 'object',
          properties: {
            entity1: { type: 'string', description: 'First entity' },
            entity2: { type: 'string', description: 'Second entity' },
            interactionType: { 
              type: 'string', 
              enum: ['dialogue', 'action', 'combat'],
              description: 'Type of interaction (optional)'
            }
          },
          required: ['entity1', 'entity2']
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Interaction records' }
        }
      ),

      this.createTool(
        'generateSummary',
        'Generate a summary of turns within a range',
        {
          type: 'object',
          properties: {
            fromTurn: { type: 'number', description: 'Starting turn number' },
            toTurn: { type: 'number', description: 'Ending turn number' },
            focus: { 
              type: 'string', 
              enum: ['plot', 'character', 'world', 'general'],
              description: 'Summary focus (optional)'
            }
          },
          required: ['fromTurn', 'toTurn']
        },
        {
          type: 'string',
          description: 'Generated summary'
        }
      ),

      this.createTool(
        'extractKeyEvents',
        'Extract key events involving a character',
        {
          type: 'object',
          properties: {
            character: { type: 'string', description: 'Character name' },
            importance: { 
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'Minimum importance level (optional)'
            }
          },
          required: ['character']
        },
        {
          type: 'array',
          items: { type: 'object', description: 'Key events' }
        }
      ),

      this.createTool(
        'getEmotionalArc',
        'Get emotional arc for a character',
        {
          type: 'object',
          properties: {
            character: { type: 'string', description: 'Character name' }
          },
          required: ['character']
        },
        {
          type: 'object',
          properties: {
            character: { type: 'string' },
            sequence: { type: 'array' },
            currentEmotion: { type: 'string' },
            trajectory: { type: 'string' }
          }
        }
      ),

      this.createTool(
        'buildCuratedContext',
        'Build curated context for Clean Slate generation',
        {
          type: 'object',
          properties: {
            params: {
              type: 'object',
              properties: {
                currentAction: { type: 'string' },
                actors: { type: 'array', items: { type: 'string' } },
                location: { type: 'string' },
                maxTokens: { type: 'number' },
                importance: { type: 'string', enum: ['high', 'medium', 'low'] },
                timeframe: { type: 'string', enum: ['immediate', 'recent', 'extended'] }
              },
              required: ['currentAction', 'actors', 'location', 'maxTokens']
            }
          },
          required: ['params']
        },
        {
          type: 'object',
          properties: {
            immediateSituation: { type: 'string' },
            relevantHistory: { type: 'string' },
            characterStates: { type: 'object' },
            worldContext: { type: 'string' },
            mechanicalRequirements: { type: 'string' },
            narrativeTone: { type: 'string' },
            timestamp: { type: 'number' },
            tokenCount: { type: 'number' }
          }
        }
      ),

      this.createTool(
        'purgeContext',
        'Purge cached context (Clean Slate purge phase)',
        {
          type: 'object',
          properties: {
            contextId: { type: 'string', description: 'Context ID to purge (optional - purges all if not provided)' }
          }
        },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            purgedCount: { type: 'number' }
          }
        }
      ),

      this.createTool(
        'getFullTranscript',
        'Get complete narrative transcript',
        {
          type: 'object',
          properties: {
            fromTurn: { type: 'number', description: 'Starting turn number (optional)' },
            format: { 
              type: 'string', 
              enum: ['json', 'text'],
              description: 'Output format (optional)'
            }
          }
        },
        {
          type: 'string',
          description: 'Complete transcript'
        }
      )
    ];
  }

  protected async executeToolInternal(name: string, params: any): Promise<any> {
    const tool = this.validateTool(name);
    this.validateParams(params, tool);

    switch (name) {
      case 'recordTurn':
        return this.recordTurn(params.turn);

      case 'searchTranscript':
        return this.searchTranscript(params.query, params.maxResults, params.entityFilter, params.timeRange);

      case 'getRecentTurns':
        return this.getRecentTurns(params.count);

      case 'findInteractions':
        return this.findInteractions(params.entity1, params.entity2, params.interactionType);

      case 'generateSummary':
        return this.generateSummary(params.fromTurn, params.toTurn, params.focus);

      case 'extractKeyEvents':
        return this.extractKeyEvents(params.character, params.importance);

      case 'getEmotionalArc':
        return this.getEmotionalArc(params.character);

      case 'buildCuratedContext':
        return this.buildCuratedContext(params.params);

      case 'purgeContext':
        return this.purgeContext(params.contextId);

      case 'getFullTranscript':
        return this.getFullTranscript(params.fromTurn, params.format);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // Core Clean Slate Context Implementation
  recordTurn(turn: Partial<TurnRecord>): { success: boolean; turnId: string } {
    const turnRecord: TurnRecord = {
      id: this.generateId('turn'),
      timestamp: Date.now(),
      turnNumber: this.transcript.length + 1,
      playerAction: turn.playerAction || '',
      worldState: turn.worldState || {},
      npcsInvolved: turn.npcsInvolved || [],
      mechanicalResults: turn.mechanicalResults || {},
      narrative: turn.narrative || '',
      dialogue: turn.dialogue,
      stateChanges: turn.stateChanges || [],
      mood: turn.mood || 'neutral'
    };

    this.transcript.push(turnRecord);

    // Manage transcript size
    if (this.transcript.length > this.maxTranscriptSize) {
      const removed = this.transcript.splice(0, this.transcript.length - this.maxTranscriptSize);
      this.log(`Archived ${removed.length} old turns to maintain transcript size`);
    }

    // Save to disk periodically
    if (this.transcript.length % 10 === 0) {
      this.saveTranscript();
    }

    this.log(`Recorded turn ${turnRecord.turnNumber}: ${turn.playerAction}`);
    return { success: true, turnId: turnRecord.id };
  }

  searchTranscript(query: string, maxResults: number, entityFilter?: string, timeRange?: { start: number, end: number }): ContextChunk[] {
    const results: ContextChunk[] = [];
    const queryLower = query.toLowerCase();
    const entityLower = entityFilter?.toLowerCase();

    for (const turn of this.transcript) {
      // Time range filter
      if (timeRange && (turn.timestamp < timeRange.start || turn.timestamp > timeRange.end)) {
        continue;
      }

      // Entity filter
      if (entityFilter && !turn.npcsInvolved.some(npc => npc.toLowerCase().includes(entityLower!))) {
        continue;
      }

      // Search in narrative, dialogue, and action
      const searchText = `${turn.narrative} ${turn.dialogue || ''} ${turn.playerAction}`.toLowerCase();
      
      if (searchText.includes(queryLower)) {
        const relevance = this.calculateRelevance(queryLower, searchText);
        
        results.push({
          content: `Turn ${turn.turnNumber}: ${turn.playerAction}\nNarrative: ${turn.narrative}${turn.dialogue ? `\nDialogue: "${turn.dialogue}"` : ''}`,
          relevance,
          timestamp: turn.timestamp,
          turnNumber: turn.turnNumber,
          entities: turn.npcsInvolved,
          importance: relevance > 0.7 ? 'high' : relevance > 0.4 ? 'medium' : 'low'
        });
      }
    }

    // Sort by relevance and return top results
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxResults);
  }

  getRecentTurns(count: number): TurnRecord[] {
    return this.transcript.slice(-count);
  }

  findInteractions(entity1: string, entity2: string, interactionType?: string): Interaction[] {
    const interactions: Interaction[] = [];
    const entity1Lower = entity1.toLowerCase();
    const entity2Lower = entity2.toLowerCase();

    for (const turn of this.transcript) {
      const involved = turn.npcsInvolved.map(npc => npc.toLowerCase());
      const hasEntity1 = involved.includes(entity1Lower) || turn.playerAction.toLowerCase().includes(entity1Lower);
      const hasEntity2 = involved.includes(entity2Lower) || turn.playerAction.toLowerCase().includes(entity2Lower);

      if (hasEntity1 && hasEntity2) {
        let type: 'dialogue' | 'action' | 'combat' = 'action';
        
        if (turn.dialogue) {
          type = 'dialogue';
        } else if (turn.mechanicalResults?.combat) {
          type = 'combat';
        }

        if (!interactionType || type === interactionType) {
          interactions.push({
            timestamp: turn.timestamp,
            entity1,
            entity2,
            type,
            description: turn.narrative,
            outcome: turn.mechanicalResults ? JSON.stringify(turn.mechanicalResults) : undefined
          });
        }
      }
    }

    return interactions;
  }

  generateSummary(fromTurn: number, toTurn: number, focus?: string): string {
    const relevantTurns = this.transcript.filter(
      turn => turn.turnNumber >= fromTurn && turn.turnNumber <= toTurn
    );

    if (relevantTurns.length === 0) {
      return 'No turns found in the specified range.';
    }

    let summary = `Summary of turns ${fromTurn}-${toTurn}:\n\n`;

    switch (focus) {
      case 'plot':
        summary += this.generatePlotSummary(relevantTurns);
        break;
      case 'character':
        summary += this.generateCharacterSummary(relevantTurns);
        break;
      case 'world':
        summary += this.generateWorldSummary(relevantTurns);
        break;
      default:
        summary += this.generateGeneralSummary(relevantTurns);
    }

    return summary;
  }

  extractKeyEvents(character: string, minimumImportance?: string): KeyEvent[] {
    const events: KeyEvent[] = [];
    const characterLower = character.toLowerCase();

    for (const turn of this.transcript) {
      const isInvolved = turn.npcsInvolved.some(npc => npc.toLowerCase().includes(characterLower)) ||
                        turn.playerAction.toLowerCase().includes(characterLower) ||
                        turn.narrative.toLowerCase().includes(characterLower);

      if (isInvolved) {
        let importance = 0.5; // Default importance

        // Calculate importance based on various factors
        if (turn.mechanicalResults?.combat) importance += 0.3;
        if (turn.dialogue) importance += 0.2;
        if (turn.mood === 'tense' || turn.mood === 'dramatic') importance += 0.2;
        if (turn.stateChanges?.length > 0) importance += 0.3;

        const meetsImportance = !minimumImportance || 
          (minimumImportance === 'high' && importance > 0.7) ||
          (minimumImportance === 'medium' && importance > 0.4) ||
          (minimumImportance === 'low' && importance > 0.2);

        if (meetsImportance) {
          events.push({
            timestamp: turn.timestamp,
            turnNumber: turn.turnNumber,
            character,
            event: turn.narrative,
            importance,
            consequences: turn.stateChanges.map(change => JSON.stringify(change))
          });
        }
      }
    }

    return events.sort((a, b) => b.importance - a.importance);
  }

  getEmotionalArc(character: string): EmotionSequence {
    const characterLower = character.toLowerCase();
    const emotionSequence: EmotionSequence['sequence'] = [];
    let currentEmotion = 'neutral';

    for (const turn of this.transcript) {
      const isInvolved = turn.npcsInvolved.some(npc => npc.toLowerCase().includes(characterLower)) ||
                        turn.playerAction.toLowerCase().includes(characterLower);

      if (isInvolved) {
        const emotion = this.inferEmotionFromTurn(turn);
        const intensity = this.calculateEmotionalIntensity(turn);

        emotionSequence.push({
          timestamp: turn.timestamp,
          emotion,
          intensity,
          trigger: turn.playerAction
        });

        currentEmotion = emotion;
      }
    }

    const trajectory = this.analyzeEmotionalTrajectory(emotionSequence);

    return {
      character,
      sequence: emotionSequence,
      currentEmotion,
      trajectory
    };
  }

  // Clean Slate Context Curation - The Heart of the System
  buildCuratedContext(params: ContextCurationParams): CuratedContext {
    const startTime = Date.now();
    
    // RESEARCH PHASE - Cast a wide net
    const researchResults = this.performResearchPhase(params);
    
    // SYNTHESIS PHASE - Distill to essence
    const synthesizedContext = this.performSynthesisPhase(researchResults, params);
    
    // Estimate token count
    const tokenCount = this.estimateTokenCount(synthesizedContext);
    
    const context: CuratedContext = {
      immediateSituation: synthesizedContext.immediate,
      relevantHistory: synthesizedContext.history,
      characterStates: new Map(Object.entries(synthesizedContext.characters)),
      worldContext: synthesizedContext.world,
      mechanicalRequirements: synthesizedContext.mechanics,
      narrativeTone: synthesizedContext.tone,
      timestamp: startTime,
      tokenCount
    };

    // Cache the context
    const contextId = this.generateId('context');
    this.contextCache.set(contextId, context);
    
    // Manage cache size
    if (this.contextCache.size > this.maxCacheSize) {
      const oldestKey = this.contextCache.keys().next().value;
      this.contextCache.delete(oldestKey);
    }

    this.log(`Built curated context for "${params.currentAction}" (${tokenCount} estimated tokens)`);
    return context;
  }

  purgeContext(contextId?: string): { success: boolean; purgedCount: number } {
    if (contextId) {
      const deleted = this.contextCache.delete(contextId);
      return { success: deleted, purgedCount: deleted ? 1 : 0 };
    } else {
      const count = this.contextCache.size;
      this.contextCache.clear();
      this.log(`Purged all cached contexts (${count} items) for clean slate`);
      return { success: true, purgedCount: count };
    }
  }

  getFullTranscript(fromTurn?: number, format: string = 'json'): string {
    const relevantTurns = fromTurn ? 
      this.transcript.filter(turn => turn.turnNumber >= fromTurn) : 
      this.transcript;

    if (format === 'text') {
      return relevantTurns.map(turn => 
        `Turn ${turn.turnNumber} (${new Date(turn.timestamp).toISOString()}):\n` +
        `Action: ${turn.playerAction}\n` +
        `Narrative: ${turn.narrative}\n` +
        (turn.dialogue ? `Dialogue: "${turn.dialogue}"\n` : '') +
        `Mood: ${turn.mood}\n` +
        `NPCs: ${turn.npcsInvolved.join(', ')}\n\n`
      ).join('');
    }

    return JSON.stringify(relevantTurns, null, 2);
  }

  // Private implementation methods
  private performResearchPhase(params: ContextCurationParams): any {
    const research = {
      recentTurns: this.getRecentTurns(params.timeframe === 'immediate' ? 3 : params.timeframe === 'recent' ? 10 : 20),
      relevantInteractions: [],
      characterStates: {},
      worldChanges: [],
      mechanicalContext: []
    };

    // Research interactions with involved actors
    for (const actor of params.actors) {
      const interactions = this.findInteractions('player', actor);
      research.relevantInteractions.push(...interactions.slice(-5));
      
      const emotionalArc = this.getEmotionalArc(actor);
      research.characterStates[actor] = {
        currentEmotion: emotionalArc.currentEmotion,
        trajectory: emotionalArc.trajectory,
        recentEvents: this.extractKeyEvents(actor, 'medium').slice(0, 3)
      };
    }

    // Search for location-relevant content
    const locationHistory = this.searchTranscript(params.location, 10);
    research.worldChanges = locationHistory;

    // Search for action-relevant content
    const actionHistory = this.searchTranscript(params.currentAction, 5);
    research.mechanicalContext = actionHistory;

    return research;
  }

  private performSynthesisPhase(research: any, params: ContextCurationParams): any {
    // Immediate situation (last 2-3 turns verbatim)
    const immediate = research.recentTurns.slice(-3)
      .map((turn: TurnRecord) => `${turn.playerAction} -> ${turn.narrative}`)
      .join('\n');

    // Relevant history (key events that matter now)
    const historyChunks = research.relevantInteractions
      .concat(research.worldChanges)
      .sort((a: any, b: any) => b.relevance || b.importance - (a.relevance || a.importance))
      .slice(0, 5)
      .map((chunk: any) => chunk.content || chunk.description)
      .join('\n');

    // Character states
    const characters: Record<string, string> = {};
    for (const [actor, state] of Object.entries(research.characterStates)) {
      const s = state as any;
      characters[actor] = `${s.currentEmotion} (${s.trajectory}); Recent: ${s.recentEvents.map((e: any) => e.event).join('; ')}`;
    }

    // World context
    const world = `Location: ${params.location}. Recent changes: ${research.worldChanges.slice(0, 2).map((c: any) => c.content).join('; ')}`;

    // Mechanical requirements
    const mechanics = research.mechanicalContext
      .filter((c: any) => c.importance === 'high')
      .map((c: any) => c.content)
      .join('; ') || 'Standard game rules apply';

    // Narrative tone based on recent emotional trajectory
    let tone = 'neutral';
    const recentMoods = research.recentTurns.map((t: TurnRecord) => t.mood);
    if (recentMoods.includes('tense') || recentMoods.includes('dramatic')) {
      tone = 'tense';
    } else if (recentMoods.includes('peaceful') || recentMoods.includes('calm')) {
      tone = 'relaxed';
    } else if (recentMoods.includes('mysterious') || recentMoods.includes('strange')) {
      tone = 'mysterious';
    }

    return {
      immediate,
      history: historyChunks,
      characters,
      world,
      mechanics,
      tone
    };
  }

  // Helper methods
  private calculateRelevance(query: string, text: string): number {
    const queryWords = query.split(' ');
    let matches = 0;
    
    for (const word of queryWords) {
      if (text.includes(word)) {
        matches++;
      }
    }
    
    return matches / queryWords.length;
  }

  private inferEmotionFromTurn(turn: TurnRecord): string {
    const text = `${turn.narrative} ${turn.dialogue || ''}`.toLowerCase();
    
    if (text.includes('anger') || text.includes('furious') || text.includes('rage')) return 'angry';
    if (text.includes('fear') || text.includes('afraid') || text.includes('terrified')) return 'afraid';
    if (text.includes('joy') || text.includes('happy') || text.includes('delighted')) return 'happy';
    if (text.includes('sad') || text.includes('sorrow') || text.includes('melancholy')) return 'sad';
    if (text.includes('surprised') || text.includes('shocked') || text.includes('amazed')) return 'surprised';
    if (text.includes('calm') || text.includes('peaceful') || text.includes('serene')) return 'calm';
    if (text.includes('excited') || text.includes('thrilled') || text.includes('energetic')) return 'excited';
    
    return turn.mood || 'neutral';
  }

  private calculateEmotionalIntensity(turn: TurnRecord): number {
    let intensity = 0.5; // Base intensity
    
    if (turn.mechanicalResults?.combat) intensity += 0.3;
    if (turn.dialogue) intensity += 0.2;
    if (turn.mood === 'tense' || turn.mood === 'dramatic') intensity += 0.3;
    if (turn.stateChanges?.length > 0) intensity += 0.2;
    
    return Math.min(1.0, intensity);
  }

  private analyzeEmotionalTrajectory(sequence: EmotionSequence['sequence']): 'rising' | 'falling' | 'stable' | 'chaotic' {
    if (sequence.length < 3) return 'stable';
    
    const recent = sequence.slice(-5);
    const intensities = recent.map(e => e.intensity);
    
    let trend = 0;
    for (let i = 1; i < intensities.length; i++) {
      if (intensities[i] > intensities[i-1]) trend++;
      else if (intensities[i] < intensities[i-1]) trend--;
    }
    
    const variance = this.calculateVariance(intensities);
    
    if (variance > 0.3) return 'chaotic';
    if (trend >= 2) return 'rising';
    if (trend <= -2) return 'falling';
    return 'stable';
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  private generatePlotSummary(turns: TurnRecord[]): string {
    const keyTurns = turns.filter(turn => 
      turn.mechanicalResults?.combat || 
      turn.stateChanges?.length > 0 || 
      turn.mood === 'dramatic'
    );
    
    return keyTurns.map(turn => 
      `• ${turn.playerAction} (Turn ${turn.turnNumber}): ${turn.narrative}`
    ).join('\n');
  }

  private generateCharacterSummary(turns: TurnRecord[]): string {
    const characterActions: Record<string, string[]> = {};
    
    for (const turn of turns) {
      for (const npc of turn.npcsInvolved) {
        if (!characterActions[npc]) characterActions[npc] = [];
        characterActions[npc].push(`${turn.narrative}${turn.dialogue ? ` ("${turn.dialogue}")` : ''}`);
      }
    }
    
    let summary = '';
    for (const [character, actions] of Object.entries(characterActions)) {
      summary += `${character}:\n${actions.map(action => `  • ${action}`).join('\n')}\n\n`;
    }
    
    return summary;
  }

  private generateWorldSummary(turns: TurnRecord[]): string {
    const worldChanges = turns
      .filter(turn => turn.stateChanges?.length > 0)
      .map(turn => `• Turn ${turn.turnNumber}: ${turn.stateChanges.map(change => JSON.stringify(change)).join(', ')}`)
      .join('\n');
    
    return worldChanges || 'No significant world changes in this period.';
  }

  private generateGeneralSummary(turns: TurnRecord[]): string {
    const summary = turns.map(turn => 
      `Turn ${turn.turnNumber}: ${turn.playerAction} -> ${turn.narrative.substring(0, 100)}...`
    ).join('\n');
    
    return summary;
  }

  private estimateTokenCount(context: any): number {
    // Rough token estimation (4 chars per token average)
    const text = JSON.stringify(context);
    return Math.ceil(text.length / 4);
  }

  private async loadTranscript(): Promise<void> {
    try {
      if (fs.existsSync(this.transcriptFile)) {
        const content = fs.readFileSync(this.transcriptFile, 'utf-8');
        this.transcript = JSON.parse(content);
        this.log(`Loaded transcript with ${this.transcript.length} turns`);
      }
    } catch (error) {
      this.warn('Failed to load transcript, starting fresh');
      this.transcript = [];
    }
  }

  private async saveTranscript(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.transcriptFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.transcriptFile, JSON.stringify(this.transcript, null, 2));
      this.log(`Saved transcript with ${this.transcript.length} turns`);
    } catch (error) {
      this.warn('Failed to save transcript:', error);
    }
  }

  // Debug Interface Implementation
  protected getCurrentState(): any {
    return {
      transcriptLength: this.transcript.length,
      cacheSize: this.contextCache.size,
      latestTurn: this.transcript.length > 0 ? this.transcript[this.transcript.length - 1].turnNumber : 0,
      totalTokensEstimate: this.transcript.reduce((sum, turn) => sum + this.estimateTokenCount(turn), 0)
    };
  }

  protected getWarnings(): string[] {
    const warnings: string[] = [];
    
    if (this.transcript.length === 0) {
      warnings.push('No narrative history recorded');
    }
    
    if (this.transcript.length > this.maxTranscriptSize * 0.9) {
      warnings.push(`Transcript approaching size limit (${this.transcript.length}/${this.maxTranscriptSize})`);
    }
    
    if (this.contextCache.size > this.maxCacheSize * 0.9) {
      warnings.push(`Context cache approaching limit (${this.contextCache.size}/${this.maxCacheSize})`);
    }
    
    return warnings;
  }

  // Cleanup
  destroy(): void {
    super.destroy();
    this.saveTranscript();
    this.contextCache.clear();
  }
}