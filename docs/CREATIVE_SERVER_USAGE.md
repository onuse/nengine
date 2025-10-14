# Creative Server Integration - Usage Guide

This document explains how to use the creative server integration for enhanced narrative generation and image generation in the Narrative Engine.

## Overview

The creative server integration provides two major enhancements:

1. **Enhanced Text Generation**: Uses Llama 3.3 70B (abliterated) for more creative, detailed narrative
2. **Image Generation**: Uses FLUX Unchained for generating character portraits and scene images

## Configuration

### Game Configuration

To use the creative server, update your game's `game.yaml` file:

```yaml
llm:
  provider: creative-server  # Changed from 'ollama'
  model: llama-3.3-70b-abliterated
  fallbackModel: mistral:7b  # Fallback to local model if creative server unavailable
  temperature: 0.9  # Higher temperature for more creative output
  contextWindow: 32000  # 32K context window

  # Creative server specific settings
  creativeServer:
    baseUrl: http://192.168.1.95:8000/v1  # Optional, uses default if omitted
    adminUrl: http://192.168.1.95:8000/admin  # Optional
    autoSwitch: true  # Automatically switch to creative working set
```

### Environment Variables

Alternatively, you can set creative server configuration via environment variables:

```bash
# .env file
LLM_PROVIDER=creative-server
CREATIVE_SERVER_BASE_URL=http://192.168.1.95:8000/v1
CREATIVE_SERVER_ADMIN_URL=http://192.168.1.95:8000/admin
CREATIVE_SERVER_AUTO_SWITCH=true
```

## Features

### 1. Enhanced Narrative Generation

When using the creative server, all narrative generation automatically uses the more powerful 70B model:

```typescript
// No code changes needed - works with existing narrative controller
const result = await narrativeController.processPlayerAction({
  type: 'interaction',
  rawInput: 'I examine the mysterious artifact'
});

// Result will have more detailed, creative narrative from 70B model
console.log(result.narrative);
```

### 2. Automatic Entity Image Generation

When creating dynamic NPCs, images are automatically generated:

```typescript
// Create dynamic NPC via MCP
const npcId = await mcpManager.executeTool('entity-content', 'createDynamicNPC', {
  name: 'Mysterious Stranger',
  personality: {
    traits: ['mysterious', 'cunning', 'dangerous'],
    appearance: 'hooded figure with glowing eyes'
  },
  role: 'antagonist',
  spawn: { room: 'tavern' }
});

// Image is automatically generated in background
// Access it via: GET /api/images/entity/{npcId}
```

### 3. Manual Image Generation

You can also manually generate images via the API:

#### Generate Entity Portrait

```bash
curl -X POST http://localhost:3000/api/images/generate/entity \
  -H "Content-Type: application/json" \
  -d '{
    "entityId": "npc_mysterious_stranger",
    "description": "mysterious hooded figure, glowing eyes, dark robes, fantasy art",
    "options": {
      "size": "512x512",
      "steps": 20
    }
  }'
```

Response:
```json
{
  "success": true,
  "imageId": "entity_npc_mysterious_stranger_1234567890",
  "url": "/api/images/entity_npc_mysterious_stranger_1234567890"
}
```

#### Generate Scene Image

```bash
curl -X POST http://localhost:3000/api/images/generate/scene \
  -H "Content-Type: application/json" \
  -d '{
    "sceneId": "tavern_main",
    "description": "dimly lit medieval tavern, warm firelight, wooden beams, patrons in shadows",
    "options": {
      "size": "768x768",
      "steps": 25
    }
  }'
```

### 4. Image Retrieval

#### Get Image by ID
```bash
# Returns PNG image
GET /api/images/{imageId}
```

#### Get Entity's Image
```bash
# Returns metadata and URL
GET /api/images/entity/{entityId}
```

Response:
```json
{
  "imageId": "entity_npc_bartender_1234567890",
  "url": "/api/images/entity_npc_bartender_1234567890",
  "metadata": {
    "id": "entity_npc_bartender_1234567890",
    "prompt": "character portrait, gruff bartender...",
    "filename": "entity_npc_bartender_1234567890.png",
    "entityId": "npc_bartender",
    "timestamp": 1234567890000,
    "size": "512x512",
    "generator": "creative-server"
  }
}
```

#### List All Images
```bash
GET /api/images
```

## Performance Considerations

### Text Generation
- **Prompt processing**: ~53ms/token
- **Generation**: ~114ms/token (8-9 tokens/sec)
- **200 token response**: ~23 seconds
- **500 token response**: ~57 seconds

### Image Generation
- **512x512 @ 20 steps**: ~30-45 seconds
- **768x768 @ 20 steps**: ~60-90 seconds
- **1024x1024 @ 20 steps**: ~120-180 seconds

### Optimization Tips

1. **Pre-generate images**: Generate character portraits during NPC creation, not during gameplay
2. **Cache responses**: The image service automatically caches generated images
3. **Lower steps for prototyping**: Use 15 steps instead of 20 for faster iteration
4. **Use smaller sizes**: 512x512 is sufficient for most character portraits

## Working Set Management

The creative server supports multiple "working sets" (collections of models). The integration automatically switches to the "creative" set if `autoSwitch: true`.

### Manual Set Switching

```bash
# Check current set
curl http://192.168.1.95:8000/admin/sets

# Switch to creative set
curl -X POST http://192.168.1.95:8000/admin/sets/switch \
  -H "Content-Type: application/json" \
  -d '{"target_set": "creative"}'

# Wait 60 seconds for models to load
```

## Error Handling

### Creative Server Unavailable

If the creative server is not reachable, the system will:
1. Log a warning
2. Fall back to the `fallbackModel` (usually local Ollama)
3. Continue operating with reduced capabilities (no image generation)

### Wrong Working Set Active

```
Error: "No chat model available in current working set"
```

**Solution**:
- Enable `autoSwitch: true` in config, or
- Manually switch to creative working set

### Image Generation Timeout

Image generation has a 5-minute timeout. For large images (1024x1024), this may not be enough.

**Solution**:
- Use smaller image sizes (512x512 or 768x768)
- Reduce steps (15-20 is usually sufficient)

## Example: Complete Integration

Here's a complete example game configuration using the creative server:

```yaml
# games/my-game/game.yaml
game:
  title: "The Dark Tower"
  startingRoom: tower_entrance
  maturity_rating: adult  # Trigger uncensored model preference

llm:
  provider: creative-server
  model: llama-3.3-70b-abliterated
  fallbackModel: gemma2:9b
  temperature: 0.9
  contextWindow: 32000

  creativeServer:
    autoSwitch: true

  extraInstructions: |
    This is a dark fantasy game with mature themes.
    Use vivid, atmospheric descriptions.
    Don't shy away from darker elements.
    NPCs should feel real and complex.

# NPCs will automatically get portrait generation
# All narrative will use the powerful 70B model
```

## Troubleshooting

### Check Server Status
```bash
curl http://192.168.1.95:8000/health
```

### Check Model Availability
```bash
curl http://192.168.1.95:8000/v1/models
```

### View Generated Images
All generated images are stored in:
```
games/{game-name}/generated-images/
```

With metadata in:
```
games/{game-name}/generated-images/metadata.json
```

## Advanced: Custom Image Prompts

For more control over image generation, you can customize prompts in the Entity Content MCP:

```typescript
// In entity-content-mcp.ts, modify generateNPCPortrait():

private async generateNPCPortrait(npcId: string, npc: NPCTemplate): Promise<void> {
  // Custom prompt building
  let description = `${npc.name}, ${npc.role}`;

  // Add specific visual style
  description += ', oil painting style, dramatic lighting, renaissance art';

  // Add negative prompt to avoid unwanted elements
  await this.imageService.generateEntityImage(npcId, description, {
    size: '512x512',
    steps: 25,
    negativePrompt: 'blurry, low quality, deformed, cartoon'
  });
}
```

## See Also

- [CREATIVE_INTEGRATION.md](CREATIVE_INTEGRATION.md) - Technical API reference
- [narrative-engine-architecture.md](narrative-engine-architecture.md) - System architecture
- [Game Configuration Guide](game-configuration.md) - Complete configuration options
