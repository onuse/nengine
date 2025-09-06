# Narrative Engine - MCP Server Interfaces Specification

## Overview
MCP servers are divided into **Content Servers** (read game data) and **Runtime Servers** (manage live state). All mutations are tracked through Git commits for branching timeline support.

## Core Types

```typescript
interface EntityId {
  id: string;           // "tavern_main" or "generated_shard_001"
  isStatic: boolean;    // Designer-created vs dynamically generated
}

interface MutationClause {
  shatterable?: boolean;
  combustible?: boolean;
  combines?: string[];        // Can combine with these items
  creates?: string[];         // Templates for created items
  message?: string;          // Explanation if mutation blocked
  preserve?: string[];       // Properties that must persist through mutation
}

interface Position {
  room: string;
  container?: string;  // Inside another object
  worn?: string;      // Equipped on body part
  coordinates?: {x: number, y: number, z: number}; // For precise positioning
}

interface GitContext {
  branch: string;
  commit: string;
  message: string;
}
```

## Content MCP Servers

### 1. World Content Server (`world-content-mcp`)
**Purpose**: Provides static world data and manages dynamic space creation

```typescript
interface WorldContentMCP {
  // Read static world data
  getRoom(roomId: string): Room | null;
  getRoomsInRegion(region: string): Room[];
  getConnectedRooms(roomId: string): string[];
  
  // Dynamic space creation
  createDynamicRoom(params: {
    parentRoom: string;
    type: 'hidden' | 'temporary' | 'discovered';
    name: string;
    description: string;
    connections: Record<string, string>;
  }): EntityId;
  
  // Query room contents
  getItemsInRoom(roomId: string): EntityId[];
  getNPCsInRoom(roomId: string): EntityId[];
  
  // Environmental queries
  getLighting(roomId: string): 'dark' | 'dim' | 'normal' | 'bright';
  getEnvironment(roomId: string): {
    temperature: number;
    hazards: string[];
    sounds: string[];
    smells: string[];
  };
}

interface Room {
  id: string;
  name: string;
  description: string;
  exits: Record<string, string>;
  properties: Record<string, any>;
  mutations?: MutationClause;
  hiddenExits?: Record<string, {
    targetRoom: string;
    discoveryCondition: string;
  }>;
}
```

### 2. Entity Content Server (`entity-content-mcp`)
**Purpose**: Manages NPC and item templates, creates dynamic entities

```typescript
interface EntityContentMCP {
  // NPC Operations
  getNPCTemplate(npcId: string): NPCTemplate | null;
  createDynamicNPC(params: {
    baseTemplate?: string;
    name: string;
    personality: PersonalityTraits;
    role: string;
    spawn: Position;
  }): EntityId;
  
  // Item Operations  
  getItemTemplate(itemId: string): ItemTemplate | null;
  createDynamicItem(params: {
    baseTemplate?: string;
    name: string;
    properties: Record<string, any>;
    position: Position;
  }): EntityId;
  
  // Item Mutations
  shatterItem(itemId: string): {
    success: boolean;
    created: EntityId[];
    message: string;
  };
  
  combineItems(itemIds: string[]): {
    success: boolean;
    created: EntityId;
    consumed: string[];
    message: string;
  };
  
  // Bulk queries
  searchItems(filter: {
    type?: string;
    properties?: Record<string, any>;
    name?: RegExp;
  }): ItemTemplate[];
}

interface NPCTemplate {
  id: string;
  name: string;
  personality: PersonalityTraits;
  stats: CharacterStats;
  knowledge: KnowledgeDomain[];
  schedule?: NPCSchedule;
  mutations?: MutationClause;
  dialogueStyle?: {
    formality: 'casual' | 'formal' | 'archaic';
    verbosity: 'terse' | 'normal' | 'verbose';
    quirks: string[];
  };
}

interface ItemTemplate {
  id: string;
  name: string;
  description: string;
  type: 'weapon' | 'tool' | 'consumable' | 'container' | 'misc';
  properties: Record<string, any>;
  mutations?: MutationClause;
  weight?: number;
  value?: number;
}

interface PersonalityTraits {
  traits: string[];
  goals: string[];
  fears: string[];
  values: string[];
  secrets?: string[];
}
```

### 3. Mechanics Content Server (`mechanics-content-mcp`)
**Purpose**: Handles game rules, dice rolls, and action resolution

```typescript
interface MechanicsContentMCP {
  // Dice operations
  roll(dice: string): DiceResult; // "3d6+2", "1d20", etc.
  rollWithAdvantage(dice: string, type: 'advantage' | 'disadvantage'): DiceResult;
  
  // Skill checks
  performSkillCheck(params: {
    character: string;
    skill: string;
    difficulty: number;
    modifiers?: Record<string, number>;
  }): SkillCheckResult;
  
  // Combat resolution
  resolveAttack(params: {
    attacker: string;
    defender: string;
    weapon?: string;
    type: 'melee' | 'ranged' | 'spell';
  }): CombatResult;
  
  // Damage and effects
  applyDamage(params: {
    target: string;
    amount: number;
    type: string;
    source?: string;
  }): DamageResult;
  
  // Action validation
  canPerformAction(params: {
    actor: string;
    action: string;
    target?: string;
    context: Record<string, any>;
  }): ValidationResult;
  
  // Load rule definitions
  getRuleSet(category: string): RuleDefinition[];
  getSkillDefinition(skill: string): SkillDefinition;
}

interface DiceResult {
  rolls: number[];
  modifier: number;
  total: number;
  critical?: boolean;
  fumble?: boolean;
}

interface SkillCheckResult {
  success: boolean;
  degree: 'critical_failure' | 'failure' | 'success' | 'critical_success';
  roll: DiceResult;
  difficulty: number;
  margin: number;
}
```

## Runtime MCP Servers

### 4. State Management Server (`state-mcp`)
**Purpose**: Tracks current game state with Git versioning

```typescript
interface StateMCP {
  // Git operations
  getCurrentBranch(): string;
  getBranches(): string[];
  switchBranch(branch: string): void;
  createBranch(name: string, fromCommit?: string): void;
  cherryPick(commits: string[]): void;
  
  // State snapshots
  saveState(message: string): string; // Returns commit hash
  loadState(commitOrBranch: string): void;
  getHistory(branch?: string, limit?: number): Commit[];
  
  // Position tracking
  getEntityPosition(entityId: string): Position;
  moveEntity(entityId: string, to: Position): void;
  
  // Inventory management
  getInventory(entityId: string): string[];
  transferItem(itemId: string, from: string, to: string): void;
  
  // World state changes
  modifyRoomState(roomId: string, changes: Record<string, any>): void;
  modifyEntityState(entityId: string, changes: Record<string, any>): void;
  
  // Bulk state queries
  getWorldState(): WorldState;
  getDiff(from: string, to: string): StateDiff;
}

interface WorldState {
  currentRoom: string;
  party: string[];
  worldTime: GameTime;
  flags: Record<string, any>;
  dynamicEntities: EntityId[];
}

interface Commit {
  hash: string;
  branch: string;
  message: string;
  timestamp: number;
  changes: StateDiff;
}
```

### 5. Memory & Relationships Server (`memory-mcp`)
**Purpose**: Manages NPC memories, relationships, and knowledge

```typescript
interface MemoryMCP {
  // Memory management
  recordMemory(params: {
    npc: string;
    type: 'event' | 'conversation' | 'observation';
    content: any;
    importance: number;
    participants?: string[];
  }): void;
  
  getMemories(params: {
    npc: string;
    about?: string;
    type?: string;
    limit?: number;
    minImportance?: number;
  }): Memory[];
  
  forgetMemories(npc: string, olderThan: number): void;
  
  // Relationship tracking
  getRelationship(npc: string, target: string): Relationship;
  modifyRelationship(params: {
    npc: string;
    target: string;
    changes: Partial<Relationship>;
  }): void;
  
  // Knowledge management
  knows(npc: string, fact: string): boolean;
  teach(npc: string, facts: string[]): void;
  getKnowledge(npc: string, topic: string): Knowledge[];
  
  // Social dynamics
  getReputation(entity: string, faction?: string): number;
  modifyReputation(entity: string, change: number, faction?: string): void;
  getSocialNetwork(npc: string, depth?: number): SocialGraph;
}

interface Memory {
  id: string;
  timestamp: number;
  type: string;
  content: any;
  importance: number;
  emotionalValence?: number;
  associations: string[];
}

interface Relationship {
  trust: number;        // -100 to 100
  affection: number;    // -100 to 100  
  respect: number;      // -100 to 100
  fear: number;         // 0 to 100
  history: string[];    // Key events
  lastInteraction: number;
}
```

### 6. Narrative Control Server (`narrative-mcp`)
**Purpose**: Manages quests, story progression, and narrative coherence

```typescript
interface NarrativeMCP {
  // Quest management
  getActiveQuests(): Quest[];
  getQuestStatus(questId: string): QuestStatus;
  updateQuestProgress(questId: string, milestone: string): void;
  completeQuest(questId: string, outcome: string): void;
  
  // Story flags and triggers
  setStoryFlag(flag: string, value: any): void;
  getStoryFlag(flag: string): any;
  checkTriggers(context: TriggerContext): Trigger[];
  
  // Narrative generation hints
  getNarrativeContext(scene: string): NarrativeContext;
  getSuggestedTone(): 'tense' | 'relaxed' | 'mysterious' | 'action' | 'emotional';
  getRelevantThemes(): string[];
  
  // Conversation management
  startConversation(participants: string[]): string; // Returns conversation ID
  addDialogue(conversationId: string, speaker: string, text: string): void;
  getConversationHistory(conversationId: string, limit?: number): Dialogue[];
  
  // Scene management
  getCurrentScene(): Scene;
  transitionScene(to: string, type: 'cut' | 'fade' | 'dramatic'): void;
}

interface Quest {
  id: string;
  name: string;
  description: string;
  objectives: Objective[];
  rewards: Reward[];
  status: 'available' | 'active' | 'completed' | 'failed';
  timeLimit?: number;
}

interface NarrativeContext {
  currentTension: number;  // 0-10
  recentEvents: string[];
  activeThreats: string[];
  opportunities: string[];
  mood: string;
}
```

### 7. Time & Scheduling Server (`time-mcp`)
**Purpose**: Manages game time, NPC schedules, and time-based events

```typescript
interface TimeMCP {
  // Time management
  getCurrentTime(): GameTime;
  advanceTime(minutes: number): TimeAdvanceResult;
  setTime(time: GameTime): void;
  
  // Scheduling
  getNPCSchedule(npc: string): Schedule;
  whereIsNPC(npc: string, time?: GameTime): Position;
  whenIsNPCAt(npc: string, location: string): TimeRange[];
  
  // Events
  scheduleEvent(params: {
    time: GameTime;
    type: string;
    data: any;
    recurring?: RecurrenceRule;
  }): string;
  
  getUpcomingEvents(hours: number): ScheduledEvent[];
  cancelEvent(eventId: string): void;
  
  // Environmental effects
  getTimeOfDay(): 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';
  getWeather(): Weather;
  getLightLevel(location: string): number;
}

interface GameTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

interface TimeAdvanceResult {
  events: ScheduledEvent[];
  npcMovements: NPCMovement[];
  environmentChanges: Record<string, any>;
}
```

## LLM Integration Protocol

Each MCP server exposes its tools to the LLM through a standardized protocol:

```typescript
interface MCPTool {
  name: string;
  description: string;
  parameters: ParameterSchema;
  returns: ReturnSchema;
  examples: Example[];
}

// The LLM can discover available tools
interface MCPServer {
  listTools(): MCPTool[];
  executeTool(name: string, params: any): any;
  getServerInfo(): {
    name: string;
    version: string;
    capabilities: string[];
  };
}
```

## Data Flow Example

When the player says "I shatter the wine bottle to make a weapon":

1. **Narrative Controller** assembles context using multiple MCPs:
   ```typescript
   const item = await entityContent.getItemTemplate('wine_bottle');
   const canShatter = await mechanics.canPerformAction({
     actor: 'player',
     action: 'shatter',
     target: 'wine_bottle'
   });
   ```

2. **LLM** receives context and generates narrative response

3. **Narrative Controller** executes the action:
   ```typescript
   const result = await entityContent.shatterItem('wine_bottle');
   await state.saveState('Player shattered wine bottle');
   ```

4. **State** is persisted with Git commit

5. **UI** receives update with narrative text and state changes

## Debug Mode Support

All MCP servers should implement debug interfaces when `DEBUG_MODE=true`:

```typescript
interface DebugCapable {
  getDebugInfo(): DebugInfo;
  enableVerboseLogging(enabled: boolean): void;
  getPerformanceMetrics(): PerformanceMetrics;
}

interface DebugInfo {
  serverName: string;
  lastOperations: Operation[];
  currentState: any;
  warnings: string[];
  generatedEntities?: EntityId[];  // For entity server
  gitBranch?: string;              // For state server
  contextSize?: number;            // For narrative history
}
```

Debug output is sent via separate WebSocket channel to avoid contaminating the narrative text that the LLM ingests.

## Performance Optimizations

- **Lazy Loading**: MCP servers load data on-demand
- **Caching Layer**: Frequently accessed data cached in memory
- **Batch Operations**: Multiple related queries bundled
- **Delta Updates**: Only changed data transmitted to UI
- **Background Simulation**: NPC actions calculated during player input

## Error Handling

All MCP operations should handle:
- Entity not found
- Invalid state transitions  
- Mutation restrictions
- Git conflicts during merge/cherry-pick
- LLM timeout or failure

Each error returns structured data allowing the Narrative Controller to generate appropriate in-game responses rather than breaking immersion.