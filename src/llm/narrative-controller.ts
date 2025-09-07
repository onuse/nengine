/**
 * Narrative Controller
 * Orchestrates LLM interactions and game mechanics
 */

import { MCPServerManager } from '../mcp/mcp-server-manager';
import { LLMProvider, LLMPrompt, LLMResponse, WorldContext, Event, Action, NPCContext } from './types';
import { OllamaProvider } from './ollama-provider';

export interface NarrativeConfig {
  llmProvider: 'ollama';
  model: string;
  fallbackModel: string;
  temperature: number;
  maxContextTokens: number;
  historyDepth: number;
  extraInstructions?: string;
}

export interface PlayerAction {
  type: 'movement' | 'interaction' | 'dialogue' | 'combat' | 'skill_check' | 'inventory';
  target?: string;
  params?: any;
  rawInput: string;
}

export interface NarrativeResult {
  success: boolean;
  narrative: string;
  dialogue?: string;
  stateChanges: any[];
  nextActions: Action[];
  error?: string;
}

export class NarrativeController {
  private llmProvider: LLMProvider;
  private mcpManager: MCPServerManager;
  private config: NarrativeConfig;
  private eventHistory: Event[] = [];
  private conversationStates: Map<string, any> = new Map();

  constructor(mcpManager: MCPServerManager, config: Partial<NarrativeConfig> = {}) {
    this.mcpManager = mcpManager;
    this.config = {
      llmProvider: 'ollama',
      model: 'gemma2:9b',
      fallbackModel: 'mistral:7b',
      temperature: 0.7,
      maxContextTokens: 4096,
      historyDepth: 10,
      ...config
    };

    // Initialize LLM provider
    this.initializeLLMProvider();
  }

  async initialize(): Promise<void> {
    console.log('[NarrativeController] Initializing...');
    
    try {
      await this.llmProvider.initialize();
      console.log('[NarrativeController] LLM provider ready');
    } catch (error) {
      console.error('[NarrativeController] Failed to initialize LLM provider:', error);
      throw error;
    }
  }

  async processPlayerAction(action: PlayerAction): Promise<NarrativeResult> {
    console.log(`[NarrativeController] Processing action: ${action.type} - "${action.rawInput}"`);

    try {
      // Step 1: Classify and validate action
      const classifiedAction = await this.classifyAction(action);
      
      // Step 2: Assemble context from MCP servers  
      const context = await this.assembleContext(classifiedAction);
      
      // Step 3: Execute mechanical aspects first
      const mechanicalResults = await this.executeMechanicalAction(classifiedAction);
      
      // Step 4: Generate LLM response with context
      const llmResponse = await this.generateNarrativeResponse(context, classifiedAction, mechanicalResults);
      
      // Step 5: Apply state changes
      const stateChanges = await this.applyStateChanges(llmResponse, mechanicalResults);
      
      // Step 6: Record event in history
      this.recordEvent(classifiedAction, llmResponse, mechanicalResults);
      
      // Step 7: Determine next available actions
      const nextActions = await this.getAvailableActions(context);

      return {
        success: true,
        narrative: llmResponse.narrative,
        dialogue: llmResponse.dialogue,
        stateChanges,
        nextActions
      };

    } catch (error: any) {
      console.error('[NarrativeController] Action processing failed:', error);
      
      return {
        success: false,
        narrative: this.generateErrorNarrative(error.message),
        stateChanges: [],
        nextActions: [],
        error: error.message
      };
    }
  }

  async startConversation(npcId: string, playerId: string = 'player'): Promise<NarrativeResult> {
    console.log(`[NarrativeController] Starting conversation between ${playerId} and ${npcId}`);

    try {
      // Get NPC and conversation context
      const npcTemplate = await this.mcpManager.executeTool('entity-content', 'getNPCTemplate', { npcId });
      const worldState = await this.mcpManager.executeTool('state', 'getWorldState', {});
      const relationship = await this.getRelationship(npcId, playerId);
      
      // Build conversation context
      const context = await this.assembleDialogueContext(npcId, playerId);
      
      // Generate opening dialogue
      const prompt: LLMPrompt = {
        systemContext: this.buildNPCSystemPrompt(npcTemplate.template, relationship),
        worldState: context.worldState,
        recentHistory: this.getRecentHistory(5),
        availableActions: await this.getConversationActions(npcId),
        query: `${npcTemplate.template.name} notices ${playerId} approaching. Generate an opening greeting or response based on their relationship and current situation.`
      };

      const response = await this.llmProvider.complete(prompt);
      
      // Record conversation start
      this.recordEvent({
        type: 'dialogue',
        target: npcId,
        rawInput: 'conversation_start'
      } as PlayerAction, response);

      return {
        success: true,
        narrative: response.narrative,
        dialogue: response.dialogue,
        stateChanges: [],
        nextActions: await this.getConversationActions(npcId)
      };

    } catch (error: any) {
      console.error('[NarrativeController] Conversation start failed:', error);
      return {
        success: false,
        narrative: "You approach, but something seems to have gone wrong with the conversation.",
        stateChanges: [],
        nextActions: [],
        error: error.message
      };
    }
  }

  async processDialogue(playerId: string, npcId: string, dialogue: string): Promise<NarrativeResult> {
    console.log(`[NarrativeController] Processing dialogue: ${playerId} -> ${npcId}: "${dialogue}"`);

    try {
      // Get conversation context
      const context = await this.assembleDialogueContext(npcId, playerId);
      const npcTemplate = await this.mcpManager.executeTool('entity-content', 'getNPCTemplate', { npcId });
      const relationship = await this.getRelationship(npcId, playerId);

      // Build dialogue prompt
      const prompt: LLMPrompt = {
        systemContext: this.buildNPCSystemPrompt(npcTemplate.template, relationship),
        worldState: context.worldState,
        recentHistory: this.getConversationHistory(npcId, playerId),
        availableActions: await this.getConversationActions(npcId),
        query: `${playerId} says: "${dialogue}". How does ${npcTemplate.template.name} respond? Consider their personality, current relationship, and the conversation context.`
      };

      const response = await this.llmProvider.complete(prompt);
      
      // Update relationship based on dialogue
      await this.updateRelationshipFromDialogue(npcId, playerId, dialogue, response);
      
      // Record dialogue event
      this.recordEvent({
        type: 'dialogue',
        target: npcId,
        rawInput: dialogue
      } as PlayerAction, response);

      return {
        success: true,
        narrative: response.narrative,
        dialogue: response.dialogue,
        stateChanges: [],
        nextActions: await this.getConversationActions(npcId)
      };

    } catch (error: any) {
      console.error('[NarrativeController] Dialogue processing failed:', error);
      return {
        success: false,
        narrative: "The conversation seems to falter as something goes wrong.",
        stateChanges: [],
        nextActions: [],
        error: error.message
      };
    }
  }

  // Private methods
  private initializeLLMProvider(): void {
    switch (this.config.llmProvider) {
      case 'ollama':
        this.llmProvider = new OllamaProvider({
          model: this.config.model,
          fallbackModel: this.config.fallbackModel,
          temperature: this.config.temperature,
          contextWindow: this.config.maxContextTokens,
          autoDownload: true
        });
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${this.config.llmProvider}`);
    }
  }

  private async classifyAction(action: PlayerAction): Promise<PlayerAction> {
    // Enhanced action classification - could use LLM for ambiguous cases
    const input = action.rawInput.toLowerCase().trim();
    
    // Movement patterns
    if (input.match(/^(go|move|walk|run|enter|exit|leave)\s+(to\s+)?(.+)/)) {
      return { ...action, type: 'movement' };
    }
    
    // Dialogue patterns
    if (input.match(/^(say|tell|ask|speak)\s+/) || input.startsWith('"')) {
      return { ...action, type: 'dialogue' };
    }
    
    // Interaction patterns
    if (input.match(/^(use|take|pick|grab|open|close|push|pull|examine|look)\s+/)) {
      return { ...action, type: 'interaction' };
    }
    
    // Combat patterns
    if (input.match(/^(attack|fight|hit|strike|cast|shoot)\s+/)) {
      return { ...action, type: 'combat' };
    }
    
    // Skill check patterns
    if (input.match(/^(sneak|hide|search|investigate|listen|climb)\s*/)) {
      return { ...action, type: 'skill_check' };
    }
    
    // Default to interaction
    return { ...action, type: 'interaction' };
  }

  private async assembleContext(action: PlayerAction): Promise<WorldContext> {
    const worldState = await this.mcpManager.executeTool('state', 'getWorldState', {});
    const currentRoom = worldState.currentRoom;
    
    // Assemble room context
    const roomContext = await this.mcpManager.assembleContext('room', { roomId: currentRoom });
    
    // Get NPCs in room
    const npcIds = roomContext.data.npcs || [];
    const presentNPCs: NPCContext[] = [];
    
    for (const npcId of npcIds) {
      try {
        const npcTemplate = await this.mcpManager.executeTool('entity-content', 'getNPCTemplate', { npcId });
        const relationship = await this.getRelationship(npcId, 'player');
        
        if (npcTemplate.template) {
          presentNPCs.push({
            id: npcId,
            name: npcTemplate.template.name,
            description: npcTemplate.template.description || '',
            currentMood: 'neutral',
            relationship: {
              trust: relationship.trust || 0,
              fear: relationship.fear || 0,
              respect: relationship.respect || 0
            },
            recentMemories: []
          });
        }
      } catch (error) {
        console.warn(`[NarrativeController] Failed to get NPC context for ${npcId}:`, error);
      }
    }

    return {
      currentRoom,
      roomDescription: roomContext.data.room?.description || 'An unremarkable room.',
      connectedRooms: roomContext.data.connectedRooms || [],
      presentNPCs,
      visibleItems: roomContext.data.items || [],
      environment: {
        lighting: roomContext.data.environment?.lighting || 'normal',
        sounds: roomContext.data.environment?.sounds || [],
        smells: roomContext.data.environment?.smells || [],
        hazards: roomContext.data.environment?.hazards || []
      },
      gameTime: {
        timeOfDay: this.getTimeOfDay(worldState.worldTime)
      }
    };
  }

  private async executeMechanicalAction(action: PlayerAction): Promise<any> {
    const results: any = {};

    try {
      switch (action.type) {
        case 'movement':
          results.movement = await this.handleMovement(action);
          break;
          
        case 'skill_check':
          results.skillCheck = await this.handleSkillCheck(action);
          break;
          
        case 'combat':
          results.combat = await this.handleCombat(action);
          break;
          
        case 'interaction':
          results.interaction = await this.handleInteraction(action);
          break;
          
        default:
          results.generic = { success: true, message: 'Action processed' };
      }
    } catch (error) {
      console.error(`[NarrativeController] Mechanical action failed:`, error);
      results.error = error;
    }

    return results;
  }

  private async generateNarrativeResponse(context: WorldContext, action: PlayerAction, mechanicalResults: any): Promise<LLMResponse> {
    const prompt: LLMPrompt = {
      systemContext: "You are the narrator for an immersive text adventure game. Generate vivid, engaging descriptions that bring the world to life.",
      worldState: context,
      recentHistory: this.getRecentHistory(this.config.historyDepth),
      availableActions: await this.getAvailableActions(context),
      query: this.buildActionQuery(action, mechanicalResults)
    };

    return await this.llmProvider.complete(prompt);
  }

  private buildActionQuery(action: PlayerAction, mechanicalResults: any): string {
    let query = `The player attempts to: "${action.rawInput}"\n\n`;
    
    if (mechanicalResults.skillCheck) {
      const check = mechanicalResults.skillCheck;
      query += `Skill check result: ${check.success ? 'SUCCESS' : 'FAILURE'} (rolled ${check.roll.total} vs DC ${check.difficulty})\n`;
    }
    
    if (mechanicalResults.combat) {
      const combat = mechanicalResults.combat;
      query += `Combat result: ${combat.hit ? 'HIT' : 'MISS'} ${combat.damage ? `for ${combat.damage} damage` : ''}\n`;
    }
    
    if (mechanicalResults.movement) {
      const movement = mechanicalResults.movement;
      query += `Movement result: ${movement.success ? 'SUCCESS' : 'BLOCKED'} - ${movement.message}\n`;
    }

    query += "\nGenerate a compelling narrative response that incorporates these results. Include sensory details, atmosphere, and any dialogue from NPCs if appropriate.";
    
    return query;
  }

  private async applyStateChanges(llmResponse: LLMResponse, mechanicalResults: any): Promise<any[]> {
    const changes: any[] = [];
    
    // Apply mechanical state changes
    if (mechanicalResults.movement?.success) {
      await this.mcpManager.executeTool('state', 'setCurrentRoom', { 
        roomId: mechanicalResults.movement.targetRoom 
      });
      changes.push({ type: 'room_change', room: mechanicalResults.movement.targetRoom });
    }
    
    if (mechanicalResults.combat?.damage > 0) {
      await this.mcpManager.executeTool('character-state', 'modifyHealth', {
        characterId: mechanicalResults.combat.target,
        amount: -mechanicalResults.combat.damage,
        type: 'damage'
      });
      changes.push({ type: 'health_change', target: mechanicalResults.combat.target, amount: -mechanicalResults.combat.damage });
    }

    // Apply LLM-suggested state changes
    if (llmResponse.stateChanges) {
      for (const change of Object.entries(llmResponse.stateChanges)) {
        // Process state changes suggested by LLM
        changes.push({ type: 'llm_suggestion', change });
      }
    }

    return changes;
  }

  private recordEvent(action: PlayerAction, response: LLMResponse, mechanicalResults?: any): void {
    const event: Event = {
      timestamp: Date.now(),
      type: action.type as any,
      actor: 'player',
      target: action.target,
      description: response.narrative,
      outcome: mechanicalResults ? JSON.stringify(mechanicalResults) : undefined
    };

    this.eventHistory.push(event);
    
    // Keep history manageable
    if (this.eventHistory.length > 100) {
      this.eventHistory = this.eventHistory.slice(-50);
    }
  }

  private async getAvailableActions(context: WorldContext): Promise<Action[]> {
    const actions: Action[] = [
      {
        id: 'look',
        name: 'Look around',
        description: 'Examine your surroundings more carefully'
      },
      {
        id: 'inventory',
        name: 'Check inventory',
        description: 'See what items you are carrying'
      }
    ];

    // Add movement actions
    for (const roomId of context.connectedRooms) {
      actions.push({
        id: `move_${roomId}`,
        name: `Go to ${roomId}`,
        description: `Move to ${roomId}`
      });
    }

    // Add NPC interaction actions
    for (const npc of context.presentNPCs) {
      actions.push({
        id: `talk_${npc.id}`,
        name: `Talk to ${npc.name}`,
        description: `Start a conversation with ${npc.name}`
      });
    }

    // Add item interaction actions
    for (const item of context.visibleItems) {
      actions.push({
        id: `examine_${item}`,
        name: `Examine ${item}`,
        description: `Look at ${item} more closely`
      });
    }

    return actions;
  }

  // Helper methods for specific action types
  private async handleMovement(action: PlayerAction): Promise<any> {
    // Extract target room from input
    const input = action.rawInput.toLowerCase();
    const directionMatch = input.match(/(?:go|move|walk|run|enter|exit|leave)\s+(?:to\s+)?(.+)/);
    
    if (!directionMatch) {
      return { success: false, message: 'Could not determine where to go' };
    }

    const target = directionMatch[1].trim();
    
    // Get current room and connections
    const worldState = await this.mcpManager.executeTool('state', 'getWorldState', {});
    const roomContext = await this.mcpManager.assembleContext('room', { roomId: worldState.currentRoom });
    
    // Find matching connected room
    const connectedRooms = roomContext.data.connectedRooms || [];
    const targetRoom = connectedRooms.find((room: string) => 
      room.toLowerCase().includes(target) || target.includes(room.toLowerCase())
    );

    if (targetRoom) {
      await this.mcpManager.executeTool('state', 'setCurrentRoom', { roomId: targetRoom });
      return { success: true, targetRoom, message: `Moved to ${targetRoom}` };
    } else {
      return { success: false, message: `Cannot go ${target} from here` };
    }
  }

  private async handleSkillCheck(action: PlayerAction): Promise<any> {
    // Determine skill and difficulty from input
    const input = action.rawInput.toLowerCase();
    let skill = 'perception'; // default
    let difficulty = 15; // default DC
    
    if (input.includes('sneak') || input.includes('hide')) {
      skill = 'stealth';
      difficulty = 15;
    } else if (input.includes('search') || input.includes('investigate')) {
      skill = 'investigation';
      difficulty = 15;
    } else if (input.includes('listen')) {
      skill = 'perception';
      difficulty = 12;
    }

    return await this.mcpManager.executeTool('mechanics-content', 'performSkillCheck', {
      character: 'player',
      skill,
      difficulty
    });
  }

  private async handleCombat(action: PlayerAction): Promise<any> {
    // Extract target from input
    const input = action.rawInput.toLowerCase();
    const targetMatch = input.match(/(?:attack|fight|hit|strike|cast|shoot)\s+(.+)/);
    
    if (!targetMatch) {
      return { success: false, message: 'Could not determine target' };
    }

    const target = targetMatch[1].trim();
    
    return await this.mcpManager.executeTool('mechanics-content', 'resolveAttack', {
      attacker: 'player',
      defender: target,
      type: 'melee'
    });
  }

  private async handleInteraction(action: PlayerAction): Promise<any> {
    // Generic interaction handling
    return { success: true, message: 'Interaction processed', action: action.rawInput };
  }

  // Dialogue and relationship helpers
  private async getRelationship(npcId: string, playerId: string): Promise<any> {
    try {
      // This would typically call a memory/relationship MCP server
      // For now, return default values
      return { trust: 0, fear: 0, respect: 0 };
    } catch {
      return { trust: 0, fear: 0, respect: 0 };
    }
  }

  private async assembleDialogueContext(npcId: string, playerId: string): Promise<any> {
    const worldState = await this.mcpManager.executeTool('state', 'getWorldState', {});
    const worldContext = await this.assembleContext({ type: 'dialogue', rawInput: '', target: npcId } as PlayerAction);
    
    return { worldState: worldContext };
  }

  private buildNPCSystemPrompt(npcTemplate: any, relationship: any): string {
    let prompt = `You are ${npcTemplate.name}. `;
    
    if (npcTemplate.description) {
      prompt += `${npcTemplate.description} `;
    }
    
    if (npcTemplate.personality?.traits) {
      prompt += `Your personality traits: ${npcTemplate.personality.traits.join(', ')}. `;
    }
    
    if (relationship.trust !== undefined) {
      const trustLevel = relationship.trust > 50 ? 'trusts' : relationship.trust < -50 ? 'distrusts' : 'is neutral towards';
      prompt += `You ${trustLevel} the player. `;
    }
    
    prompt += `Stay in character and respond naturally to the conversation.`;
    
    return prompt;
  }

  private async getConversationActions(npcId: string): Promise<Action[]> {
    return [
      {
        id: 'continue_conversation',
        name: 'Continue talking',
        description: 'Continue the conversation'
      },
      {
        id: 'end_conversation',
        name: 'End conversation',
        description: 'Politely end the conversation'
      }
    ];
  }

  private async updateRelationshipFromDialogue(npcId: string, playerId: string, dialogue: string, response: LLMResponse): Promise<void> {
    // This would update relationship values based on dialogue content
    // For now, just log the interaction
    console.log(`[NarrativeController] Dialogue interaction: ${playerId} -> ${npcId}`);
  }

  private getRecentHistory(count: number): Event[] {
    return this.eventHistory.slice(-count);
  }

  private getConversationHistory(npcId: string, playerId: string): Event[] {
    return this.eventHistory
      .filter(event => 
        event.type === 'dialogue' && 
        (event.actor === playerId || event.actor === npcId) &&
        (event.target === npcId || event.target === playerId)
      )
      .slice(-5); // Last 5 dialogue exchanges
  }

  private getTimeOfDay(worldTime: any): string {
    if (!worldTime || typeof worldTime.hour !== 'number') {
      return 'day';
    }

    const hour = worldTime.hour;
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  private generateErrorNarrative(error: string): string {
    const errorNarratives = [
      "Something seems to go wrong as reality flickers for a moment...",
      "The world hesitates, as if unsure how to respond...",
      "A strange distortion passes through the air...",
      "Time seems to skip a beat as the world recalibrates..."
    ];
    
    return errorNarratives[Math.floor(Math.random() * errorNarratives.length)];
  }

  // Cleanup
  async shutdown(): Promise<void> {
    console.log('[NarrativeController] Shutting down...');
    
    if (this.llmProvider) {
      await this.llmProvider.shutdown();
    }
    
    this.eventHistory = [];
    this.conversationStates.clear();
  }
}