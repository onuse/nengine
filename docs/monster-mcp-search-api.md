# Monster MCP Search API Specification

## Overview

The Monster MCP server provides intelligent search capabilities for the Faerun campaign's extensive bestiary. Instead of loading all 60+ monsters into memory, the AI can query exactly what it needs based on context, level, environment, and story requirements.

## MCP Server Interface

### Search Operations

#### 1. Find Appropriate Encounters
```typescript
findEncounters({
  partyLevel: number,
  partySize: number,
  difficulty: "easy" | "medium" | "hard" | "deadly",
  environment?: string,
  story_context?: string
}) => Monster[]
```

**Example Queries:**
- "4 level-3 characters need a hard forest encounter"
- "Solo deadly boss for 6 level-8 characters"
- "Easy urban encounters for investigation scenario"

#### 2. Search by Challenge Rating
```typescript
searchByCR({
  challenge_rating: string | number,
  monster_role?: "minion" | "soldier" | "brute" | "artillery" | "leader" | "solo",
  environment?: string,
  max_results?: number
}) => Monster[]
```

**Example Queries:**
- "CR 5 solo monsters for mountain encounter"
- "CR 1/4 minions that work in groups"
- "CR 10 artillery monsters for dungeon"

#### 3. Search by Type and Environment
```typescript
searchByTypeEnvironment({
  creature_type?: string[],
  environment?: string[],
  faction?: string,
  tactics?: string,
  story_role?: string
}) => Monster[]
```

**Example Queries:**
- "Undead creatures for haunted mansion"
- "Zhentarim agents for urban intrigue"
- "Aberrations from the Underdark"
- "Pack hunters for wilderness chase"

#### 4. Get Monster Details
```typescript
getMonster(name: string) => MonsterDetails
```

Returns complete stat block with:
- Combat statistics
- Abilities and traits
- Tactics and behavior
- Loot tables
- Ecology and lore

#### 5. Build Encounter
```typescript
buildEncounter({
  template: string,
  partyLevel: number,
  partySize: number,
  modifications?: EncounterModification[]
}) => CompleteEncounter
```

**Templates include:**
- "goblin_ambush"
- "dragon_lair" 
- "underdark_patrol"
- "cultist_ritual"

## Intelligent Search Examples

### Scenario 1: Forest Ambush
**Context:** "The party is traveling through the High Forest when they're ambushed by creatures"

**MCP Query:**
```yaml
findEncounters:
  partyLevel: 3
  partySize: 4
  difficulty: "medium"
  environment: "forest"
  story_context: "ambush"
```

**AI Receives:**
- Owlbear (CR 3) - solo predator
- Displacer Beast (CR 3) - ambush predator
- 2d4 Goblins + Hobgoblin leader - organized ambush

### Scenario 2: Investigating Strange Deaths
**Context:** "Bodies found drained of blood in Waterdeep"

**MCP Query:**
```yaml
searchByTypeEnvironment:
  creature_type: ["undead", "fiend", "monstrosity"]
  environment: ["urban"]
  tactics: ["stealth", "blood_drain"]
  story_role: ["serial_killer"]
```

**AI Receives:**
- Vampire Spawn - classic blood drainer
- Stirge - swarm of blood-suckers
- Doppelganger - shapeshifter infiltrator

### Scenario 3: Epic Dragon Fight
**Context:** "Ancient red dragon in its mountain lair"

**MCP Query:**
```yaml
buildEncounter:
  template: "dragon_lair"
  partyLevel: 17
  partySize: 5
  modifications: 
    - type: "legendary_lair"
    - type: "add_minions"
```

**AI Receives:**
- Ancient Red Dragon (CR 24)
- Lair actions and regional effects
- 3d6 Kobolds as minions
- Fire elemental guardians
- Treasure hoard details

## Benefits for Gameplay

### 1. Context-Aware Encounters
The MCP system can search for monsters that fit:
- **Narrative Context**: "Zhentarim agents in disguise"
- **Environmental Logic**: "Creatures that live in swamps"
- **Mechanical Balance**: "CR 5 monsters for level 6 party"
- **Tactical Variety**: "Ranged attackers to complement melee enemies"

### 2. Dynamic Scaling
```yaml
# Automatic encounter adjustment
adjustEncounter:
  base_encounter: "goblin_ambush"
  party_size: 6  # Larger than expected
  modifications:
    - "add_hobgoblin_leader"
    - "increase_goblin_count" 
    - "add_wolf_mounts"
```

### 3. Story Integration
```yaml
# Find monsters that advance the plot
searchByStoryContext:
  current_quest: "rescue_gundren_rockseeker"
  location: "cragmaw_hideout"
  faction: "cragmaw_goblins"
  boss_required: true
```

### 4. Intelligent Substitutions
If the AI asks for a "CR 5 forest predator" but the party has already fought owlbears recently:
```yaml
# MCP automatically suggests alternatives
alternatives:
  - displacer_beast  # Different tactics
  - phase_spider     # Different environment adaptation  
  - green_hag        # Social encounter option
```

## Implementation Architecture

### Monster Database Structure
```
monsters.yaml
├── Core Stats (AC, HP, abilities)
├── Search Metadata (tags, environment, tactics)
├── Behavioral Data (personality, motivations)
├── Loot Tables (treasure and equipment)
└── Lore Integration (Faerun-specific details)

encounter-tables.yaml
├── Level-Appropriate CRs
├── Environment Mappings
├── Faction Associations
├── Story Templates
└── Dynamic Scaling Rules
```

### MCP Server Logic
1. **Parse Query**: Extract level, environment, difficulty, story context
2. **Filter Candidates**: Apply CR ranges, environment tags, faction filters
3. **Rank Results**: Score by story relevance, tactical variety, novelty
4. **Return Matches**: Complete stat blocks with tactical suggestions

### Memory Efficiency
- **Before**: 60+ monsters × 500 tokens each = 30,000 tokens always loaded
- **After**: Query-specific results × 500 tokens = 500-2,000 tokens as needed
- **Savings**: 90%+ reduction in context usage

This system transforms the extensive Faerun bestiary from a memory burden into a powerful, searchable resource that enhances rather than constrains the AI Game Master's capabilities.