# Narrative Engine

A next-generation text adventure system that combines the depth of classic interactive fiction with the narrative power of large language models.

## What makes it special?

🎭 **Living NPCs** - Characters powered by LLMs remember everything, form relationships, and act on their own goals

🌍 **Infinite Depth** - Examine anything, talk to anyone. Undefined elements generate on-demand and remain persistent

🌳 **Branching Timelines** - Not just save games. Explore "what if" scenarios, switch between timeline branches to see how different choices play out

🧠 **Perfect Memory** - Our Clean Slate Context system gives the game perfect recall while keeping responses fast and coherent

🎲 **Real Mechanics** - Dice rolls, skill checks, and game rules provide structure beneath the narrative layer

## How it works

The Narrative Engine treats each turn as a complete cycle:
1. **Research** - Gathers all relevant information from the game world
2. **Synthesize** - Builds focused context for this specific moment  
3. **Respond** - Generates narrative with full context awareness
4. **Persist** - Commits changes to Git for perfect history tracking

## Quick Start

```bash
# Clone the repository
git clone https://github.com/onuse/nengine.git
cd nengine

# Install dependencies
npm install

# Start the engine
npm run dev

# Open browser to http://localhost:3000
```

## System Requirements

- Node.js 18+
- 8GB+ RAM recommended
- GPU with 8GB+ VRAM for local LLM (or use cloud providers)

## Creating Your Own Game

Games are defined through simple YAML files:

```yaml
rooms:
  tavern:
    name: "The Rusty Anchor"
    description: "A cozy tavern that smells of salt and stories. 
                  Sailors share tales over mugs of grog."
    npcs: [bartender, patron_1, patron_2]
    
npcs:
  bartender:
    name: "Martha"
    personality: "Tough but motherly. Has heard every sea story 
                  twice but still laughs at the good ones."
```

The engine handles the rest - undefined NPCs generate automatically, characters remember their interactions, and the world evolves based on player actions.

## Architecture Highlights

- **Modular MCP Servers** - Clean separation between world state, mechanics, memories, and narrative
- **Git-based Persistence** - Every action creates a commit, enabling timeline exploration
- **TypeScript Throughout** - Type-safe from data layer to UI
- **Vue 3 Frontend** - Responsive interface inspired by classic text adventures

## Development Status

🚧 **Early Development** - We're building the foundation. Check [Issues](https://github.com/onuse/nengine/issues) for progress and ways to contribute.

## Documentation

- [Architecture Overview](./docs/architecture.md) - System design and components
- [MCP Interfaces](./docs/mcp-interfaces.md) - Server specifications
- [Game Creation Guide](./docs/creating-games.md) - How to build your own worlds

## Contributing

We welcome contributions! Whether it's code, game content, or ideas, check our [Contributing Guide](./CONTRIBUTING.md) to get started.

## Vision

The Narrative Engine reimagines what text adventures can be. By combining the consistency of authored content with the flexibility of language models, we're creating stories that are both coherent and surprising.

Every NPC remembers. Every object can be examined. Every choice creates a new branch of possibility.

Welcome to the future of interactive fiction.

## License

MIT - See [LICENSE](./LICENSE) for details

---

*Built in Stockholm with curiosity and code*