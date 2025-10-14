# Narrative Engine

A next-generation text adventure system combining traditional mechanics with LLM-powered narrative generation and dynamic NPCs.

## Quick Start

```bash
# Install dependencies
npm install

# Run a game (Windows PowerShell)
npm run dev:lovebug        # Lovebug game
npm run dev:heist          # The Heist (default)
npm run dev:detective      # Red Lantern Detective

# For Linux/Mac or Git Bash
npm run dev -- --game=lovebug
```

**Windows users**: See [RUNNING_GAMES.md](RUNNING_GAMES.md) for detailed PowerShell instructions.

## Features

- **Powerful Narrative Generation** - Uses Llama 3.3 70B for rich, atmospheric storytelling
- **Dynamic NPCs** - LLM-driven characters with personalities and memories
- **Image Generation** - Automatic character portraits and scene images (via FLUX Unchained)
- **Git-based Save System** - Timeline branching and complete save history
- **MCP Architecture** - Modular server design for game mechanics
- **32K Context Window** - Rich narrative context

## Documentation

### Getting Started
- **[docs/integration/QUICK_START.md](docs/integration/QUICK_START.md)** - Fast setup guide
- **[docs/CREATIVE_SERVER_USAGE.md](docs/CREATIVE_SERVER_USAGE.md)** - Complete usage guide
- **[docs/narrative-engine-architecture.md](docs/narrative-engine-architecture.md)** - System architecture

### Integration Documentation
- **[docs/integration/](docs/integration/)** - Creative server integration docs
- **[docs/CREATIVE_INTEGRATION.md](docs/CREATIVE_INTEGRATION.md)** - API reference

### For Developers
- **[CLAUDE.md](CLAUDE.md)** - Claude Code instructions
- **[docs/mcp-interfaces-spec.md](docs/mcp-interfaces-spec.md)** - MCP server specifications

## Requirements

- **Node.js** 18+
- **Creative Server** at 192.168.1.95:8000
  - Llama 3.3 70B (text generation)
  - FLUX Unchained (image generation)

**Note**: This system requires the creative server - no local models needed.

## Configuration

Create or update your game configuration:

```yaml
# games/your-game/game.yaml
game:
  title: "Your Game Title"
  startingRoom: start

llm:
  provider: creative-server
  model: llama-3.3-70b-abliterated
  temperature: 0.9
  contextWindow: 32000
```

## Project Structure

```
nengine/
├── src/
│   ├── llm/                  # LLM providers & narrative controller
│   ├── mcp/                  # MCP server implementations
│   ├── services/             # Image service, etc.
│   ├── core/                 # Core game systems
│   └── index.ts              # Main server
├── games/                    # Game content
│   └── your-game/
│       ├── game.yaml         # Game configuration
│       ├── content/          # Game content (NPCs, rooms, etc.)
│       └── generated-images/ # Auto-generated images
├── docs/                     # Documentation
│   ├── integration/          # Integration documentation
│   └── *.md                  # Architecture & guides
└── tests/                    # Test files
    └── creative-server/      # Creative server tests
```

## Status

| Feature | Status |
|---------|--------|
| Text Generation (70B) | ✅ Working |
| Image Generation | ⚠️ Backend issue |
| MCP Servers | ✅ Working |
| Git Save System | ✅ Working |
| WebSocket UI | ✅ Working |

## Performance

- **Text Generation**: 4.3 tokens/sec (high quality)
- **Image Generation**: 30-180 seconds (when backend fixed)
- **Context Window**: 32,000 tokens

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
node tests/creative-server/test-creative-simple.js
```

## Contributing

See [CLAUDE.md](CLAUDE.md) for development guidelines and architecture notes.

## License

ISC

## Support

For issues:
- Check [docs/integration/](docs/integration/) for integration issues
- Review [docs/CREATIVE_SERVER_USAGE.md](docs/CREATIVE_SERVER_USAGE.md) for usage help
- See [docs/narrative-engine-architecture.md](docs/narrative-engine-architecture.md) for architecture details
