# Audio Architecture for Narrative Engine

## Overview

This document describes the TTS (Text-to-Speech) integration using Kokoro-82M for voice narration in the Narrative Engine.

**Key Design Principle**: Audio is a **POST-PROCESSING** add-on. The LLM generates text normally, then the audio pipeline intelligently analyzes and synthesizes it. No LLM prompt changes required.

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NARRATIVE ENGINE                               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 1. GAME CONTENT LAYER (YAML Configuration)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  games/lovebug/game.yaml:                                               │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ audio:                                                          │    │
│  │   enabled: true                                                 │    │
│  │   provider: "kokoro"                                            │    │
│  │   defaultVoice: "af_bella"  # Narrator voice                   │    │
│  │                                                                  │    │
│  │   # Dynamic character voice mapping                             │    │
│  │   # Parser detects character names in text automatically        │    │
│  │   characters:                                                   │    │
│  │     amelie:                                                     │    │
│  │       voice: "af_sarah"      # Sophisticated French            │    │
│  │       speed: 0.95                                               │    │
│  │     scarlett:                                                   │    │
│  │       voice: "af_nicole"     # Playful Irish                   │    │
│  │       speed: 1.05                                               │    │
│  │     naomi:                                                      │    │
│  │       voice: "af_sky"        # Knowing, confident              │    │
│  │       speed: 1.0                                                │    │
│  │                                                                  │    │
│  │   narrator:                                                     │    │
│  │     voice: "af_bella"        # Default narrator                │    │
│  │     speed: 0.9               # Slightly slower for clarity     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. LLM TEXT GENERATION (Llama 3.3 70B) - UNCHANGED                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Creative Server Provider generates pure narrative text:                │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Raw LLM Output (NO AUDIO FORMATTING):                          │    │
│  │ ─────────────────────────────────────────────────────────────  │    │
│  │ You step into the dimly lit hotel room, the scent of lavender  │    │
│  │ filling the air. Three women turn to look at you with surprise.│    │
│  │                                                                  │    │
│  │ "Oh my, it seems we have an unexpected visitor," Amélie says   │    │
│  │ with a soft smile, her French accent evident.                  │    │
│  │                                                                  │    │
│  │ "Well now, this is interesting!" Scarlett laughs, tossing her  │    │
│  │ red hair over her shoulder.                                     │    │
│  │                                                                  │    │
│  │ Naomi gives you a knowing look, crossing her arms. "Lost,      │    │
│  │ are we?"                                                         │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                                    │ Text is generated normally          │
│                                    │ NO changes to LLM prompts           │
│                                    ▼                                     │
│                                                                          │
│  Text sent to BOTH:                                                     │
│  1. Client (for display) ────────────────────────────┐                 │
│  2. Audio Pipeline (if enabled) ──┐                  │                 │
│                                    │                  │                 │
└────────────────────────────────────┼──────────────────┼─────────────────┘
                                     │                  │
                                     ▼                  ▼
                            Audio Pipeline      Client Display (unchanged)
```

┌─────────────────────────────────────────────────────────────────────────┐
│ 3. INTELLIGENT TEXT ANALYSIS (POST-PROCESSING)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │ A. Smart Text Parser (src/audio/text-analyzer.ts)          │       │
│  ├─────────────────────────────────────────────────────────────┤       │
│  │                                                              │       │
│  │  Input: Raw LLM narrative (no special formatting)           │       │
│  │  Output: Structured audio segments with detected speakers   │       │
│  │                                                              │       │
│  │  interface AudioSegment {                                   │       │
│  │    speaker: string;         // "narrator", "amelie", etc.  │       │
│  │    text: string;            // Text to synthesize          │       │
│  │    voiceConfig: VoiceConfig; // Voice from game.yaml       │       │
│  │    segmentId: string;       // Unique ID                   │       │
│  │    confidence: number;       // Detection confidence        │       │
│  │  }                                                           │       │
│  │                                                              │       │
│  │  INTELLIGENT PARSING LOGIC (LLM-BASED):                    │       │
│  │  ──────────────────────────────────────────────────────    │       │
│  │  Uses Gemma 3 270M micro LLM for all speaker detection     │       │
│  │  - Single, consistent code path (~100ms per narrative)     │       │
│  │  - Handles all cases: explicit, ambiguous, contextual      │       │
│  │  - Graceful fallback to narrator on uncertainty            │       │
│  │                                                              │       │
│  │  1. Detect quoted dialogue: "..." or '...'                  │       │
│  │     Regex: /"([^"]+)"|'([^']+)'/g                          │       │
│  │                                                              │       │
│  │  2. Find character name before/after quote                  │       │
│  │     Regex patterns:                                         │       │
│  │     - /"([^"]+)",?\s*(\w+)\s+(says|asks|replies)/          │       │
│  │     - /(\w+):\s*"([^"]+)"/                                 │       │
│  │     - /(\w+)\s+(says|asks|replies),?\s*"([^"]+)"/         │       │
│  │                                                              │       │
│  │  3. Match character names from game.yaml dynamically        │       │
│  │     String matching with fuzzy tolerance                    │       │
│  │                                                              │       │
│  │  4. Non-dialogue = narrator                                 │       │
│  │  5. Look up voice config for detected character            │       │
│  │  6. Generate segment IDs (hash-based)                       │       │
│  │                                                              │       │
│  │  EXAMPLE PARSING:                                           │       │
│  │  ──────────────────────────────────────────────────────    │       │
│  │  Input:                                                      │       │
│  │    The room is silent. "Hello," Amélie says softly.        │       │
│  │                                                              │       │
│  │  Output:                                                     │       │
│  │    [                                                         │       │
│  │      {                                                       │       │
│  │        speaker: "narrator",                                 │       │
│  │        text: "The room is silent.",                         │       │
│  │        voiceConfig: { voice: "af_bella", speed: 0.9 }      │       │
│  │      },                                                      │       │
│  │      {                                                       │       │
│  │        speaker: "amelie",                                   │       │
│  │        text: "Hello",                                       │       │
│  │        voiceConfig: { voice: "af_sarah", speed: 0.95 }     │       │
│  │      }                                                       │       │
│  │    ]                                                         │       │
│  │                                                              │       │
│  │  FALLBACK STRATEGY:                                         │       │
│  │  - Undetected quotes → narrator voice                       │       │
│  │  - Unknown character → narrator voice                       │       │
│  │  - Ambiguous attribution → narrator voice                   │       │
│  └─────────────────────────────────────────────────────────────┘       │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │ B. Character Name Matcher (src/audio/character-matcher.ts) │       │
│  ├─────────────────────────────────────────────────────────────┤       │
│  │                                                              │       │
│  │  Maintains dynamic mapping of character names → voices:     │       │
│  │                                                              │       │
│  │  interface CharacterMap {                                   │       │
│  │    [characterId: string]: {                                 │       │
│  │      names: string[];        // All known name variants    │       │
│  │      voiceConfig: VoiceConfig;                              │       │
│  │    }                                                         │       │
│  │  }                                                           │       │
│  │                                                              │       │
│  │  Example for Amélie:                                        │       │
│  │  {                                                           │       │
│  │    "amelie": {                                              │       │
│  │      names: [                                               │       │
│  │        "Amélie",                                            │       │
│  │        "Amelie",          // Without accent               │       │
│  │        "the French woman",                                  │       │
│  │        "the blonde"        // Contextual references        │       │
│  │      ],                                                      │       │
│  │      voiceConfig: { voice: "af_sarah", speed: 0.95 }       │       │
│  │    }                                                         │       │
│  │  }                                                           │       │
│  │                                                              │       │
│  │  Matching Algorithm:                                        │       │
│  │  1. Direct name match (case-insensitive)                   │       │
│  │  2. Partial name match ("Amélie" matches "Amelie")         │       │
│  │  3. Load names from characters.yaml (if exists)            │       │
│  │  4. Learn new variations from context                       │       │
│  └─────────────────────────────────────────────────────────────┘       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. TTS SYNTHESIS PIPELINE                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │ A. TTS Service (src/audio/tts-service.ts)                  │       │
│  ├─────────────────────────────────────────────────────────────┤       │
│  │                                                              │       │
│  │  Kokoro-82M Integration:                                    │       │
│  │                                                              │       │
│  │  class KokoroTTSService {                                   │       │
│  │    private kokoroProcess: ChildProcess;                     │       │
│  │    private audioCache: Map<string, Buffer>;                │       │
│  │                                                              │       │
│  │    async synthesize(segment: AudioSegment): Buffer {        │       │
│  │      // 1. Check cache                                      │       │
│  │      const cacheKey = hash(segment);                        │       │
│  │      if (cache.has(cacheKey)) return cache.get(cacheKey);  │       │
│  │                                                              │       │
│  │      // 2. Call Kokoro Python API                          │       │
│  │      const audio = await callKokoro({                       │       │
│  │        text: segment.text,                                  │       │
│  │        voice: segment.voiceConfig.voice,                   │       │
│  │        speed: segment.voiceConfig.speed,                   │       │
│  │      });                                                     │       │
│  │                                                              │       │
│  │      // 3. Cache result                                     │       │
│  │      cache.set(cacheKey, audio);                           │       │
│  │      return audio;                                          │       │
│  │    }                                                         │       │
│  │                                                              │       │
│  │    async generateBatch(segments: AudioSegment[]): Audio[] { │       │
│  │      // Process all segments in parallel                    │       │
│  │      return Promise.all(segments.map(s => synthesize(s))); │       │
│  │    }                                                         │       │
│  │  }                                                           │       │
│  └─────────────────────────────────────────────────────────────┘       │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │ B. Audio Assembly (src/audio/audio-assembler.ts)           │       │
│  ├─────────────────────────────────────────────────────────────┤       │
│  │                                                              │       │
│  │  Combines audio segments into playable format:              │       │
│  │                                                              │       │
│  │  interface AudioResponse {                                  │       │
│  │    segments: {                                              │       │
│  │      id: string;                                            │       │
│  │      speaker: string;                                       │       │
│  │      audioUrl: string;     // /api/audio/{id}.mp3          │       │
│  │      text: string;          // Original text               │       │
│  │      duration: number;      // Duration in ms              │       │
│  │    }[];                                                      │       │
│  │    totalDuration: number;                                   │       │
│  │    autoPlay: boolean;                                       │       │
│  │  }                                                           │       │
│  │                                                              │       │
│  │  Assembly Options:                                          │       │
│  │  - Individual segments (for manual playback)               │       │
│  │  - Combined single file (for automatic narration)          │       │
│  │  - Streaming chunks (for real-time narration)              │       │
│  └─────────────────────────────────────────────────────────────┘       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. BACKEND API & WEBSOCKET LAYER                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Enhanced WebSocket Flow:                                               │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Server Processing:                                              │    │
│  │ ─────────────────────────────────────────────────────────────  │    │
│  │                                                                  │    │
│  │ 1. LLM generates narrative text                                │    │
│  │ 2. Send text to client immediately (for display)               │    │
│  │ 3. IF audio enabled:                                            │    │
│  │    a. Pass text to Audio Analyzer                             │    │
│  │    b. Detect speakers & segment text                           │    │
│  │    c. Synthesize audio (Kokoro)                               │    │
│  │    d. Send audio data to client                                │    │
│  │                                                                  │    │
│  │ Server → Client Message:                                        │    │
│  │ {                                                                │    │
│  │   text: string,              // Display immediately            │    │
│  │   audio?: {                  // Sent after synthesis           │    │
│  │     segments: AudioSegment[],                                   │    │
│  │     autoPlay: boolean,                                          │    │
│  │     totalDuration: number                                       │    │
│  │   }                                                              │    │
│  │ }                                                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  New API Endpoints:                                                     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ POST /api/audio/synthesize                                      │    │
│  │ ─────────────────────────────────────────────────────────────  │    │
│  │ Body: {                                                         │    │
│  │   text: string,              // Raw narrative text             │    │
│  │   gameId: string,            // For voice config lookup        │    │
│  │ }                                                                │    │
│  │                                                                  │    │
│  │ Response: AudioResponse                                         │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ GET /api/audio/{segmentId}.mp3                                 │    │
│  │ ─────────────────────────────────────────────────────────────  │    │
│  │ Serves generated audio file                                    │    │
│  │ Content-Type: audio/mpeg                                       │    │
│  │ Cache-Control: public, max-age=3600                            │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. WEB CLIENT LAYER (client/src/App.vue)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Audio Player Component (same as before - no changes needed)            │
│                                                                          │
│  WebSocket Handler:                                                     │
│  ws.on('narrative_response', (data) => {                               │
│    // Display text immediately                                          │
│    addMessage(data.text, 'description');                               │
│                                                                          │
│    // Queue audio if available                                          │
│    if (data.audio && audioEnabled.value) {                             │
│      audioSegments.value = data.audio.segments;                        │
│      if (data.audio.autoPlay) playAudio();                             │
│    }                                                                     │
│  });                                                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

## Data Flow Summary

```
Player Action
    ↓
LLM generates narrative text (UNCHANGED)
    ↓
    ├─────────────────────────────┬──────────────────────────┐
    │                             │                          │
    ▼                             ▼                          ▼
Client Display              Audio Analyzer           Characters.yaml
(immediate)              (detect speakers)         (voice mapping)
                                 │
                                 ▼
                         Kokoro TTS (synthesize)
                                 │
                                 ▼
                         Audio Assembly (URLs)
                                 │
                                 ▼
                         Client AudioPlayer
                                 │
                                 ▼
                         Player hears narration
```

## Character Configuration

```yaml
# games/lovebug/content/characters.yaml
characters:
  amelie:
    id: "amelie"
    name: "Amélie"
    aliases:                        # For text detection
      - "Amelie"                     # Without accent
      - "the French woman"
      - "the blonde"
    audio:
      voice: "af_sarah"
      speed: 0.95
      style: "formal"

  scarlett:
    id: "scarlett"
    name: "Scarlett"
    aliases:
      - "the redhead"
      - "the Irish woman"
    audio:
      voice: "af_nicole"
      speed: 1.05
      style: "casual"

  naomi:
    id: "naomi"
    name: "Naomi"
    aliases:
      - "the Black woman"
    audio:
      voice: "af_sky"
      speed: 1.0
      style: "confident"
```

## Intelligent Text Analysis Examples

### Example 1: Standard Dialogue

**Input Text:**
```
The room falls silent. "Hello," Amélie says with a warm smile.
"How can we help you?"
```

**Detected Segments:**
```javascript
[
  { speaker: "narrator", text: "The room falls silent.", voice: "af_bella" },
  { speaker: "amelie", text: "Hello", voice: "af_sarah" },
  { speaker: "amelie", text: "How can we help you?", voice: "af_sarah" }
]
```

### Example 2: Mixed Attribution

**Input Text:**
```
"Well now!" Scarlett laughs. "This is quite the surprise."
She winks at you playfully.
```

**Detected Segments:**
```javascript
[
  { speaker: "scarlett", text: "Well now! This is quite the surprise.", voice: "af_nicole" },
  { speaker: "narrator", text: "She winks at you playfully.", voice: "af_bella" }
]
```

### Example 3: Contextual Detection

**Input Text:**
```
The redhead grins. "I like your style."
```

**Detected Segments:**
```javascript
[
  { speaker: "narrator", text: "The redhead grins.", voice: "af_bella" },
  { speaker: "scarlett", text: "I like your style.", voice: "af_nicole" }
  // "the redhead" → matched to Scarlett via aliases
]
```

## Performance Characteristics

| Component | Latency | Notes |
|-----------|---------|-------|
| LLM Generation | 8-9 tok/sec | Unchanged |
| Text Analysis | <10ms | Regex + NLP parsing |
| Speaker Detection | <5ms | Character matching |
| Kokoro TTS | <100ms/sentence | 210× realtime on GPU |
| Audio Assembly | <50ms | Concatenation |
| **Total (cached)** | <15ms | Cache hit |
| **Total (uncached)** | <200ms | Full pipeline |

## Speaker Detection: Pure Micro LLM Approach

### Why Pure LLM (No Hybrid)?

**Narrative RPGs generate sophisticated, varied prose** where speaker attribution can be:
- Subtle: "She glances away. 'I can't help you.'"
- Contextual: "The redhead laughs. 'Interesting!'"
- Ambiguous: "'No.' The response is icy."
- Multi-speaker: Multiple characters in one paragraph

**A micro LLM (Gemma 3 270M) handles all of these cases consistently and accurately.**

### Design Decision: Simplicity Over Micro-Optimization

Initially considered a hybrid regex + LLM approach, but:
- **100ms latency is negligible** (0.25% of 40-second narrative generation)
- **Simpler code** - One path vs. multiple fallbacks
- **More consistent** - All cases handled the same way
- **More maintainable** - No regex patterns to update
- **More accurate** - LLM understands context that regex cannot

**The 75ms saved by hybrid doesn't justify the added complexity.**

### Single-Tier Detection Strategy

```typescript
// All cases handled by Gemma 3 270M:

Prompt:
Given this narrative paragraph and character list, identify the speaker of each quoted line.

Narrative:
She glances away. "I can't help you with that."
Naomi crosses her arms. "But I can."

Characters in scene:
- amelie (Amélie, French woman, blonde)
- scarlett (Scarlett, Irish woman, redhead)
- naomi (Naomi, Black woman)

Respond with JSON:
{
  "segments": [
    {
      "text": "I can't help you with that.",
      "speaker": "amelie",
      "confidence": 0.92,
      "reasoning": "Pronoun 'she' refers to Amélie based on context"
    },
    {
      "text": "But I can.",
      "speaker": "naomi",
      "confidence": 0.98,
      "reasoning": "Explicit name 'Naomi' mentioned before quote"
    }
  ]
}
```

**Model Selection:**
- **Gemma 3 270M** (Recommended): Ultra-lightweight, modern, fast
- Alternative: Qwen 2.5 0.5B, Phi-3 Mini, LLaMA 3.2 1B

**Requirements:**
- <1GB VRAM (can run on CPU if needed)
- Fast inference: 500-1000 tokens/sec (~100ms)
- JSON output support
- Strong instruction following

### Fallback Strategy

If LLM is uncertain (confidence <0.5):
```typescript
speaker = 'narrator'
confidence = llmConfidence
// Log for debugging
```

### Performance Profile

| Component | Latency | Percentage of Turn Time |
|-----------|---------|-------------------------|
| Narrative generation | 40-120s | 99.75% |
| Speaker detection (Gemma 3) | ~100ms | 0.25% |
| Kokoro TTS | ~100-300ms | Variable |

**Total overhead: Negligible**

### Why This Works

**Latency impact is negligible:**
- Narrative generation: 40-120 seconds
- Speaker detection: ~100ms
- Percentage overhead: 0.25%
- **User won't notice the parsing time**

**Accuracy is high:**
- LLM understands context, pronouns, aliases
- Handles all dialogue formats consistently
- Provides confidence scores for validation

**Resource cost is minimal:**
- Gemma 3 270M: <1GB VRAM
- Can share GPU with Kokoro TTS
- Could run on CPU if needed (~300ms, still acceptable)

### Edge Cases Handling

The LLM gracefully handles edge cases:

1. **Ambiguous attribution**: "Hello," she said.
   - LLM uses context to identify "she"
   - If uncertain, returns low confidence → narrator fallback

2. **Implicit dialogue**: She asked about the weather.
   - No quotes detected → narrator (handled before LLM call)

3. **Unknown character names**: "Hi," Bob says.
   - LLM returns "unknown" speaker with low confidence
   - Fallback: Use narrator voice
   - Log for review and possible character addition

4. **Multiple speakers in one paragraph**: "Yes," Jane said. "No," Tom replied.
   - LLM parses into separate segments
   - Detects both attributions in one call

**Bottom Line**: The micro LLM provides consistent, accurate speaker detection across all narrative formats with graceful degradation for edge cases.

## File Structure

```
nengine/
├── src/
│   ├── audio/
│   │   ├── text-analyzer.ts         # Intelligent text parsing
│   │   ├── character-matcher.ts     # Dynamic character detection
│   │   ├── tts-service.ts           # Kokoro integration
│   │   ├── audio-assembler.ts       # Combine segments
│   │   ├── voice-config.ts          # Voice mapping
│   │   └── audio-cache.ts           # Caching layer
│   └── index.ts                      # API endpoints
├── games/
│   └── {game}/
│       ├── game.yaml                 # Audio settings
│       └── content/
│           └── characters.yaml       # Character names & aliases
└── audio-cache/                      # Cached audio files
```

## Next Steps for Implementation

1. **Phase 1: Backend Services**
   - Set up Kokoro-82M TTS service (Python/FastAPI, port 8001)
   - Set up Gemma 3 270M speaker detection service (Python/FastAPI, port 8002)
   - Test both services with curl/Postman

2. **Phase 2: Node.js Integration**
   - Create text-analyzer.ts (calls speaker detection service, extracts quotes)
   - Create character-matcher.ts (maps character IDs to voice configs)
   - Create tts-service.ts (calls Kokoro API)
   - Create audio-assembler.ts (manages segments, generates URLs)

3. **Phase 3: Backend Integration**
   - Add audio API endpoints to index.ts
   - Update NarrativeController to call audio pipeline
   - Update WebSocket to send audio segments to client

4. **Phase 4: Content Configuration**
   - Update characters.yaml with audio voice config
   - Update game.yaml with audio settings
   - Add character name aliases for detection

5. **Phase 5: Frontend Player**
   - Build AudioPlayer.vue component
   - Integrate with App.vue
   - Add playback controls (play/pause/seek)

6. **Phase 6: Testing & Polish**
   - Test end-to-end audio pipeline
   - Add audio settings UI (enable/disable, volume)
   - Performance optimization
   - Error handling and fallbacks
