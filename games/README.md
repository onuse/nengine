# Games Directory

Each subdirectory here represents a complete, self-contained game that runs on the Narrative Engine.

## Game Structure

```
games/
├── the-heist/           # Example game
│   ├── game.yaml        # Main game configuration
│   ├── content/         # Game content files
│   │   ├── world.yaml   # Room definitions
│   │   ├── npcs.yaml    # NPC templates
│   │   ├── items.yaml   # Item definitions
│   │   └── dialogue/    # Dialogue trees
│   ├── assets/          # Game-specific assets
│   │   ├── images/      # Backgrounds, portraits, items
│   │   ├── sounds/      # Sound effects
│   │   ├── music/       # Background music
│   │   └── fonts/       # Custom fonts
│   ├── themes/          # UI customization
│   │   ├── custom.css   # Game-specific CSS overrides
│   │   └── theme.json   # Custom theme definition
│   ├── saves/           # Player save files (git repos)
│   └── README.md        # Game documentation
│
├── fantasy-quest/       # Another game
│   ├── game.yaml
│   ├── content/
│   ├── assets/
│   ├── themes/
│   └── saves/
│
└── my-game/            # Your game here!
```

## Creating a New Game

1. Copy the `game-template` directory
2. Rename it to your game's name
3. Edit `game.yaml` with your game configuration
4. Add your content in the `content/` directory
5. Customize the UI in `themes/`
6. Add any assets in `assets/`

## Loading a Game

The server loads games based on:
- Command line: `npm run dev -- --game=the-heist`
- Environment variable: `GAME=the-heist npm run dev`
- Config file: Set `defaultGame` in server config
- URL parameter: `http://localhost:5173/?game=the-heist`

## Content Files

### world.yaml
Defines all rooms, their connections, and descriptions.

### npcs.yaml
Templates for NPCs including personality, dialogue, and behaviors.

### items.yaml
All items in the game with their properties and interactions.

### dialogue/
Structured dialogue trees for conversations.

## Assets

All game-specific assets are served from `/games/{game-name}/assets/` and are accessible to both client and server.

## Themes

Games can override the default UI in two ways:
1. `theme.json` - Define colors, fonts, layout preferences
2. `custom.css` - Direct CSS overrides for complete control

## Saves

Each player's saves are stored as Git repositories in the `saves/` directory, allowing for timeline branching and rollback.