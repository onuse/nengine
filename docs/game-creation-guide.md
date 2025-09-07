# Game Creation Guide

This guide provides comprehensive documentation for creating games for the Narrative Engine. The engine combines traditional text adventure mechanics with LLM-powered NPCs and dynamic narrative generation.

## Table of Contents
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Configuration Files](#configuration-files)
- [Content Files](#content-files)
- [Advanced Features](#advanced-features)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Getting Started

### Prerequisites
- Narrative Engine server running
- Basic understanding of YAML format
- Text editor or IDE

### Creating Your First Game

1. **Create game directory:**
   ```bash
   mkdir games/my-adventure
   cd games/my-adventure
   ```

2. **Create required directories:**
   ```bash
   mkdir content assets themes saves
   ```

3. **Create basic files:**
   ```bash
   touch game.yaml
   touch content/world.yaml
   touch content/npcs.yaml
   touch content/items.yaml
   ```

4. **Start with minimal configuration** (see Configuration section below)

## Project Structure

```
games/my-adventure/
├── game.yaml              # Main game configuration (REQUIRED)
├── content/               # Game content files
│   ├── world.yaml         # Room definitions and connections
│   ├── npcs.yaml          # NPC templates and personalities  
│   ├── items.yaml         # Item definitions and properties
│   ├── characters.yaml    # Character templates and stats
│   ├── rules.yaml         # Custom game rules and mechanics
│   ├── skills.yaml        # Skill definitions
│   ├── puzzles.yaml       # Puzzle definitions
│   └── dialogues/         # Dialogue trees (directory)
├── assets/                # Game-specific assets
│   ├── images/            # Background images, portraits
│   ├── sounds/            # Sound effects
│   ├── music/             # Background music
│   └── fonts/             # Custom fonts
├── themes/                # UI customization
│   ├── custom.css         # CSS overrides
│   └── theme.json         # Theme definition
├── saves/                 # Player save data (auto-managed)
└── README.md              # Game documentation
```

## Configuration Files

### game.yaml (Required)

The main configuration file that defines your game's metadata, UI, mechanics, and content paths.

#### Basic Structure:

```yaml
# Game metadata
game:
  title: "My Adventure"
  version: "1.0.0" 
  author: "Your Name"
  description: "A thrilling text adventure"
  startingRoom: "entrance"
  maxPartySize: 4

# UI Configuration
ui:
  theme: "default"
  layout:
    type: "standard"    # or "custom", "minimal"
    panels:
      console:
        visible: true
        position: "left"
        size: "60%"
      viewport:
        visible: true
        showRoomName: true
        showDescription: true
      inventory:
        visible: true
        position: "right"

# Game mechanics
mechanics:
  combatSystem: "turn-based"    # or "none", "real-time"
  commands:
    movement: ["north", "south", "east", "west", "up", "down"]
    interaction: ["look", "get", "use", "examine"]
    conversation: ["talk", "ask", "tell"]

# LLM Configuration
llm:
  provider: "ollama"
  model: "gemma2:9b"
  narrativeStyle:
    tone: "adventurous"
    verbosity: "detailed"
    perspective: "second"

# Content file paths
content:
  worldData: "./content/world.yaml"
  npcs: "./content/npcs.yaml" 
  items: "./content/items.yaml"
  characters: "./content/characters.yaml"
  rules: "./content/rules.yaml"
  skills: "./content/skills.yaml"

# Save configuration
saves:
  autoSave: true
  autoSaveInterval: 300  # seconds
  maxSaves: 20
  enableBranching: true
```

#### UI Themes

Available themes:
- `default` - Modern clean interface
- `classic` - Traditional text adventure
- `sierra-classic` - Retro green-on-black
- `fantasy` - Medieval theme
- `sci-fi` - Futuristic theme

#### UI Layout Types

**Standard Layout:**
- Console (main text output)
- Viewport (room description and visuals)
- Inventory panel
- Party status
- Action buttons

**Minimal Layout:**
- Console only
- Status bar
- Text input

**Custom Layout:**
- Define your own panel configuration

## Content Files

### world.yaml - Room Definitions

Defines all locations, their connections, descriptions, and properties.

```yaml
# Room definitions
rooms:
  entrance:
    name: "Castle Entrance"
    description: "A massive oak door stands before you, iron-bound and imposing."
    
    # Long description for first visit
    longDescription: |
      You stand before the entrance to Castle Grimhold, its ancient stones 
      weathered by centuries of wind and rain. The massive oak doors are 
      reinforced with iron bands, and strange runes are carved into the stone 
      archway above.
    
    # Room properties
    properties:
      lightLevel: "dim"
      temperature: "cold" 
      mood: "ominous"
      canSave: true
      
    # Connected rooms
    exits:
      north:
        to: "great_hall"
        description: "Through the oak doors"
        requirements:
          - key: "castle_key"
          - condition: "doors_unlocked"
      south:
        to: "courtyard"
        description: "Back to the courtyard"
        
    # Items present in room
    items:
      - "rusty_key"
      - "torch"
      
    # NPCs present in room  
    npcs:
      - "guard_captain"
      
    # Environmental interactions
    interactions:
      doors:
        description: "Heavy oak doors bound with iron"
        actions:
          examine: "The doors are locked tight. You need a key."
          knock: "Your knocking echoes hollowly. No response."
          unlock:
            requirements:
              - item: "castle_key"
            result: "The key turns with a satisfying click."
            
  great_hall:
    name: "Great Hall"
    description: "A vast hall with soaring columns and faded tapestries."
    # ... more rooms
```

### npcs.yaml - NPC Templates

Defines non-player characters, their personalities, dialogue, and behaviors.

```yaml
# NPC Templates
npcs:
  guard_captain:
    name: "Captain Aldric"
    description: "A grizzled veteran wearing worn chain mail"
    
    # Physical attributes
    appearance:
      age: 45
      height: "tall"
      build: "muscular" 
      clothing: "chain mail and leather"
      notable: "scar across left cheek"
      
    # Personality for LLM
    personality:
      traits:
        - "duty-bound"
        - "suspicious of strangers"
        - "protective of the castle"
        - "secretly lonely"
      background: |
        Captain Aldric has served Castle Grimhold for twenty years. 
        He's seen too many dark things to trust easily, but beneath 
        his stern exterior lies a man who cares deeply for those 
        under his protection.
      speech_patterns:
        - "speaks formally"
        - "uses military terminology"
        - "suspicious questions first"
        
    # Stats and capabilities  
    stats:
      health: 100
      armor: 15
      strength: 18
      intelligence: 14
      wisdom: 16
      charisma: 12
      
    # Equipment and inventory
    inventory:
      - "captain_sword"
      - "castle_keys"
      - "guard_whistle"
      
    # Conversation topics
    topics:
      greeting:
        conditions:
          - first_meeting: true
        response: "Halt! State your business at Castle Grimhold."
        
      castle:
        keywords: ["castle", "grimhold", "history"]
        response: "This castle has stood for three centuries. I've kept it safe for twenty years."
        
      lord:
        keywords: ["lord", "master", "ruler"]
        conditions:
          - relationship: "friendly"
        response: "Lord Grimhold is... away on important business."
        
    # Behaviors and reactions
    behaviors:
      default_mood: "cautious"
      
      reactions:
        player_armed:
          condition: "player has weapon drawn"
          response: "Lower your weapon or face the consequences!"
          mood_change: "hostile"
          
        nighttime:
          condition: "time.hour > 20"
          response: "It's late. What brings you here at this hour?"
          mood_change: "suspicious"
          
    # Dialogue trees (for complex conversations)
    dialogue_tree:
      start: "greeting"
      
      nodes:
        greeting:
          text: "What brings you to Castle Grimhold?"
          options:
            - text: "I seek an audience with the lord."
              goto: "seek_audience"
              requirements:
                - reputation: "positive"
            - text: "I'm just passing through."
              goto: "passing_through"
            - text: "None of your business!"
              goto: "hostile_response"
              
        seek_audience:
          text: "The lord is not receiving visitors. Perhaps I can help?"
          # ... more dialogue nodes
```

### items.yaml - Item Definitions

Defines all items, their properties, and interactions.

```yaml
# Item definitions
items:
  rusty_key:
    name: "Rusty Key"
    description: "An old iron key, green with corrosion"
    
    # Physical properties
    properties:
      weight: 0.1
      size: "small"
      material: "iron" 
      condition: "poor"
      valuable: false
      stackable: false
      
    # Usage and interactions
    interactions:
      examine:
        description: "The key is old and rusty, but still functional. Strange runes are etched into the handle."
        skill_check:
          skill: "lore"
          difficulty: 15
          success: "You recognize these as dwarven runes meaning 'entrance'."
          
      use:
        description: "You must specify what to use the key on."
        
      use_with:
        castle_doors:
          description: "The rusty key doesn't fit these ornate locks."
        cellar_door:
          description: "The key turns easily. The door creaks open."
          result: "unlock_cellar"
          
    # Magical or special properties
    magical: false
    enchantments: []
    
  magic_sword:
    name: "Flameblade"
    description: "A sword that glows with inner fire"
    
    properties:
      weight: 3.5
      size: "medium"
      material: "enchanted steel"
      condition: "excellent"
      valuable: true
      stackable: false
      
    # Combat stats
    combat:
      damage: "2d6+2"
      damage_type: "slashing"
      magical: true
      enchantment_bonus: 2
      special_effects:
        - name: "flame_burst"
          chance: 0.1
          description: "The blade erupts in flames!"
          damage: "1d6"
          damage_type: "fire"
          
    # Requirements to use
    requirements:
      min_strength: 14
      classes: ["fighter", "paladin", "ranger"]
      
    interactions:
      examine:
        description: "Flames dance along the blade's edge. The crossguard bears the mark of the Phoenix."
      wield:
        description: "The sword feels perfectly balanced in your grip. Warmth flows up your arm."
        requirements:
          - stat: "strength >= 14"
        success: "You feel the sword's power coursing through you."
        failure: "The sword is too heavy for you to wield effectively."
```

### characters.yaml - Character Templates

Defines character creation templates and advancement rules.

```yaml
# Character templates and rules
character_templates:
  fighter:
    name: "Fighter"
    description: "A warrior trained in combat and tactics"
    
    # Starting stats
    base_stats:
      health: 12
      strength: 16
      dexterity: 14
      intelligence: 10
      wisdom: 12
      charisma: 11
      
    # Skills and proficiencies
    skills:
      - "weapons_melee"
      - "armor_heavy"
      - "tactics"
      - "intimidation"
      
    # Starting equipment
    starting_equipment:
      - "leather_armor"
      - "short_sword"
      - "shield"
      - "rations"
      - "gold_pouch"
      
    # Advancement rules
    advancement:
      health_per_level: 8
      skill_points_per_level: 2
      
  wizard:
    name: "Wizard"
    description: "A scholar of arcane arts and magical theory"
    
    base_stats:
      health: 6
      strength: 8
      dexterity: 12
      intelligence: 16
      wisdom: 14
      charisma: 10
      
    skills:
      - "spellcasting"
      - "arcane_lore"
      - "research"
      - "languages"
      
    # Spell slots by level
    spells:
      level_1: 3
      level_2: 0
      known_spells:
        - "magic_missile"
        - "detect_magic"
        - "read_magic"
        
    starting_equipment:
      - "robes"
      - "spell_component_pouch"
      - "spellbook"
      - "quarterstaff"
```

### rules.yaml - Game Mechanics

Defines custom rules, skill checks, and game mechanics.

```yaml
# Game mechanics and rules
dice_mechanics:
  default_die: "d20"
  
  difficulty_classes:
    trivial: 5
    easy: 10
    medium: 15
    hard: 20
    very_hard: 25
    nearly_impossible: 30
    
skill_system:
  skills:
    weapons_melee:
      name: "Melee Weapons"
      description: "Proficiency with swords, axes, and other close combat weapons"
      base_stat: "strength"
      
    lockpicking:
      name: "Lockpicking"
      description: "The art of opening locks without keys"
      base_stat: "dexterity"
      tools_required: ["lockpicks"]
      
    arcane_lore:
      name: "Arcane Lore"
      description: "Knowledge of magical theory and arcane history"
      base_stat: "intelligence"
      
    persuasion:
      name: "Persuasion"
      description: "The ability to influence others through words"
      base_stat: "charisma"
      
# Combat system
combat_rules:
  initiative: "dexterity"
  
  actions_per_turn:
    move: 1
    standard: 1
    minor: 1
    
  action_types:
    attack:
      type: "standard"
      description: "Make one attack with a weapon or spell"
      
    full_attack:
      type: "full_round"
      description: "Make multiple attacks if proficient"
      
    defend:
      type: "standard"
      description: "Gain +2 AC until next turn"
      
# Magic system
magic_rules:
  spell_components:
    verbal: "Spoken incantations"
    somatic: "Precise gestures"  
    material: "Physical components"
    
  spell_failure:
    armor_penalty: true
    concentration_checks: true
    
# Environmental rules
environment:
  lighting:
    bright: 
      visibility: "unlimited"
      penalties: "none"
    dim:
      visibility: "limited" 
      penalties: "-2 to perception"
    dark:
      visibility: "very limited"
      penalties: "-5 to most actions"
      
  weather_effects:
    rain:
      visibility: "reduced"
      fire_magic: "disadvantage"
    snow:
      movement: "halved"
      tracking: "advantage"
```

### skills.yaml - Skill Definitions

Defines the skill system in detail.

```yaml
# Detailed skill system
skills:
  # Combat Skills
  weapons_melee:
    name: "Melee Weapons"
    description: "Training with close-combat weapons"
    category: "combat"
    base_attribute: "strength"
    
    specializations:
      swords:
        name: "Sword Fighting"
        bonus: "+1 to sword attacks"
      axes:
        name: "Axe Mastery"  
        bonus: "+1 to axe damage"
        
  archery:
    name: "Archery"
    description: "Skill with bows and thrown weapons"
    category: "combat"
    base_attribute: "dexterity"
    
  # Social Skills  
  persuasion:
    name: "Persuasion"
    description: "Convincing others through logical argument"
    category: "social"
    base_attribute: "charisma"
    
    applications:
      - "Negotiating prices"
      - "Convincing guards"
      - "Diplomatic solutions"
      
  intimidation:
    name: "Intimidation"
    description: "Using fear to influence others"
    category: "social" 
    base_attribute: "strength"  # or charisma
    
  # Knowledge Skills
  history:
    name: "History"
    description: "Knowledge of past events and cultures"
    category: "knowledge"
    base_attribute: "intelligence"
    
    specializations:
      ancient:
        name: "Ancient History"
        description: "Knowledge of civilizations long past"
      military:
        name: "Military History"
        description: "Knowledge of famous battles and tactics"
        
  # Practical Skills
  lockpicking:
    name: "Lockpicking"
    description: "Opening locks without proper keys"
    category: "practical"
    base_attribute: "dexterity"
    tools_required: ["thieves_tools"]
    
    difficulty_modifiers:
      simple_lock: 0
      complex_lock: 5
      masterwork_lock: 10
      magical_lock: 15
      
  healing:
    name: "Healing"
    description: "Treating wounds and ailments"
    category: "practical"
    base_attribute: "wisdom"
    
    applications:
      first_aid:
        difficulty: 10
        effect: "Restore 1d4 hp"
      treat_poison:
        difficulty: 15
        effect: "Reduce poison duration"
```

## Advanced Features

### Custom Themes

Create `themes/theme.json`:

```json
{
  "name": "My Custom Theme",
  "colors": {
    "primary": "#3498db",
    "secondary": "#2ecc71", 
    "background": "#2c3e50",
    "text": "#ecf0f1",
    "border": "#34495e"
  },
  "fonts": {
    "main": "'Georgia', serif",
    "console": "'Courier New', monospace"
  },
  "effects": {
    "typewriter": true,
    "fadeIn": true,
    "parallax": false
  }
}
```

Create `themes/custom.css`:

```css
/* Custom styling overrides */
.game-console {
    font-family: 'VT323', monospace;
    background: linear-gradient(45deg, #1a1a1a, #2d2d2d);
    border: 2px solid #00ff00;
}

.status-bar {
    background: rgba(0, 0, 0, 0.8);
    color: #00ff00;
    border-bottom: 1px solid #00ff00;
}

/* Animation effects */
.room-description {
    animation: fadeIn 1s ease-in;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
```

### Dialogue Trees

Create `content/dialogues/guard_captain.yaml`:

```yaml
# Dialogue tree for Guard Captain
dialogue_id: "guard_captain_main"
character: "guard_captain"

# Starting node
start_node: "greeting"

nodes:
  greeting:
    type: "npc_speech"
    text: "Halt! What brings you to Castle Grimhold at this hour?"
    conditions:
      - time_of_day: "night"
    responses:
      - text: "I seek an audience with Lord Grimhold."
        requirements:
          - reputation: ">=0"
        goto: "seek_audience"
        
      - text: "I'm a traveling merchant."
        skill_check:
          skill: "persuasion"
          difficulty: 15
        goto: "merchant_lie"
        
      - text: "That's none of your concern!"
        goto: "hostile_response"
        
  seek_audience:
    type: "npc_speech"
    text: "Lord Grimhold sees no one without appointment. State your urgent business."
    responses:
      - text: "I bring word from the capital."
        requirements:
          - item: "royal_seal"
        goto: "royal_messenger"
        
      - text: "I have information about the missing villagers."
        conditions:
          - flag: "knows_about_disappearances"
        goto: "missing_villagers"
        
  # ... more dialogue nodes
```

### Dynamic Content Generation

The engine supports LLM-generated content for undefined entities:

```yaml
# In any content file, use placeholders
rooms:
  mysterious_chamber:
    name: "???"  # Will be generated
    description: "???"  # Will be generated
    generation_hints:
      mood: "mysterious"
      theme: "ancient magic"
      danger_level: "moderate"
      
npcs:
  random_traveler:
    name: "???"
    description: "???"
    generation_hints:
      personality: "friendly but secretive"
      background: "traveling merchant"
      knowledge: "local rumors"
```

## Best Practices

### Content Organization

1. **Use meaningful IDs:** `forest_clearing` not `room_001`
2. **Group related content:** Keep dungeon rooms together
3. **Consistent naming:** Use underscores, lowercase
4. **Version control:** Use git for your game content

### Writing Style

1. **Be descriptive but concise:** Paint a picture without overwhelming
2. **Use sensory details:** What does it smell/sound/feel like?
3. **Consistent tone:** Match your game's atmosphere
4. **Player agency:** Always give meaningful choices

### Performance Tips

1. **Limit room connections:** Too many exits confuse players
2. **Optimize descriptions:** Long text slows down gameplay
3. **Test regularly:** Play through your content frequently
4. **Use generation wisely:** Don't generate everything dynamically

### Testing Your Game

1. **Start the server:**
   ```bash
   npm run dev -- --game=my-adventure
   ```

2. **Test all paths:** Every room should be reachable
3. **Verify items work:** All interactions should function
4. **Check dialogue:** Every conversation path should work
5. **Test save/load:** Ensure game state persists correctly

## Examples

### Simple Two-Room Adventure

**game.yaml:**
```yaml
game:
  title: "Cottage Adventure"
  startingRoom: "cottage_interior"
  
ui:
  theme: "default"
  layout:
    type: "minimal"
    
content:
  worldData: "./content/world.yaml"
  items: "./content/items.yaml"
```

**content/world.yaml:**
```yaml
rooms:
  cottage_interior:
    name: "Cozy Cottage"
    description: "A small but comfortable cottage with a fireplace."
    exits:
      out: 
        to: "cottage_garden"
    items:
      - "cottage_key"
      
  cottage_garden:
    name: "Cottage Garden"  
    description: "A well-tended garden with vegetables and herbs."
    exits:
      in:
        to: "cottage_interior"
```

**content/items.yaml:**
```yaml
items:
  cottage_key:
    name: "Brass Key"
    description: "A small brass key with a wooden tag."
    properties:
      weight: 0.1
      valuable: false
    interactions:
      examine:
        description: "The wooden tag reads 'Garden Gate'."
```

This guide should give game creators everything they need to build rich, interactive adventures for the Narrative Engine. The system's flexibility allows for everything from simple text adventures to complex RPGs with full NPC interaction and dynamic storytelling.