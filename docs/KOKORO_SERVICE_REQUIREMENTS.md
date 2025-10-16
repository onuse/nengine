# Kokoro TTS Service Requirements

**Version**: 1.0
**Target**: Claude instance on AI server (192.168.1.95)
**Purpose**: REST API service wrapping Kokoro-82M for narrative game audio synthesis

---

## Service Overview

A lightweight Python microservice that exposes Kokoro-82M text-to-speech capabilities via REST API. The service will be called by the Narrative Engine (Node.js) to synthesize character dialogue and narration.

---

## Technical Specifications

### Core Requirements

- **Language**: Python 3.10+
- **Framework**: FastAPI (preferred) or Flask
- **Port**: 8001
- **Host**: 0.0.0.0 (accessible from LAN)
- **Model**: Kokoro-82M
- **Response Format**: JSON + Binary audio data

### Dependencies

```python
# Required packages
fastapi
uvicorn
kokoro  # or equivalent Kokoro-82M library
pydub   # for audio format conversion
numpy
torch   # if required by Kokoro
```

---

## API Endpoints

### 1. Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "model": "kokoro-82m",
  "version": "1.0",
  "available_voices": ["af_bella", "af_sarah", "af_nicole", "af_sky", ...],
  "gpu_available": true
}
```

**Purpose**: Allow Narrative Engine to verify service availability

---

### 2. List Available Voices

```http
GET /voices
```

**Response:**
```json
{
  "voices": [
    {
      "id": "af_bella",
      "name": "Bella",
      "gender": "female",
      "accent": "american",
      "description": "Warm, mature narrator voice"
    },
    {
      "id": "af_sarah",
      "name": "Sarah",
      "gender": "female",
      "accent": "american",
      "description": "Sophisticated, elegant"
    },
    {
      "id": "af_nicole",
      "name": "Nicole",
      "gender": "female",
      "accent": "irish",
      "description": "Playful, energetic"
    },
    {
      "id": "af_sky",
      "name": "Sky",
      "gender": "female",
      "accent": "american",
      "description": "Confident, knowing"
    }
  ]
}
```

**Purpose**: Allow dynamic voice discovery and UI voice selection

---

### 3. Synthesize Speech (Primary Endpoint)

```http
POST /synthesize
Content-Type: application/json
```

**Request Body:**
```json
{
  "text": "Hello, how can I help you today?",
  "voice": "af_sarah",
  "speed": 0.95,
  "format": "mp3",
  "sample_rate": 24000
}
```

**Request Parameters:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | ✅ Yes | - | Text to synthesize (max 500 chars) |
| `voice` | string | ✅ Yes | - | Voice ID (see /voices) |
| `speed` | float | No | 1.0 | Speed multiplier (0.5-2.0) |
| `format` | string | No | "wav" | Output format: "wav", "mp3" |
| `sample_rate` | int | No | 24000 | Sample rate in Hz |

**Response:**
```json
{
  "success": true,
  "audio": "base64_encoded_audio_data",
  "format": "mp3",
  "duration": 2.3,
  "sample_rate": 24000,
  "size_bytes": 45120,
  "metadata": {
    "text": "Hello, how can I help you today?",
    "voice": "af_sarah",
    "speed": 0.95
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Invalid voice ID",
  "error_code": "INVALID_VOICE"
}
```

**Performance Target**: <200ms per synthesis (for typical dialogue line ~50 chars)

---

### 4. Batch Synthesis (Optional but Recommended)

```http
POST /synthesize/batch
Content-Type: application/json
```

**Request Body:**
```json
{
  "segments": [
    {
      "id": "seg_001",
      "text": "The room falls silent.",
      "voice": "af_bella",
      "speed": 0.9
    },
    {
      "id": "seg_002",
      "text": "Hello, how can we help you?",
      "voice": "af_sarah",
      "speed": 0.95
    }
  ],
  "format": "mp3"
}
```

**Response:**
```json
{
  "success": true,
  "segments": [
    {
      "id": "seg_001",
      "audio": "base64_encoded_audio_data",
      "duration": 1.8,
      "size_bytes": 28440
    },
    {
      "id": "seg_002",
      "audio": "base64_encoded_audio_data",
      "duration": 2.1,
      "size_bytes": 33120
    }
  ],
  "total_duration": 3.9,
  "processing_time_ms": 145
}
```

**Purpose**: Process all segments of a narrative in one request (reduces HTTP overhead)

---

## Implementation Guidelines

### 1. Audio Processing Pipeline

```python
# Recommended flow:
text → Kokoro-82M inference → WAV audio →
  → Apply speed adjustment (if speed != 1.0) →
  → Convert to requested format (MP3/WAV) →
  → Encode base64 →
  → Return JSON response
```

### 2. Speed Adjustment

- Use `pydub` or `librosa` for time-stretching
- Preserve pitch (don't just resample)
- Quality over speed for this operation

### 3. Format Conversion

**WAV Output** (default):
```python
# Raw PCM data from Kokoro
# No additional processing needed
```

**MP3 Output** (recommended for bandwidth):
```python
# Use pydub with ffmpeg backend
# Target bitrate: 64kbps (voice optimized)
# Mono channel
```

### 4. Error Handling

**Return appropriate HTTP status codes:**
- `200 OK` - Success
- `400 Bad Request` - Invalid parameters
- `422 Unprocessable Entity` - Invalid voice ID or text too long
- `500 Internal Server Error` - Kokoro inference failed
- `503 Service Unavailable` - Model not loaded

**Always include descriptive error messages in JSON response**

### 5. Performance Optimization

**Model Loading:**
```python
# Load Kokoro model at startup, not per-request
# Keep model in VRAM for fast inference
# Use GPU if available
```

**Note on Caching:**
```python
# Caching is NOT implemented for V1
# Narrative RPG dialogue is unique and bespoke - low cache hit rate
# Kokoro is fast enough (210× realtime) without caching
# Keeps implementation simpler
```

**Concurrency:**
```python
# FastAPI handles async naturally
# Kokoro inference should be thread-safe
# Consider queue for GPU contention if needed
```

---

## Testing & Validation

### Manual Testing Checklist

1. **Health Check**
   ```bash
   curl http://192.168.1.95:8001/health
   ```

2. **List Voices**
   ```bash
   curl http://192.168.1.95:8001/voices
   ```

3. **Simple Synthesis**
   ```bash
   curl -X POST http://192.168.1.95:8001/synthesize \
     -H "Content-Type: application/json" \
     -d '{
       "text": "Hello, this is a test.",
       "voice": "af_bella",
       "format": "mp3"
     }' > test.json

   # Extract base64 audio and decode
   cat test.json | jq -r '.audio' | base64 -d > test.mp3
   ```

4. **Speed Variation**
   ```bash
   # Test slow (0.8x)
   curl -X POST http://192.168.1.95:8001/synthesize \
     -H "Content-Type: application/json" \
     -d '{"text": "Testing slow speed.", "voice": "af_bella", "speed": 0.8}'

   # Test fast (1.2x)
   curl -X POST http://192.168.1.95:8001/synthesize \
     -H "Content-Type: application/json" \
     -d '{"text": "Testing fast speed.", "voice": "af_bella", "speed": 1.2}'
   ```

5. **Batch Processing**
   ```bash
   curl -X POST http://192.168.1.95:8001/synthesize/batch \
     -H "Content-Type: application/json" \
     -d '{
       "segments": [
         {"id": "1", "text": "First segment.", "voice": "af_bella"},
         {"id": "2", "text": "Second segment.", "voice": "af_sarah"}
       ]
     }'
   ```

### Expected Performance Benchmarks

| Text Length | Expected Latency | Notes |
|-------------|------------------|-------|
| 10 chars | <50ms | Very short phrase |
| 50 chars | <100ms | Typical dialogue line |
| 200 chars | <300ms | Long narration |
| 500 chars | <500ms | Maximum recommended |

**Note**: These are targets. Actual performance depends on GPU.

---

## Voice Configuration Reference

### Recommended Voice Assignments

Based on the Lovebug game requirements:

| Character | Voice ID | Speed | Personality |
|-----------|----------|-------|-------------|
| Narrator | `af_bella` | 0.9 | Warm, mature, clear |
| Amélie | `af_sarah` | 0.95 | Sophisticated, elegant |
| Scarlett | `af_nicole` | 1.05 | Playful, energetic |
| Naomi | `af_sky` | 1.0 | Confident, knowing |

### Voice Selection Criteria

When implementing, ensure:
- Clear distinction between voices (for player recognition)
- Appropriate tone for character personality
- Good pronunciation quality
- Consistent voice characteristics across sessions

---

## Deployment Instructions

### 1. Setup Script

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install fastapi uvicorn kokoro pydub torch

# Verify Kokoro installation
python -c "import kokoro; print('Kokoro loaded successfully')"
```

### 2. Running the Service

```bash
# Development mode (with auto-reload)
uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# Production mode
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 2
```

### 3. Systemd Service (Linux)

```ini
[Unit]
Description=Kokoro TTS Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/kokoro-service
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## Integration with Narrative Engine

Once the service is running, the Narrative Engine will:

1. **Startup**: Check `/health` to verify service availability
2. **Configuration**: Load available voices from `/voices`
3. **Runtime**: POST to `/synthesize` or `/synthesize/batch` with narrative text
4. **Storage**: Decode base64 and save audio files with segment IDs
5. **Serving**: Serve audio to client via `/api/audio/{id}.mp3`

**Example Node.js integration:**
```typescript
// In src/audio/tts-service.ts
const response = await axios.post('http://192.168.1.95:8001/synthesize', {
  text: "Hello, how can I help you?",
  voice: "af_sarah",
  speed: 0.95,
  format: "mp3"
});

const audioBuffer = Buffer.from(response.data.audio, 'base64');
// Store audioBuffer with segment ID for serving
```

---

## Questions for Implementation

Before starting implementation, please confirm:

1. **Kokoro-82M Access**: Is Kokoro-82M already installed on the server?
2. **Voice IDs**: Are `af_bella`, `af_sarah`, `af_nicole`, `af_sky` the correct voice identifiers for Kokoro-82M?
3. **GPU**: Will the service have GPU access for inference?
4. **Authentication**: Do we need API key authentication, or is LAN-only access sufficient?

---

## Success Criteria

The service is considered complete when:

- ✅ All endpoints respond correctly
- ✅ Audio quality is clear and natural
- ✅ Speed adjustment works without pitch distortion
- ✅ Latency meets performance targets (<200ms for typical dialogue)
- ✅ Service runs stably for extended periods
- ✅ Error handling is robust
- ✅ Integration tests pass from Narrative Engine

---

## Future Enhancements (Not Required for V1)

- WebSocket streaming for real-time synthesis
- Voice cloning for custom characters
- Emotion/tone parameters
- SSML support for advanced control
- Prometheus metrics endpoint
- Audio effects (reverb, EQ)

---

## Contact for Questions

If anything in these requirements is unclear or needs adjustment, please reach out before starting implementation. The goal is a clean, simple, fast TTS service that integrates seamlessly with the Narrative Engine.
