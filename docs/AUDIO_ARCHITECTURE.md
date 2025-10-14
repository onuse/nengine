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
│  │  INTELLIGENT PARSING LOGIC (NO LLM REQUIRED):               │       │
│  │  ──────────────────────────────────────────────────────    │       │
│  │  Uses REGEX + NLP PARSING (NOT AI inference)               │       │
│  │  - Pure algorithmic parsing, no LLM calls                   │       │
│  │  - Deterministic results (same input → same output)         │       │
│  │  - <10ms latency (vs. 1000ms+ for LLM)                     │       │
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

## Why NOT Use LLM for Text Parsing?

### Algorithmic Parsing (Our Approach)
- **Latency**: <10ms per narrative
- **Deterministic**: Same input always produces same output
- **No VRAM**: No GPU memory required
- **No API calls**: Works offline
- **Debuggable**: Easy to trace and fix parsing errors
- **Reliable**: Regex patterns handle 95%+ of common dialogue formats

### LLM-Based Parsing (Rejected)
- **Latency**: 1000ms+ per narrative (100× slower)
- **Non-deterministic**: Same input may vary across runs
- **VRAM cost**: Would need additional 2-8GB
- **Complexity**: Requires prompt engineering and monitoring
- **Overhead**: Extra API calls, error handling
- **Overkill**: Dialogue detection is a pattern matching problem

### Edge Cases and Fallbacks

The algorithmic parser handles edge cases gracefully:

1. **Ambiguous attribution**: "Hello," she said.
   - Fallback: Use narrator voice
   - Alternative: Track last speaker and infer

2. **Implicit dialogue**: She asked about the weather.
   - Fallback: Use narrator voice
   - (No quotes detected)

3. **Unknown character names**: "Hi," Bob says.
   - Fallback: Use narrator voice
   - Log unknown character for review

4. **Multiple speakers in one sentence**: "Yes," Jane said. "No," Tom replied.
   - Parse into separate segments
   - Detect both attributions

**Bottom Line**: For 95% of narratives, regex + string matching is sufficient. The 5% edge cases gracefully degrade to narrator voice, which is acceptable. Using an LLM would add complexity and latency without meaningful benefit.

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

1. **Phase 1: Core Infrastructure**
   - Set up Kokoro-82M Python service (separate process)
   - Create intelligent text analyzer
   - Build character matcher with alias support

2. **Phase 2: Backend Integration**
   - Add audio API endpoints
   - Implement caching layer
   - Update WebSocket to send audio post-synthesis

3. **Phase 3: Frontend Player**
   - Build AudioPlayer.vue component
   - Integrate with App.vue
   - Add playback controls

4. **Phase 4: Character Configuration**
   - Update characters.yaml with audio config
   - Add character name aliases
   - Test detection accuracy

5. **Phase 5: Polish**
   - Add audio settings UI
   - Implement streaming mode (optional)
   - Performance optimization
