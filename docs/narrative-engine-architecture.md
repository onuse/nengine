# Narrative Engine - Architecture Document

## Project Overview

A single-player text adventure engine that combines traditional text adventure mechanics with LLM-powered NPCs and interactions. The system uses a statically-defined world with dice-based mechanics, while leveraging language models to create dynamic character interactions and smooth narrative flow.

### Core Concept
- **Static World**: Persistent, designer-created world with defined locations, items, and rules
- **Dynamic Characters**: LLM-driven NPCs with personalities, memories, and goals
- **Mechanical Resolution**: Dice-based systems for combat, skill checks, and world interactions
- **Team Dynamics**: Focus on managing 3-4 party members with distinct personalities and relationships

## Technical Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Database**: SQLite for world state persistence
- **Version Control**: Embedded Git (isomorphic-git) for world state versioning
- **MCP**: TypeScript-based MCP servers for modular game systems

### Frontend
- **Framework**: Vue 3 with TypeScript
- **Build Tool**: Vite for development and bundling
- **UI Style**: Legend of the Sword-inspired interface with static panels and text interaction

### AI Integration
- **LLM Runtime**: Ollama (auto-downloaded on first boot)
- **Default Model**: Gemma 2 9B or Mistral 7B (hardware-dependent selection)
- **Interface**: Abstracted LLM layer for hot-swappable model support

## System Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Client                        │
│  ┌──────────┬────────────┬───────────┬──────────────┐  │
│  │ Viewport │ Character  │  Action   │ Text Console │  │
│  │  Panel   │   Panel    │    Bar    │   & Input    │  │
│  └──────────┴────────────┴───────────┴──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
                     WebSocket/HTTP
                            │
┌─────────────────────────────────────────────────────────┐
│                   Game Engine (Node.js)                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Narrative Controller                   │   │
│  │         (LLM orchestration & routing)            │   │
│  └─────────────────────────────────────────────────┘   │
│                            │                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │                 MCP Server Manager                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────────────┐  ┌────────────────┐  ┌──────────────┐
│  World State  │  │  Game Mechanics │  │ NPC Manager  │
│   MCP Server  │  │   MCP Server    │  │  MCP Server  │
└───────────────┘  └────────────────┘  └──────────────┘
        │                   │                   │
┌───────────────────────────────────────────────────────┐
│                    Data Layer                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   SQLite    │  │     Git      │  │  JSON/YAML  │ │
│  │  Database   │  │  Repository  │  │   Configs   │ │
│  └─────────────┘  └──────────────┘  └─────────────┘ │
└───────────────────────────────────────────────────────┘
```

## MCP Server Definitions

### 1. World State Server
- **Responsibility**: Manages physical world state
- **Functions**:
  - `getRoomDescription(roomId)`
  - `getConnectedRooms(roomId)`
  - `modifyRoom(roomId, changes)`
  - `getItemsInRoom(roomId)`
  - `moveItem(itemId, targetLocation)`

### 2. NPC Manager Server
- **Responsibility**: Handles NPC state and memory
- **Functions**:
  - `getNPCState(npcId)`
  - `updateNPCState(npcId, state)`
  - `getNPCMemory(npcId, aboutEntity)`
  - `recordNPCMemory(npcId, memory)`
  - `getNPCRelationship(npcId, targetId)`

### 3. Game Mechanics Server
- **Responsibility**: Dice rolls and rule resolution
- **Functions**:
  - `rollDice(sides, count, modifier)`
  - `resolveSkillCheck(characterId, skill, difficulty)`
  - `resolveCombat(attackerId, defenderId, action)`
  - `calculateDamage(weapon, armor, roll)`

### 4. Character State Server
- **Responsibility**: Player and party member stats
- **Functions**:
  - `getCharacterStats(characterId)`
  - `modifyCharacterStats(characterId, changes)`
  - `getInventory(characterId)`
  - `equipItem(characterId, itemId)`

### 5. Quest/Story Server
- **Responsibility**: Track narrative progress
- **Functions**:
  - `getActiveQuests()`
  - `updateQuestProgress(questId, milestone)`
  - `checkQuestTriggers(worldState)`
  - `getQuestRewards(questId)`

### 6. Economy Server
- **Responsibility**: Shop inventories and pricing
- **Functions**:
  - `getShopInventory(shopId)`
  - `purchaseItem(shopId, itemId, buyerId)`
  - `calculatePrice(itemId, buyerId, sellerId)`
  - `restockShop(shopId)`

### 7. Time/Calendar Server
- **Responsibility**: World time and scheduled events
- **Functions**:
  - `getCurrentTime()`
  - `advanceTime(duration)`
  - `getScheduledEvents(timeRange)`
  - `checkNPCSchedule(npcId, time)`

## LLM Integration Layer

### Narrative Controller
The Narrative Controller acts as the orchestrator between game mechanics and LLM:

1. **Input Processing**:
   - Parse player input
   - Determine if action requires LLM intervention
   - Route to appropriate MCP servers

2. **Context Assembly**:
   - Gather relevant world state from MCP servers
   - Build character personality profiles
   - Include recent conversation history
   - Add applicable game rules

3. **LLM Prompting**:
   ```typescript
   interface LLMPrompt {
     systemContext: string;      // Character description, personality
     worldState: WorldContext;   // Current location, present NPCs
     recentHistory: Event[];      // Last N actions/conversations
     availableActions: Action[];  // Valid actions in current context
     query: string;              // "What do you do?" or specific interaction
   }
   ```

4. **Response Processing**:
   - Parse LLM output for game actions
   - Validate against game rules
   - Execute through MCP servers
   - Generate narrative description

### LLM Abstraction Layer
```typescript
interface LLMProvider {
  initialize(modelPath: string): Promise<void>;
  complete(prompt: LLMPrompt): Promise<string>;
  switchModel(newModel: string): Promise<void>;
  getModelInfo(): ModelCapabilities;
}
```

Implementations:
- `OllamaProvider`
- `OpenAIProvider` (future)
- `LocalTransformerProvider` (future)

## Data Structures

### World Definition (YAML/JSON)

The format adapts to the game type. Here are two examples:

#### Fantasy Adventure Game
```yaml
rooms:
  tavern_main:
    name: "The Prancing Pony"
    description: "A warmly lit tavern with low timber beams and the permanent smell of ale and woodsmoke. Faded tapestries depicting hunting scenes cover the walls. The floorboards creak with every step, worn smooth by decades of boots."
    exits:
      north: tavern_upstairs
      south: market_square
    npcs: [bartender_tom, patron_1]
    items: [ale_barrel, notice_board]

npcs:
  bartender_tom:
    name: "Tom the Bartender"
    description: "A portly man in his fifties with tired eyes that have seen too much. His apron bears the stains of a thousand spilled drinks."
    personality: "Tom is everybody's friend until money is involved. He loves gossip more than gold, but gold pays the bills. Ever since the guard captain's men wrecked his tavern last winter 'looking for rebels', he gets visibly nervous when anyone in uniform walks in. He waters down the cheap ale but would never dare touch the good stuff - his reputation matters too much."
    carrying: [tavern_key, coin_pouch, rag]
    knowledge: "Tom knows every regular by name and drink preference. He remembers who hasn't paid their tab, who's cheating on their spouse, and exactly which guards take bribes. He saw the hooded figure who met with the merchant guild leader last week, though he pretends he didn't."
    # Only stats needed for this game's mechanics
    stats:
      health: 30
      strength: 12

items:
  longsword:
    type: weapon
    damage: 1d8
    value: 15
    description: "A well-balanced blade that has seen better days"
    
  healing_potion:
    type: consumable  
    effect: "restore 2d4 health"
    value: 50
    description: "Tastes like cherries mixed with copper"
```

#### Mystery/Detective Game
```yaml
rooms:
  library:
    name: "The Manor Library"
    description: "Three stories of books reach toward a painted ceiling depicting constellations that don't match any real sky. A ladder on rails provides access to higher shelves. You notice dust everywhere except for a specific section near the geography texts. The morning light through the east window would blind anyone sitting at the desk around 9 AM."
    exits:
      south: manor_hallway
      hidden_north: secret_study  # Found by pulling the red astronomy book
    
npcs:
  margaret_wadsworth:
    name: "Margaret Wadsworth"
    description: "Seventies, sharp-eyed, moves with a slight limp she tries to hide"
    personality: "Margaret has been the family librarian for forty years and considers these books her children. She pretends to be hard of hearing when convenient but misses nothing. She's fiercely protective of the rare editions and has been known to ban people for leaving books open face-down. She's terrified the new heir will sell the collection but would never admit it."
    routine: "Every morning at 9 AM sharp, she waters the plants in the greenhouse, leaving the library unattended for exactly 23 minutes."
    knowledge: "She knows there's a hidden room but has never found it. She saw Lord Wadsworth arguing with someone in the library the night he died but couldn't see who - the morning sun was in her eyes. She knows which books have been moved recently."
    carrying: [brass_key, reading_glasses, notebook]
    # No combat stats needed for this game type

items:
  brass_key:
    description: "Worn brass key with an unusual square tooth pattern"
    opens: greenhouse_door
    
  notebook:
    description: "Margaret's personal notebook, filled with library loan records and surprisingly artistic sketches of birds"
    reveals: "Pattern of books checked out by Lord Wadsworth before his death"
```

### Save State Structure
Each game action creates a Git commit with:
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "action": "player_move",
  "changes": {
    "world": { "rooms": {...} },
    "npcs": { "states": {...} },
    "characters": { "positions": {...} }
  },
  "narrative": "You enter the tavern..."
}
```

## Lazy Entity Generation

### Core Concept
When the engine encounters undefined entity IDs, it automatically generates appropriate content based on context, ensuring the world feels complete without requiring exhaustive pre-authoring. Generated entities are immediately persisted to maintain consistency.

### Generation Flow

```
1. Engine encounters undefined ID (e.g., 'patron_1')
   ↓
2. Context Analysis
   - Location (tavern → likely a drinker)
   - ID pattern (patron_1 → background character)
   - Time of day (evening → after work crowd)
   - Narrative state (tense scene → nervous patrons)
   ↓
3. Batch Related Entities
   - Groups undefined IDs for coherent generation
   - [patron_1, patron_2] → generated as related characters
   ↓
4. LLM Generation with Context
   ↓
5. Persist to World Data
   ↓
6. Git Commit ("Generated entities: patron_1, ale_barrel")
   ↓
7. Continue Game Flow
```

### Implementation Example

```typescript
async function resolveEntity(id: string, context: GenerationContext): Promise<Entity> {
  // Check if already exists
  let entity = await entityContent.getEntity(id);
  if (entity) return entity;
  
  // Analyze context for generation hints
  const hints = analyzeContext(id, context);
  
  // Batch with other undefined entities in same context
  const undefinedBatch = context.getUndefinedEntities();
  
  // Generate with LLM
  const prompt = {
    system: "Generate game entity that fits naturally in the context",
    context: {
      location: context.currentRoom,
      locationDescription: context.roomData.description,
      entityType: hints.type,  // 'npc', 'item', etc.
      narrativeTone: context.tone,
      relatedEntities: undefinedBatch
    },
    constraints: [
      "Must fit the established world tone",
      "Should reference existing world elements where appropriate",
      "Background entities should be simple, foreground entities can be complex"
    ]
  };
  
  const generated = await llm.generateEntity(prompt);
  
  // Persist immediately
  await entityContent.createEntity(id, generated);
  await state.saveState(`Generated entity: ${id}`);
  
  return generated;
}
```

### Generation Patterns

#### Simple Background Entity
```yaml
# Input: undefined 'patron_1' in tavern context
patron_1:
  name: "Henrik the Tanner"
  description: "A leather-worker with permanently stained hands, nursing his third ale of the evening"
  personality: "Keeps to himself, drinks to forget the smell of the tannery. Will complain about the new tax laws if anyone listens."
  carrying: [leather_scraps, belt_knife]
  generated: true
  generated_at: "2024-01-15T20:30:00Z"
```

#### Cascading Generation
```yaml
# Input: undefined 'notice_board' in tavern
notice_board:
  description: "Cork board covered in yellowed papers and fresh postings"
  contains: [merchant_notice, guard_warning, lost_cat_poster]
  generated: true

# These get generated in cascade:
merchant_notice:
  description: "Caravan guards needed for Eastbrook route - 5 silver/day - Ask Tom"
  references: [eastbrook_brewery, bartender_tom]
  generated: true

guard_warning:
  description: "By order of Captain Blackwood: Curfew at tenth bell until further notice"
  references: [captain_blackwood]
  generated: true
```

#### Context-Aware Generation
```typescript
// Morning context → different generation
if (timeOfDay === 'morning') {
  // patron_1 becomes:
  // "A merchant checking the notice board before the market opens"
} else if (timeOfDay === 'night') {
  // patron_1 becomes:
  // "A dock worker spending his day's wages on cheap ale"
}

// Narrative tension affects generation
if (narrativeTone === 'tense') {
  // patron_1 becomes:
  // "A nervous-looking stranger who keeps glancing at the door"
}
```

### Coherence Rules

1. **Reference Existing Entities**: Generated content should reference known entities when appropriate
2. **Maintain Tone**: Generated entities must fit the established world tone
3. **Logical Connections**: Related undefined entities should be generated with connections
4. **Persistence**: Once generated, entities never regenerate - they're permanent
5. **Flagging**: Generated entities are flagged for designer review/editing

### Performance Optimization

```typescript
class EntityResolver {
  private generationQueue: Set<string> = new Set();
  private generationPromise: Promise<void> | null = null;
  
  async batchResolve(ids: string[]): Promise<Map<string, Entity>> {
    // Collect all undefined entities
    const undefined = ids.filter(id => !this.exists(id));
    
    if (undefined.length > 0) {
      // Show UI indicator
      ui.showMessage("The world stirs...");
      
      // Generate all at once for coherence
      const generated = await this.generateBatch(undefined);
      
      // Persist with single commit
      await state.saveState(`Generated entities: ${undefined.join(', ')}`);
    }
    
    return this.getEntities(ids);
  }
}
```

### Designer Controls

```yaml
# Designers can hint at generation through naming patterns:
npcs: [
  bartender_tom,      # Fully defined
  patron_1,          # Generate as background character
  !important_spy,    # '!' prefix = generate with story importance
  ~drunk_sailor      # '~' prefix = comic relief character
]

# Or provide generation hints:
items: [
  ale_barrel,
  { id: mysterious_box, hint: "contains something valuable but dangerous" }
]
```

### UI Integration

When generation occurs:
1. Show subtle indicator: "✨ The world stirs..."
2. Log generated entities to a designer console
3. Allow post-generation editing in development mode
4. Track generation patterns for world consistency analysis

This lazy generation system ensures that:
- Designers can focus on important content
- The world always feels complete
- Players never encounter "undefined" errors  
- Generated content remains consistent across branches
- The game can scale from simple sketches to fully detailed worlds

## Game Loop & Data Flow

### Core Game Loop

```
1. Player Input
   ↓
2. Input Classification (Narrative Controller)
   ├─→ Direct Action (movement, inventory, etc.)
   └─→ Narrative Action (conversation, complex interaction)
   ↓
3. Context Assembly (via MCP servers)
   ↓
4. Action Resolution
   ├─→ Mechanical (dice rolls, combat)
   └─→ Narrative (LLM generation)
   ↓
5. State Mutation (via MCP servers)
   ↓
6. Git Commit (automatic save point)
   ↓
7. Response Generation
   ↓
8. UI Update (with speech rhythm)
   ↓
[Return to 1]
```

## Clean Slate Context Architecture

### Core Concept
Each turn, the LLM performs a complete research → synthesize → purge → respond cycle. This eliminates context pollution and enables infinite world depth while maintaining perfect narrative coherence.

### Turn Processing Pipeline

```
RESEARCH PHASE (Unlimited Context)
├── Query all relevant MCP servers
├── Search complete narrative history  
├── Deep retrieval of memories, relationships
├── Scan world state and item descriptions
└── Identify all potentially relevant information

SYNTHESIS PHASE (Still Unlimited)
├── Analyze what matters for THIS specific turn
├── Build focused context document
├── Summarize relevant history
├── Extract key relationships and facts
└── Curate mechanical requirements

PURGE (Context Reset)
└── Clear all previous context

RESPONSE PHASE (Clean Context)
├── Load only the curated context
├── Generate response with full context window
└── Execute actions through MCP servers
└── Record to narrative history
```

### Narrative History MCP Server

```typescript
interface NarrativeHistoryMCP {
  // Complete transcript management
  recordTurn(turn: TurnRecord): void;
  getFullTranscript(fromTurn?: number): string;
  
  // Intelligent search and retrieval
  searchTranscript(query: string, maxResults: number): ContextChunk[];
  getRecentTurns(count: number): TurnRecord[];
  findInteractions(entity1: string, entity2: string): Interaction[];
  
  // Automatic summarization
  generateSummary(fromTurn: number, toTurn: number): string;
  extractKeyEvents(character: string): KeyEvent[];
  getEmotionalArc(character: string): EmotionSequence;
  
  // Context curation
  buildCuratedContext(params: {
    currentAction: string;
    actors: string[];
    location: string;
    maxTokens: number;
  }): CuratedContext;
}

interface CuratedContext {
  immediateSituation: string;           // Last 2-3 turns, verbatim
  relevantHistory: string;               // Key events that matter now
  characterStates: Map<string, string>;  // Current state of each actor
  worldContext: string;                  // Important location/time info
  mechanicalRequirements: string;        // Rules that apply
  narrativeTone: string;                 // Suggested tone based on arc
  timestamp: GameTime;                   // When this context was built
}
```

### Example: Complex Context Curation

```typescript
// Player says: "I remind Tom about that favor he owes me"

// RESEARCH PHASE - Cast a wide net
async function researchPhase(input: string) {
  const mentions = await narrativeHistory.searchTranscript('Tom favor owe', 100);
  const tomHistory = await narrativeHistory.findInteractions('player', 'tom');
  const memories = await memory.getMemories({npc: 'tom', about: 'player'});
  const relationship = await memory.getRelationship('tom', 'player');
  const personality = await entity.getNPCTemplate('tom');
  const recentMood = await narrativeHistory.getEmotionalArc('tom');
  
  // Check if favor actually exists
  const favorExists = mentions.some(m => m.confirms('tom_owes_favor'));
  
  // Check for contradictions
  const contradictions = findContradictions(mentions, memories);
  
  return {mentions, tomHistory, memories, relationship, personality, 
          recentMood, favorExists, contradictions};
}

// SYNTHESIS PHASE - Distill to essence
async function synthesisPhase(research: ResearchData) {
  return `
    CURRENT: Player attempts to call in a favor from Tom the Bartender.
    
    FACT: ${research.favorExists ? 
      `Tom owes favor from Turn 47: Player helped dispose of the body.` :
      `No recorded favor. Player may be bluffing or misremembering.`}
    
    TOM'S STATE: 
    - Trust: ${research.relationship.trust}/100
    - Recent mood: ${research.recentMood.current}
    - Knows about player: ${research.memories.top(3).join('; ')}
    
    MECHANICAL: ${research.favorExists ? 
      'Automatic success - favor is real' : 
      'Deception check DC 15, or Persuasion DC 20'}
    
    TONE: ${research.recentMood.trajectory === 'darkening' ? 
      'Tense' : 'Casual negotiation'}
  `;
}

// RESPONSE PHASE - Clean generation
async function responsePhase(context: string) {
  // LLM now has ONLY the curated context
  // No chance of confusing details from research phase
  return llm.generate({
    system: "You are the narrator for a text adventure game.",
    context: context,
    instruction: "Respond to the player's action"
  });
}
```

### Performance Considerations

- **Turn Duration**: 10-30 seconds depending on world complexity
- **Caching Strategy**: Cache common searches within same branch
- **Progressive Loading**: Show "Tom considers..." while researching
- **Batch Operations**: Research multiple NPCs in parallel
- **Context Budget**: Strict token limits for curated context (e.g., 4096 tokens)

### Benefits

1. **Perfect Memory**: Every detail is preserved and searchable
2. **No Hallucination**: Clean context prevents false memories
3. **Infinite Scaling**: World size doesn't affect response quality
4. **Branch Coherence**: Each timeline maintains perfect history
5. **Deep NPCs**: Characters can reference events from any point

This architecture fundamentally changes what's possible in narrative games.

### Detailed Flow Example: "I try to persuade the guard to let me pass"

#### 1. Input Phase
```typescript
playerInput: "I try to persuade the guard to let me pass"
```

#### 2. Context Assembly Phase
The Narrative Controller queries multiple MCP servers in parallel:

```typescript
// Gather all context
const context = await Promise.all([
  state.getEntityPosition('player'),
  state.getEntityPosition('guard_01'),
  entity.getNPCTemplate('guard_01'),
  memory.getMemories({ npc: 'guard_01', about: 'player' }),
  memory.getRelationship('guard_01', 'player'),
  narrative.getNarrativeContext('guard_post'),
  time.getCurrentTime(),
  mechanics.getRuleSet('social_checks')
]);
```

#### 3. LLM Prompt Construction
```typescript
const prompt = {
  systemContext: `You are simulating a ${guard.personality} guard.
    Current relationship: ${relationship.trust} trust, ${relationship.fear} fear.
    The guard remembers: ${memories.map(m => m.content).join('; ')}
    Scene tone: ${narrativeContext.mood}`,
  
  query: "The player tries to persuade you to let them pass. What do you do?",
  
  availableActions: [
    'Accept (DC 15 Persuasion check)',
    'Refuse firmly',
    'Demand a bribe',
    'Call for reinforcements',
    'Negotiate conditions'
  ]
};
```

#### 4. Resolution Phase
```typescript
// LLM decides guard's response tendency
const guardResponse = await llm.complete(prompt);

// Mechanics server handles dice roll
const check = await mechanics.performSkillCheck({
  character: 'player',
  skill: 'persuasion',
  difficulty: 15,
  modifiers: { relationshipBonus: Math.floor(relationship.trust / 20) }
});

// Combine mechanical result with narrative
const outcome = combineResults(guardResponse, check);
```

#### 5. State Mutation Phase
```typescript
// Update multiple systems based on outcome
if (check.success) {
  await state.setStoryFlag('guard_post_passed', true);
  await memory.recordMemory({
    npc: 'guard_01',
    type: 'event',
    content: 'Let player pass after persuasion',
    importance: 6
  });
  await memory.modifyRelationship({
    npc: 'guard_01',
    target: 'player',
    changes: { trust: +5, respect: +3 }
  });
}

// Create Git commit
await state.saveState(`Player ${check.success ? 'persuaded' : 'failed to persuade'} guard`);
```

#### 6. Response Generation
```typescript
const narrative = await llm.generateNarrative({
  action: 'persuasion_attempt',
  result: check,
  npcReaction: guardResponse,
  tone: narrativeContext.suggestedTone
});

// Returns something like:
// "You lean in, speaking earnestly about your urgent mission. 
//  [Roll: 17 vs DC 15 - Success!]
//  The guard's expression softens. 'Well... I suppose I didn't 
//  see you. But don't make me regret this.'"
```

### Background Simulation Loop

While the player is reading/typing, the engine runs NPC simulations:

```typescript
// Every 30 seconds of real time = 5 minutes game time
async function backgroundTick() {
  const npcsInArea = await world.getNPCsInRoom(currentRoom);
  
  for (const npc of npcsInArea) {
    const schedule = await time.getNPCSchedule(npc);
    const shouldMove = await checkSchedule(schedule, currentTime);
    
    if (shouldMove) {
      // NPC autonomously moves/acts
      const action = await simulateNPCAction(npc);
      await executeNPCAction(action);
    }
  }
}
```

### Branch Management Flow

When player wants to explore alternatives:

```typescript
// Player presses "Create Branch Point"
const currentCommit = await state.getCurrentCommit();
await state.createBranch(`attempt_${Date.now()}`, currentCommit);

// Player can now try different approach
// Later, they can switch branches
await state.switchBranch('attempt_1234567');

// Or merge successful attempts
await state.cherryPick(['guard_persuaded', 'found_secret_door']);
```

### Performance Optimizations

1. **Predictive Context Loading**: While player types, pre-load likely MCP queries
2. **Response Streaming**: Start displaying narrative while still generating
3. **Parallel MCP Queries**: Bundle independent queries
4. **Smart Caching**: Cache personality templates, room descriptions
5. **Delta Updates**: Only send changed state to UI

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Basic Node.js/TypeScript project setup
- [ ] MCP server framework
- [ ] SQLite integration
- [ ] Git-based save system
- [ ] Basic Vue UI with Legend of the Sword layout

### Phase 2: Game Mechanics
- [ ] World State MCP server
- [ ] Game Mechanics MCP server (dice, combat)
- [ ] Character State MCP server
- [ ] Basic movement and interaction

### Phase 3: LLM Integration
- [ ] Ollama integration with auto-download
- [ ] Narrative Controller
- [ ] LLM abstraction layer
- [ ] Basic NPC interaction

### Phase 4: Advanced Features
- [ ] NPC Manager with memory/relationships
- [ ] Quest/Story system
- [ ] Economy server
- [ ] Time/Calendar system

### Phase 5: Content & Polish
- [ ] Complete demo scenario (heist/escape)
- [ ] 3-4 fully developed party members
- [ ] Rich world data
- [ ] UI polish and game-specific styling

## Configuration

### Game Settings (config.yaml)
```yaml
game:
  title: "The Heist"
  maxPartySize: 4
  startingRoom: "prison_cell"
  
llm:
  provider: "ollama"
  model: "gemma2:9b"
  fallbackModel: "mistral:7b"
  contextWindow: 8192
  
mechanics:
  combatSystem: "d20"
  skillCheckDifficulty: [10, 15, 20, 25]
  
ui:
  theme: "dark_fantasy"
  showDiceRolls: true
```

## Performance Considerations

- **LLM Caching**: Cache personality responses for similar situations
- **Lazy Loading**: Load room details only when needed
- **Background Processing**: Run NPC simulations during player input
- **State Compression**: Compress old Git commits after N saves

## Future Extensibility

- **Multiplayer Mode**: Add server-authoritative state with WebRTC for P2P
- **Mod Support**: Allow custom MCP servers for new game mechanics
- **Visual Generation**: Integrate image generation for key moments
- **Voice Acting**: TTS for NPC dialogue
- **Mobile App**: React Native or Capacitor wrapper

## Development Tools

- **MCP Server Testing**: Standalone test harness for each server
- **Narrative Debugger**: Tool to inspect LLM context assembly
- **World Editor**: Visual tool for creating world data
- **Personality Workshop**: Tool for testing NPC responses