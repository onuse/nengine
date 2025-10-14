# Image Generation Backend Issue

**Date**: 2025-10-13
**Server**: http://192.168.1.95:8000

## Problem

Image generation endpoint returns **502 Bad Gateway** with backend **404 Not Found**.

Text generation works perfectly. Image generation fails consistently.

## Error Details

### Request
```bash
curl -X POST http://192.168.1.95:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "flux-unchained:12b",
    "prompt": "test image",
    "size": "512x512"
  }'
```

### Response
```json
HTTP 502 Bad Gateway
{
  "detail": "Backend error: 404: Image generation failed: {\"detail\":\"Not Found\"}"
}
```

## What We Know

1. **Model is registered correctly** in router:
   ```json
   {
     "id": "flux-unchained:12b",
     "meta": {
       "type": "image",
       "backend": "http://localhost:8083",
       "working_set": "creative"
     }
   }
   ```

2. **Server health is good**: `curl http://192.168.1.95:8000/health` returns `{"status":"healthy"}`

3. **Working set is active**: Current working set is "creative"

4. **Text generation works**: Llama 3.3 70B on port 8080 works perfectly

5. **Image backend returns 404**: Backend at `localhost:8083` appears to return 404 when router forwards the request

## Request Flow

```
Client → 192.168.1.95:8000/v1/images/generations
       ↓
Router forwards to → localhost:8083
       ↓
Backend returns → 404 Not Found
       ↓
Router wraps as → 502 Bad Gateway
```

## Questions for Server Team

1. **Is the image service running on port 8083?**
   ```bash
   netstat -tlnp | grep 8083
   curl http://localhost:8083/health
   ```

2. **What endpoint path does the backend expect?**
   - Is it `/v1/images/generations` (OpenAI format)?
   - Is it something else like `/sdapi/v1/txt2img`?

3. **Check backend logs for 404 errors:**
   ```bash
   sudo journalctl -u sd-server -n 50
   # or wherever image service logs are
   ```

4. **Test backend directly (bypass router):**
   ```bash
   curl http://localhost:8083/v1/images/generations -X POST \
     -H "Content-Type: application/json" \
     -d '{"prompt":"test","size":"512x512"}'
   ```

## Expected Behavior

Should return:
```json
{
  "data": [
    {
      "b64_json": "base64_encoded_image_data..."
    }
  ]
}
```

## Impact

- Text generation: ✅ Working perfectly
- Image generation: ❌ Not working (404 from backend)
- Client code: ✅ Complete and ready (will work once backend fixed)

---

**Priority**: Medium
**Component**: Image Generation Backend (Port 8083)
**Action Needed**: Investigate why backend returns 404
