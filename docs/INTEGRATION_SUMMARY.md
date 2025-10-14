# Creative Server Integration - Summary

## What Was Added

The Narrative Engine now supports integration with a creative AI server that provides:

1. **Enhanced Text Generation**: Llama 3.3 70B model (abliterated/uncensored) for richer narratives
2. **Image Generation**: FLUX Unchained for automatic character portraits and scene images

## Key Components

### 1. CreativeServerProvider ([src/llm/creative-server-provider.ts](../src/llm/creative-server-provider.ts))
- OpenAI-compatible API client for text and image generation
- Automatic working set switching
- Health checking and fallback handling
- Performance: ~8-9 tokens/sec for text, 30-180s for images

### 2. ImageService ([src/services/image-service.ts](../src/services/image-service.ts))
- Manages image generation, storage, and serving
- Automatic caching (no regeneration for existing entities)
- Metadata tracking with JSON storage
- Base64 decoding and PNG file management

### 3. Updated Type Definitions ([src/llm/types.ts](../src/llm/types.ts))
```typescript
// New provider type
provider: 'ollama' | 'openai' | 'local' | 'creative-server'

// New image generation interfaces
ImageGenerationOptions {
  size?: '512x512' | '768x768' | '1024x1024'
  steps?: number
  cfgScale?: number
  negativePrompt?: string
  seed?: number
}
```

### 4. Enhanced Entity MCP ([src/mcp/entity-content-mcp.ts](../src/mcp/entity-content-mcp.ts))
- Automatic portrait generation when creating dynamic NPCs
- Configurable image service injection
- Background generation (non-blocking)

### 5. Image API Endpoints ([src/index.ts](../src/index.ts))
```
POST /api/images/generate/entity  - Generate entity portrait
POST /api/images/generate/scene   - Generate scene image
GET  /api/images/:imageId          - Retrieve generated image
GET  /api/images/entity/:entityId  - Get entity's portrait
GET  /api/images                   - List all images
```

## File Structure

```
src/
├── llm/
│   ├── creative-server-provider.ts  [NEW] - Creative server client
│   ├── types.ts                     [UPDATED] - Added image interfaces
│   ├── narrative-controller.ts      [UPDATED] - Creative server support
│   └── ollama-provider.ts           [EXISTING] - Original Ollama integration
├── services/
│   └── image-service.ts             [NEW] - Image generation & storage
└── index.ts                         [UPDATED] - Image API endpoints

docs/
├── CREATIVE_INTEGRATION.md          [EXISTING] - API reference
├── CREATIVE_SERVER_USAGE.md         [NEW] - Usage guide
└── INTEGRATION_SUMMARY.md           [NEW] - This file

games/
└── {game-name}/
    └── generated-images/            [NEW] - Auto-created on first use
        ├── *.png                    - Generated images
        └── metadata.json            - Image metadata
```

## Quick Start

### 1. Update Game Configuration

```yaml
# games/your-game/game.yaml
llm:
  provider: creative-server
  model: llama-3.3-70b-abliterated
  fallbackModel: gemma2:9b
  temperature: 0.9
  contextWindow: 32000
  creativeServer:
    autoSwitch: true
```

### 2. Start the Server

```bash
npm run dev -- --game=your-game
```

The system will:
- Check creative server availability (192.168.1.95:8000)
- Switch to creative working set (if autoSwitch: true)
- Initialize image service
- Connect image service to entity MCP

### 3. Use Enhanced Features

**Automatic**: NPCs created via MCP automatically get portraits generated
**Manual**: Use POST /api/images/generate/entity for custom images

## Benefits

### For Game Designers
- **Better Narratives**: 70B model creates more detailed, immersive text
- **Visual Assets**: Automatic character portrait generation
- **No Censorship**: Abliterated model for mature content
- **Easy Integration**: Just change `provider: creative-server`

### For Players
- **Richer Stories**: More detailed, atmospheric descriptions
- **Visual Feedback**: See character portraits
- **Dynamic Content**: Images generated on-the-fly for dynamic NPCs

### For Developers
- **Clean Architecture**: Follows existing LLMProvider interface
- **Fallback Support**: Gracefully handles server unavailability
- **Caching**: Images cached to avoid regeneration
- **REST API**: Standard endpoints for integration

## Performance

### Text Generation (70B Model)
- ~114ms per token (8-9 tokens/sec)
- 200 token response: ~23 seconds
- 500 token response: ~57 seconds

**Note**: Significantly slower than local models (Gemma2 9B is ~50 tokens/sec), but much higher quality

### Image Generation (FLUX Unchained)
- 512x512 @ 20 steps: ~30-45 seconds
- 768x768 @ 20 steps: ~60-90 seconds
- 1024x1024 @ 20 steps: ~120-180 seconds

**Tip**: Generate images during NPC creation, not during active gameplay

## Limitations

1. **Network Dependency**: Requires creative server to be reachable
2. **Slower Generation**: 70B model is slower than local models
3. **Server Capacity**: Creative server handles 4 parallel requests
4. **Local Network Only**: Server runs on local network (192.168.1.95)

## Future Enhancements

Potential improvements:
- [ ] Streaming responses for text generation
- [ ] Image prompt templates per game genre
- [ ] Batch image generation
- [ ] Image style transfer
- [ ] Scene composition (multiple characters)
- [ ] Image caching strategy improvements
- [ ] CDN integration for image serving
- [ ] Thumbnail generation
- [ ] Image variation generation

## Testing

To test the integration:

```bash
# 1. Test text generation
curl -X POST http://localhost:3000/api/narrative/action \
  -H "Content-Type: application/json" \
  -d '{"rawInput": "I examine the mysterious artifact"}'

# 2. Test image generation
curl -X POST http://localhost:3000/api/images/generate/entity \
  -H "Content-Type: application/json" \
  -d '{
    "entityId": "test_npc",
    "description": "gruff bartender, scarred face, missing eye",
    "options": {"size": "512x512", "steps": 20}
  }'

# 3. View generated image
# Open in browser: http://localhost:3000/api/images/entity_test_npc_{timestamp}
```

## Migration Path

Existing games can migrate gradually:

1. **Phase 1**: Change provider, keep fallback
   ```yaml
   llm:
     provider: creative-server
     fallbackModel: gemma2:9b  # Still works if server down
   ```

2. **Phase 2**: Test enhanced narratives
   - No code changes needed
   - Just observe narrative quality improvements

3. **Phase 3**: Enable image generation
   - Automatic for new NPCs
   - Manual API calls for existing content

4. **Phase 4**: Full optimization
   - Pre-generate key character portraits
   - Optimize prompt engineering
   - Fine-tune creative instructions

## Support

For issues or questions:
1. Check [CREATIVE_SERVER_USAGE.md](CREATIVE_SERVER_USAGE.md) for detailed usage
2. Review [CREATIVE_INTEGRATION.md](CREATIVE_INTEGRATION.md) for API reference
3. Verify creative server health: `curl http://192.168.1.95:8000/health`
4. Check logs: Look for `[CreativeServerProvider]` or `[ImageService]` entries

## Credits

Integration designed to work with:
- **Model Router** server (custom OpenAI-compatible API)
- **Llama 3.3 70B Abliterated** (Q5_K_M quantization)
- **FLUX Unchained 12B** (Q8_0 quantization)

Built on top of the Narrative Engine architecture documented in [narrative-engine-architecture.md](narrative-engine-architecture.md).
