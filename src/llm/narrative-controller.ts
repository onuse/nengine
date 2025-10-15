/**
 * Narrative Controller
 * Orchestrates LLM interactions and game mechanics
 */

import { MCPServerManager } from '../mcp/mcp-server-manager';
import { LLMProvider, LLMPrompt, LLMResponse, WorldContext, Event, Action, NPCContext } from './types';
import { CreativeServerProvider } from './creative-server-provider';
import { AgentOrchestrator } from '../agents/agent-orchestrator';

export interface NarrativeConfig {
  llmProvider: 'creative-server';  // Only creative-server supported
  model: string;
  temperature: number;
  maxContextTokens: number;
  historyDepth: number;
  extraInstructions?: string;
  useAgents?: boolean;
  agentConfig?: {
    enabled: boolean;
    variationModel?: string;
    evaluationModel?: string;
    timeoutMs?: number;
  };
  creativeServer?: {
    baseUrl?: string;
    adminUrl?: string;
    autoSwitch?: boolean;
  };
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
  commitHash?: string;  // Git commit hash for this action (enables rollback)
  error?: string;
}

export class NarrativeController {
  private llmProvider!: LLMProvider;
  private mcpManager: MCPServerManager;
  private config: NarrativeConfig;
  private eventHistory: Event[] = [];
  private conversationStates: Map<string, any> = new Map();
  private requestCache: Map<string, any> = new Map();
  private agentOrchestrator?: AgentOrchestrator;

  constructor(mcpManager: MCPServerManager, config: Partial<NarrativeConfig> = {}) {
    this.mcpManager = mcpManager;
    this.config = {
      llmProvider: 'creative-server',
      model: 'llama-3.3-70b-abliterated',
      temperature: 0.9,
      maxContextTokens: 32000,
      historyDepth: 30,  // Increased from 10 - we have 32K tokens available
      ...config
    };

    // Initialize LLM provider
    this.initializeLLMProvider();
    
    // Initialize agent system if configured
    if (this.config.useAgents) {
      this.agentOrchestrator = new AgentOrchestrator(
        this.mcpManager,
        (action, context, mechanicalResults) => this.generateDirectResponse(action, context, mechanicalResults),
        this.config.agentConfig
      );
    }
  }

  async initialize(): Promise<void> {
    console.log('[NarrativeController] Initializing...');
    
    try {
      await this.llmProvider.initialize('');
      console.log('[NarrativeController] LLM provider ready');
      
      // Initialize agent system if enabled
      if (this.agentOrchestrator) {
        await this.agentOrchestrator.initialize();
        console.log('[NarrativeController] Agent system ready');
      }
    } catch (error) {
      console.error('[NarrativeController] Failed to initialize:', error);
      throw error;
    }
  }

  async processPlayerAction(action: PlayerAction): Promise<NarrativeResult> {
    console.log(`[NarrativeController] Processing action: ${action.type} - "${action.rawInput}"`);

    // Clear request cache at start of each action
    this.clearRequestCache();

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

      // Step 7: Save state to Git and get commit hash (for rollback support)
      let commitHash: string | undefined;
      try {
        commitHash = await this.mcpManager.executeTool(
          'state',
          'saveState',
          { message: `Player action: ${action.rawInput}` }
        );
        console.log(`[NarrativeController] State saved with commit: ${commitHash?.substring(0, 8)}`);
      } catch (error) {
        console.warn('[NarrativeController] Failed to save state to Git:', error);
        // Continue without commit hash - rollback won't be available for this turn
      }

      // Step 8: Determine next available actions
      const nextActions = await this.getAvailableActions(context);

      return {
        success: true,
        narrative: llmResponse.narrative,
        dialogue: llmResponse.dialogue,
        stateChanges,
        nextActions,
        commitHash
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
      // const worldState = await this.mcpManager.executeTool('state', 'getWorldState', {}); // Unused in current implementation
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
    // Only creative-server is supported
    this.llmProvider = new CreativeServerProvider({
      baseUrl: this.config.creativeServer?.baseUrl,
      adminUrl: this.config.creativeServer?.adminUrl,
      textModel: this.config.model,
      temperature: this.config.temperature,
      contextWindow: this.config.maxContextTokens,
      autoSwitch: this.config.creativeServer?.autoSwitch ?? true
    });
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

  private async assembleContext(_action: PlayerAction): Promise<WorldContext> {
    const worldState = await this.mcpManager.executeTool('state', 'getWorldState', {});
    const currentRoom = worldState.currentRoom;
    
    // Assemble room context
    const roomContext = await this.mcpManager.assembleContext('room', { roomId: currentRoom });
    
    // Get NPCs in room
    const npcIds = roomContext.data.npcs || [];
    const presentNPCs: NPCContext[] = [];

    for (const npcEntity of npcIds) {
      try {
        // Extract the actual ID from the EntityId object
        const npcId = typeof npcEntity === 'string' ? npcEntity : npcEntity.id;
        const npcTemplate = await this.mcpManager.executeTool('entity-content', 'getNPCTemplate', { npcId });
        const relationship = await this.getRelationship(npcId, 'player');
        
        if (npcTemplate.template) {
          // Build comprehensive NPC description including appearance details
          let fullDescription = npcTemplate.template.description || '';

          // Add appearance details if available
          if (npcTemplate.template.appearance) {
            const app = npcTemplate.template.appearance;
            const details: string[] = [];

            if (app.hair) details.push(`Hair: ${app.hair}`);
            if (app.eyes) details.push(`Eyes: ${app.eyes}`);
            if (app.build) details.push(`Build: ${app.build}`);
            if (app.style) details.push(`Wearing: ${app.style}`);
            if (app.distinctive) details.push(`Distinctive: ${app.distinctive}`);

            if (details.length > 0) {
              fullDescription += (fullDescription ? ' ' : '') + details.join('. ') + '.';
            }
          }

          // Add personality traits if available
          if (npcTemplate.template.personality?.traits) {
            fullDescription += ` Personality: ${npcTemplate.template.personality.traits.join(', ')}.`;
          }

          // Add secrets (hidden information that GM knows but player doesn't)
          if (npcTemplate.template.secrets && npcTemplate.template.secrets.length > 0) {
            fullDescription += ` [GM Knowledge - Secrets: ${npcTemplate.template.secrets.join('; ')}]`;
          }

          presentNPCs.push({
            id: npcId,
            name: npcTemplate.template.name,
            description: fullDescription,
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

    console.log(`[DEBUG] assembleContext: Found ${presentNPCs.length} NPCs`);
    if (presentNPCs.length > 0) {
      console.log(`[DEBUG] NPCs:`, presentNPCs.map(n => `${n.name} - ${n.description.substring(0, 100)}`));
    }

    return {
      currentRoom,
      currentRoomName: roomContext.data.room?.name || 'Unknown Location',
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
    // Try agent system first if available
    if (this.agentOrchestrator && this.agentOrchestrator.isEnabled()) {
      try {
        const agentResult = await this.agentOrchestrator.processAction(action, context, mechanicalResults);
        
        if (agentResult.success) {
          return {
            narrative: agentResult.narrative,
            dialogue: agentResult.dialogue || '',
            stateChanges: {}
          };
        }
      } catch (error) {
        console.warn('[NarrativeController] Agent system failed, falling back to direct generation:', error);
      }
    }

    // Fallback to direct generation
    return this.generateDirectResponse(action, context, mechanicalResults);
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

    // Add movement actions with batched room name lookup
    const roomNames = await this.batchGetRoomNames(context.connectedRooms);
    
    for (const roomId of context.connectedRooms) {
      const roomName = roomNames.get(roomId) || roomId;
      
      actions.push({
        id: `move_${roomId}`,
        name: `Go to ${roomName}`,
        description: `Move to ${roomName}`
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
  private async getRelationship(_npcId: string, _playerId: string): Promise<any> {
    try {
      // This would typically call a memory/relationship MCP server
      // For now, return default values
      return { trust: 0, fear: 0, respect: 0 };
    } catch {
      return { trust: 0, fear: 0, respect: 0 };
    }
  }

  private async assembleDialogueContext(npcId: string, _playerId: string): Promise<any> {
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
    
    // Append extra instructions for dialogue as well
    if (this.config.extraInstructions) {
      prompt += "\n\nAdditional instructions: " + this.config.extraInstructions;
    }
    
    return prompt;
  }

  private async getConversationActions(_npcId: string): Promise<Action[]> {
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

  private async updateRelationshipFromDialogue(npcId: string, playerId: string, _dialogue: string, _response: LLMResponse): Promise<void> {
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

  private generateErrorNarrative(_error: string): string {
    const errorNarratives = [
      "Something seems to go wrong as reality flickers for a moment...",
      "The world hesitates, as if unsure how to respond...",
      "A strange distortion passes through the air...",
      "Time seems to skip a beat as the world recalibrates..."
    ];
    
    return errorNarratives[Math.floor(Math.random() * errorNarratives.length)];
  }

  // Direct response generation (original method)
  private async generateDirectResponse(action: PlayerAction, context: WorldContext, mechanicalResults?: any): Promise<LLMResponse> {
    let systemContext = "You are the narrator for an immersive text adventure game. Generate vivid, engaging descriptions that bring the world to life.";
    
    // Append extra instructions from game configuration if provided
    if (this.config.extraInstructions) {
      systemContext += "\n\nAdditional instructions: " + this.config.extraInstructions;
      console.log('[NarrativeController] Using extraInstructions:', this.config.extraInstructions.substring(0, 100) + '...');
    } else {
      console.log('[NarrativeController] No extraInstructions configured');
    }
    
    const prompt: LLMPrompt = {
      systemContext,
      worldState: context,
      recentHistory: this.getRecentHistory(this.config.historyDepth),
      availableActions: await this.getAvailableActions(context),
      query: this.buildActionQuery(action, mechanicalResults || {})
    };

    return await this.llmProvider.complete(prompt);
  }

  // Agent control methods
  enableAgents(enabled: boolean): void {
    if (this.agentOrchestrator) {
      this.agentOrchestrator.setEnabled(enabled);
      console.log(`[NarrativeController] Agent system ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  getAgentMetrics(): any {
    return this.agentOrchestrator?.getMetrics() || null;
  }

  getNoveltyHistory(): any {
    return this.agentOrchestrator?.getNoveltyHistory() || null;
  }

  // Cleanup
  async shutdown(): Promise<void> {
    console.log('[NarrativeController] Shutting down...');
    
    if (this.llmProvider) {
      await this.llmProvider.shutdown();
    }
    
    if (this.agentOrchestrator) {
      await this.agentOrchestrator.shutdown();
    }
    
    this.eventHistory = [];
    this.conversationStates.clear();
  }

  /**
   * Batch lookup room names to minimize MCP calls
   */
  private async batchGetRoomNames(roomIds: string[]): Promise<Map<string, string>> {
    const roomNames = new Map<string, string>();
    
    // Check cache first
    const uncachedRoomIds: string[] = [];
    for (const roomId of roomIds) {
      const cacheKey = `room_name_${roomId}`;
      if (this.requestCache.has(cacheKey)) {
        roomNames.set(roomId, this.requestCache.get(cacheKey));
      } else {
        uncachedRoomIds.push(roomId);
      }
    }
    
    // Batch fetch uncached room names
    if (uncachedRoomIds.length > 0) {
      try {
        const promises = uncachedRoomIds.map(roomId => 
          this.mcpManager.executeTool('world-content', 'getRoom', { roomId })
        );
        
        const results = await Promise.all(promises);
        
        for (let i = 0; i < uncachedRoomIds.length; i++) {
          const roomId = uncachedRoomIds[i];
          const roomName = results[i]?.room?.name || roomId;
          const cacheKey = `room_name_${roomId}`;
          
          roomNames.set(roomId, roomName);
          this.requestCache.set(cacheKey, roomName);
        }
      } catch (error) {
        console.warn(`[NarrativeController] Batch room name lookup failed:`, error);
        // Fallback to room IDs for failed lookups
        for (const roomId of uncachedRoomIds) {
          roomNames.set(roomId, roomId);
        }
      }
    }
    
    return roomNames;
  }

  /**
   * Generate detailed image prompt from user instructions and current game context
   * Uses LLM to interpret the scene and create FLUX-compatible prompts
   */
  async generateImagePrompt(userInstructions: string): Promise<string> {
    console.log(`[NarrativeController] Generating image prompt with instructions: "${userInstructions}"`);

    try {
      // Get current game context
      const worldState = await this.mcpManager.executeTool('state', 'getWorldState', {});
      const context = await this.assembleContext({ type: 'interaction', rawInput: 'generate image', params: {} } as PlayerAction);

      // Build specialized system prompt for image generation
      const systemContext = `You are an expert at creating detailed image prompts for FLUX, a high-quality image generation model.

Your task is to analyze the current game scene and player instructions, then create a single, detailed image prompt.

IMPORTANT RULES:
- Output ONLY the image prompt text, nothing else
- No explanations, no additional text, just the prompt
- Maximum 200 words
- Be specific about visual details, lighting, atmosphere, and art style
- Include relevant details from the scene context
- Interpret vague instructions into specific visual descriptions`;

      // Build the query with full context
      let query = `Create a detailed FLUX image prompt based on this game scene:\n\n`;

      // Add location context
      query += `LOCATION: ${context.currentRoomName}\n`;
      query += `${context.roomDescription}\n\n`;

      // Add NPC context if any
      if (context.presentNPCs.length > 0) {
        query += `CHARACTERS PRESENT:\n`;
        for (const npc of context.presentNPCs) {
          console.log(`[DEBUG] NPC in prompt - ${npc.name}: ${npc.description.substring(0, 200)}...`);
          query += `- ${npc.name}: ${npc.description}\n`;
        }
        query += `\n`;
      }

      // Add environment details
      if (context.environment) {
        query += `ENVIRONMENT:\n`;
        query += `- Lighting: ${context.environment.lighting}\n`;
        if (context.environment.sounds.length > 0) {
          query += `- Sounds: ${context.environment.sounds.join(', ')}\n`;
        }
        if (context.environment.smells.length > 0) {
          query += `- Smells: ${context.environment.smells.join(', ')}\n`;
        }
        query += `\n`;
      }

      // Add recent narrative context (last 2 events for freshness)
      const recentHistory = this.getRecentHistory(2);
      if (recentHistory.length > 0) {
        query += `RECENT EVENTS:\n`;
        for (const event of recentHistory) {
          query += `${event.description}\n`;
        }
        query += `\n`;
      }

      // Add user's specific instructions
      if (userInstructions && userInstructions.trim().length > 0) {
        query += `PLAYER INSTRUCTIONS: ${userInstructions}\n\n`;
      }

      query += `Create a detailed FLUX image prompt that captures this scene. Output ONLY the prompt text.`;

      // Call LLM with specialized prompt
      const prompt: LLMPrompt = {
        systemContext,
        worldState: context,
        recentHistory: [],  // Already included in query
        availableActions: [],
        query
      };

      const response = await this.llmProvider.complete(prompt);

      // Extract just the prompt text (in case LLM adds extra formatting)
      let imagePrompt = response.narrative.trim();

      // Remove common prefixes that LLMs might add
      imagePrompt = imagePrompt.replace(/^(Image prompt:|Prompt:|Here's the prompt:|FLUX prompt:)\s*/i, '');

      // Remove quotes if the LLM wrapped it
      imagePrompt = imagePrompt.replace(/^["']|["']$/g, '');

      console.log(`[NarrativeController] Generated image prompt: ${imagePrompt.substring(0, 100)}...`);

      return imagePrompt;

    } catch (error: any) {
      console.error('[NarrativeController] Failed to generate image prompt:', error);
      // Fallback to basic prompt
      return `A scene from a fantasy adventure game, high quality digital art, detailed, atmospheric lighting`;
    }
  }

  /**
   * Clear request cache - called at the start of each action processing
   */
  private clearRequestCache(): void {
    this.requestCache.clear();
  }
}