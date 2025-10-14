# Ollama Removed - Creative Server Only

## Changes Made

This system now **only** uses the creative server at `192.168.1.95:8000`. All Ollama fallback code has been removed.

### What Was Removed

1. **OllamaProvider import** from narrative-controller.ts
2. **Ollama fallback logic** - No more fallback to local models
3. **Default Ollama models** - gemma2:9b, mistral:7b defaults removed
4. **Provider switch statement** - Only creative-server is supported

### Updated Defaults

**Before:**
```typescript
model: 'gemma2:9b'
fallbackModel: 'mistral:7b'
temperature: 0.7
contextWindow: 4096
```

**After:**
```typescript
model: 'llama-3.3-70b-abliterated'
temperature: 0.9
contextWindow: 32000
// No fallback - creative server only
```

### Configuration

All games must now use creative-server configuration:

```yaml
# games/your-game/game.yaml
llm:
  provider: creative-server  # Required - only option
  model: llama-3.3-70b-abliterated
  temperature: 0.9
  contextWindow: 32000

  creativeServer:
    baseUrl: http://192.168.1.95:8000/v1  # Optional - this is default
    adminUrl: http://192.168.1.95:8000/admin  # Optional - this is default
    autoSwitch: true  # Automatically switch to creative working set
```

### Simplified Code

**NarrativeController initialization:**
```typescript
// OLD - Had switch statement for multiple providers
private initializeLLMProvider(): void {
  switch (this.config.llmProvider) {
    case 'ollama': ...
    case 'creative-server': ...
  }
}

// NEW - Direct creative server initialization
private initializeLLMProvider(): void {
  this.llmProvider = new CreativeServerProvider({
    baseUrl: this.config.creativeServer?.baseUrl,
    adminUrl: this.config.creativeServer?.adminUrl,
    textModel: this.config.model,
    temperature: this.config.temperature,
    contextWindow: this.config.maxContextTokens,
    autoSwitch: this.config.creativeServer?.autoSwitch ?? true
  });
}
```

### Type Changes

**LLMConfig:**
```typescript
// Before
provider: 'ollama' | 'openai' | 'local' | 'creative-server'
fallbackModel?: string

// After
provider: 'creative-server'  // Only option
// fallbackModel removed
```

**NarrativeConfig:**
```typescript
// Before
llmProvider: 'ollama' | 'creative-server'
fallbackModel: string

// After
llmProvider: 'creative-server'
// fallbackModel removed
```

### Error Handling

**Before:** If creative server unavailable, fall back to Ollama

**After:** If creative server unavailable, system will fail with clear error:
```
Error: Creative server is not reachable at http://192.168.1.95:8000/v1
```

This is intentional - there is no fallback. The system requires the creative server.

### Dependencies

**Still Required:**
- axios (for API calls)
- All MCP infrastructure
- ImageService
- CreativeServerProvider

**No Longer Used:**
- ollama-provider.ts (kept for reference but not imported)
- Ollama-specific configuration
- Local model management
- Model auto-download logic

### Migration from Ollama

If you have old game configs with Ollama settings:

**Old Config:**
```yaml
llm:
  provider: ollama
  model: gemma2:9b
  fallbackModel: mistral:7b
```

**New Config:**
```yaml
llm:
  provider: creative-server
  model: llama-3.3-70b-abliterated
  creativeServer:
    autoSwitch: true
```

### Server Requirements

The system now **requires**:
- Creative server running at 192.168.1.95:8000
- Creative working set active
- Llama 3.3 70B model loaded
- Network connectivity to server

**No local models needed** - Ollama can be uninstalled from this machine.

### Advantages

1. **Simpler codebase** - One provider, less branching
2. **Better quality** - Always uses 70B model
3. **Larger context** - 32K vs 8K tokens
4. **Uncensored** - Abliterated model for mature content
5. **Image generation** - FLUX Unchained support
6. **No local VRAM** - All processing on server

### Trade-offs

1. **Network dependency** - Requires server connection
2. **Single point of failure** - No fallback if server down
3. **Slower generation** - 4-5 tokens/sec vs 50+ local
4. **Shared resource** - Server handles multiple clients

### Testing

Test connectivity:
```bash
# Health check
curl http://192.168.1.95:8000/health

# Working set
curl http://192.168.1.95:8000/admin/sets

# Text generation
curl -X POST http://192.168.1.95:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.3-70b-abliterated","messages":[{"role":"user","content":"test"}]}'
```

### Startup

When starting the game:
```bash
npm run dev -- --game=your-game
```

Expected output:
```
🔍 Detecting system capabilities...
[CreativeServerProvider] Initializing creative server integration...
[CreativeServerProvider] Server available: true
[CreativeServerProvider] Creative working set already active
[CreativeServerProvider] Ready with model: llama-3.3-70b-abliterated
[NarrativeController] LLM provider ready
[NarrativeController] Narrative Controller initialized
[ImageService] Image service connected to Entity Content MCP
```

### Files Modified

- ✅ `src/llm/types.ts` - Removed Ollama from provider union
- ✅ `src/llm/narrative-controller.ts` - Removed OllamaProvider import and switch
- ✅ `src/index.ts` - Updated default config
- ✅ `games/example-creative-game/game.yaml` - Removed fallbackModel
- ✅ All new game configs should not include Ollama options

### Files Kept (For Reference)

- `src/llm/ollama-provider.ts` - Kept but not used
  - May be useful for comparison or future local model support
  - Not imported anywhere

## Summary

**This is now a creative-server-only system.**

- ✅ Simpler architecture
- ✅ Better quality narratives
- ✅ Image generation support
- ✅ No local model management
- ⚠️ Requires server connectivity
- ⚠️ No fallback options

If the creative server goes down, the system will not work. This is by design.
