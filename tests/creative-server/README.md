# Creative Server Tests

Test files for the creative server integration.

## Running Tests

### Basic Integration Test
Tests server connection, text generation, and image generation:
```bash
node tests/creative-server/test-creative-simple.js
```

**Expected output**:
- ✅ Server health check passes
- ✅ Working set is "creative"
- ✅ Text generation works (~46 seconds)
- ⚠️ Image generation fails (known 404 issue)

### Image Endpoint Debugging
Diagnose image generation endpoint issues:
```bash
node tests/creative-server/test-image-debug.js
```

### Full Test Suite (TypeScript)
Comprehensive test including ImageService:
```bash
npx tsx tests/creative-server/test-creative-server.ts
```

## Test Files

- **test-creative-simple.js** - Simple Node.js test (no dependencies)
- **test-image-debug.js** - Debug image backend (no dependencies)
- **test-creative-server.ts** - Full TypeScript test suite

## Current Status

✅ **Text Generation**: Working perfectly
⚠️ **Image Generation**: Backend returns 404 (server-side issue)

See [../../docs/integration/IMAGE_GENERATION_ISSUE.md](../../docs/integration/IMAGE_GENERATION_ISSUE.md) for details.
