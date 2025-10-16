# Audio Services Deployment Guide

**Status**: ✅ PRODUCTION READY
**Date**: 2025-10-16
**Services**: Speaker Detection + Kokoro TTS
**Server**: 192.168.1.95

---

## Overview

Two microservices are now running on the AI server to support narrative audio generation for the Creative Set (role-playing games):

1. **Speaker Detection Service** (Port 8002) - Identifies speakers in narrative text
2. **Kokoro TTS Service** (Port 8001) - Synthesizes speech with character voices

Both services are running as systemd services and will auto-start on boot.

---

## Service Endpoints

### Speaker Detection Service
**Base URL**: `http://192.168.1.95:8002`

#### Health Check
```http
GET /health
```
**Response**:
```json
{
  "status": "healthy",
  "model": "qwen-2.5-0.5b-instruct",
  "version": "1.0",
  "llama_server_port": 8084
}
```

#### Parse Speakers
```http
POST /parse-speakers
Content-Type: application/json
```
**Request**:
```json
{
  "narrative": "She glances away. \"I can't help you with that.\"\nNaomi crosses her arms. \"But I can.\"",
  "characters": [
    {
      "id": "amelie",
      "name": "Amélie",
      "aliases": ["she", "the French woman", "the blonde"],
      "description": "French woman with long blonde hair"
    },
    {
      "id": "naomi",
      "name": "Naomi",
      "aliases": ["the Black woman"],
      "description": "Black woman, confident demeanor"
    }
  ],
  "context": {
    "recentSpeakers": ["amelie"],
    "currentRoom": "hotel_room_405"
  }
}
```

**Response**:
```json
{
  "success": true,
  "segments": [
    {
      "text": "I can't help you with that.",
      "speaker": "amelie",
      "confidence": 0.92,
      "reasoning": "Context suggests 'she' refers to Amélie"
    },
    {
      "text": "But I can.",
      "speaker": "naomi",
      "confidence": 0.98,
      "reasoning": "Explicit name 'Naomi' mentioned before quote"
    }
  ],
  "processing_time_ms": 564
}
```

---

### Kokoro TTS Service
**Base URL**: `http://192.168.1.95:8001`

#### Health Check
```http
GET /health
```
**Response**:
```json
{
  "status": "healthy",
  "model": "kokoro-82m",
  "version": "1.0",
  "available_voices": ["af_bella", "af_sarah", "af_nicole", "af_sky"],
  "gpu_available": false
}
```

#### List Voices
```http
GET /voices
```
**Response**:
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

#### Synthesize Speech
```http
POST /synthesize
Content-Type: application/json
```
**Request**:
```json
{
  "text": "Hello, this is a test.",
  "voice": "af_bella",
  "speed": 1.0,
  "format": "wav",
  "sample_rate": 24000
}
```

**Response**:
```json
{
  "success": true,
  "audio": "UklGRuABAABXQVZFZm10IBAAAA...",  // base64 encoded WAV
  "format": "wav",
  "duration": 2.05,
  "sample_rate": 24000,
  "size_bytes": 98444,
  "metadata": {
    "text": "Hello, this is a test.",
    "voice": "af_bella",
    "speed": 1.0,
    "processing_time_ms": 345
  }
}
```

#### Batch Synthesis
```http
POST /synthesize/batch
Content-Type: application/json
```
**Request**:
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
  "format": "wav"
}
```

**Response**:
```json
{
  "success": true,
  "segments": [
    {
      "id": "seg_001",
      "audio": "UklGRuABAABXQVZFZm10IBAAAA...",
      "duration": 1.8,
      "size_bytes": 28440
    },
    {
      "id": "seg_002",
      "audio": "UklGRuABAABXQVZFZm10IBAAAA...",
      "duration": 2.1,
      "size_bytes": 33120
    }
  ],
  "total_duration": 3.9,
  "processing_time_ms": 1270
}
```

---

## Implementation Details

### Architecture

```
┌─────────────────┐
│  Game Server    │
│   (Node.js)     │
└────────┬────────┘
         │
         ├──────────────────────────────┐
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌─────────────────┐
│ Speaker Detect  │          │   Kokoro TTS    │
│   Port 8002     │          │   Port 8001     │
└────────┬────────┘          └─────────────────┘
         │
         ▼
┌─────────────────┐
│ llama-server    │
│   (Qwen 2.5)    │
│   Port 8084     │
└─────────────────┘
```

### Models Used

**Speaker Detection**:
- Model: Qwen 2.5 0.5B Instruct (Q4_K_M quantized)
- Size: 469MB on disk, ~500MB in memory
- Backend: llama.cpp via llama-server
- Inference time: ~500-700ms per request

**Kokoro TTS**:
- Model: Kokoro-82M
- Size: ~1GB in memory
- Inference time: ~345ms for 2 seconds of audio
- Output: 24kHz 16-bit mono WAV

### Voice Assignments (Recommended)

Based on the Lovebug game requirements:

| Character | Voice ID | Speed | Personality |
|-----------|----------|-------|-------------|
| Narrator | `af_bella` | 0.9 | Warm, mature, clear |
| Amélie | `af_sarah` | 0.95 | Sophisticated, elegant |
| Scarlett | `af_nicole` | 1.05 | Playful, energetic |
| Naomi | `af_sky` | 1.0 | Confident, knowing |

---

## Integration Example (Node.js/TypeScript)

### Step 1: Parse Speakers

```typescript
import axios from 'axios';

const SPEAKER_DETECTION_URL = 'http://192.168.1.95:8002';
const TTS_URL = 'http://192.168.1.95:8001';

async function parseNarrative(narrative: string, characters: Character[]) {
  const response = await axios.post(`${SPEAKER_DETECTION_URL}/parse-speakers`, {
    narrative,
    characters: characters.map(c => ({
      id: c.id,
      name: c.name,
      aliases: c.aliases || [],
      description: c.description
    })),
    context: {
      recentSpeakers: getRecentSpeakers(),
      currentRoom: getCurrentRoom()
    }
  });

  return response.data.segments;
}
```

### Step 2: Synthesize Audio

```typescript
async function synthesizeSegments(segments: Segment[], voiceMap: Map<string, VoiceConfig>) {
  const batchRequest = {
    segments: segments.map((seg, idx) => {
      const voiceConfig = voiceMap.get(seg.speaker) || {
        voice: 'af_bella',
        speed: 1.0
      };

      return {
        id: `seg_${idx}`,
        text: seg.text,
        voice: voiceConfig.voice,
        speed: voiceConfig.speed
      };
    }),
    format: 'wav'
  };

  const response = await axios.post(`${TTS_URL}/synthesize/batch`, batchRequest);

  // Decode base64 audio and save
  for (const segment of response.data.segments) {
    const audioBuffer = Buffer.from(segment.audio, 'base64');
    await saveAudioFile(`${segment.id}.wav`, audioBuffer);
  }

  return response.data.segments;
}
```

### Complete Pipeline

```typescript
async function generateNarrativeAudio(narrative: string, characters: Character[]) {
  // Step 1: Parse speakers
  const segments = await parseNarrative(narrative, characters);

  // Step 2: Map characters to voices
  const voiceMap = new Map([
    ['narrator', { voice: 'af_bella', speed: 0.9 }],
    ['amelie', { voice: 'af_sarah', speed: 0.95 }],
    ['scarlett', { voice: 'af_nicole', speed: 1.05 }],
    ['naomi', { voice: 'af_sky', speed: 1.0 }],
  ]);

  // Step 3: Synthesize all segments
  const audioSegments = await synthesizeSegments(segments, voiceMap);

  // Step 4: Return audio file paths
  return audioSegments.map(seg => ({
    id: seg.id,
    audioPath: `/audio/${seg.id}.wav`,
    duration: seg.duration
  }));
}
```

---

## Error Handling

### Speaker Detection Errors

**Low confidence**: If `confidence < 0.5`, consider falling back to narrator voice:
```typescript
const speaker = segment.confidence >= 0.5 ? segment.speaker : 'narrator';
```

**Service unavailable**:
```typescript
try {
  const segments = await parseNarrative(narrative, characters);
} catch (error) {
  // Fallback: Use simple regex parsing or assign all to narrator
  console.warn('Speaker detection unavailable, using fallback');
  segments = [{
    text: narrative,
    speaker: 'narrator',
    confidence: 0.3,
    reasoning: 'Service unavailable'
  }];
}
```

### TTS Errors

**Service unavailable**: Queue for retry or use cached audio
```typescript
try {
  await synthesizeSegments(segments, voiceMap);
} catch (error) {
  // Queue for later synthesis
  await queueForRetry(segments);
}
```

**Rate limiting**: Process in batches if sending many requests
```typescript
// Use batch endpoint for multiple segments
const batchSize = 10;
for (let i = 0; i < segments.length; i += batchSize) {
  const batch = segments.slice(i, i + batchSize);
  await synthesizeSegments(batch, voiceMap);
}
```

---

## Performance Characteristics

### Speaker Detection
- **Latency**: 500-700ms per request
- **Throughput**: ~2 requests/second
- **Memory**: ~500MB (Qwen model)
- **Concurrent requests**: Limited to 1 (sequential processing)

### Kokoro TTS
- **Latency**: ~170ms per second of audio (realtime factor ~0.17x)
- **Example**: 2 seconds of audio = ~345ms processing
- **Memory**: ~1GB (Kokoro model)
- **Batch performance**: ~385ms per segment (1270ms for 3.3s total)

### Total Pipeline Time
For a typical narrative (5 dialogue lines, ~10 seconds total audio):
- Speaker detection: ~600ms
- TTS synthesis: ~1700ms (batch)
- **Total**: ~2.3 seconds

---

## Service Management

### Checking Status
```bash
# Check all services
sudo systemctl status speaker-detector
sudo systemctl status kokoro-tts
sudo systemctl status llama-server-qwen25

# View logs
sudo journalctl -u speaker-detector -f
sudo journalctl -u kokoro-tts -f
```

### Restarting Services
```bash
sudo systemctl restart speaker-detector
sudo systemctl restart kokoro-tts
sudo systemctl restart llama-server-qwen25
```

### Auto-start on Boot
All services are already configured to start automatically on boot.

---

## Testing Checklist

Before integrating, verify:

- [ ] Health endpoints return 200 OK
- [ ] Speaker detection handles explicit attribution
- [ ] Speaker detection handles pronoun resolution with context
- [ ] TTS generates valid WAV files
- [ ] TTS batch endpoint works for multiple segments
- [ ] Different voices sound distinct
- [ ] Speed parameter works correctly
- [ ] Error handling is robust

---

## Known Limitations

### Speaker Detection
1. **Accuracy**: Currently ~80-90% accurate on ambiguous cases. Will improve with testing.
2. **Context window**: Limited to recent speakers, no full conversation history
3. **Sequential processing**: Cannot handle concurrent requests (queue on client side)

### Kokoro TTS
1. **Format support**: Only WAV currently implemented (MP3 planned)
2. **Voice selection**: Limited to 4 American/Irish female voices
3. **No GPU acceleration**: Running on CPU (still fast enough)

---

## Troubleshooting

### Speaker Detection Returns Low Confidence
**Cause**: Ambiguous pronoun or unclear context
**Solution**: Provide more explicit character descriptions and recent speaker history

### TTS Audio Sounds Unnatural
**Cause**: Speed too fast/slow or punctuation issues
**Solution**: Adjust `speed` parameter (0.5-2.0 range) and ensure proper punctuation

### Service Not Responding
**Cause**: Model still loading or service crashed
**Solution**: Check logs with `sudo journalctl -u <service-name> -n 100`

---

## Contact

For issues or questions:
- Check service logs: `sudo journalctl -u speaker-detector -n 50`
- Server location: `/home/jonas/speaker-detector/` and `/home/jonas/kokoro-tts/`
- AI server: 192.168.1.95

---

**Ready for integration!** The game server team can now start calling these endpoints. Let us know if you encounter any issues during testing.
