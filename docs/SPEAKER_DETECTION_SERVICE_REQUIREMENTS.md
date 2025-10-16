# Speaker Detection Micro LLM Service Requirements

**Version**: 1.0
**Target**: AI server (192.168.1.95) or integrated with Kokoro service
**Purpose**: Context-aware speaker detection for narrative dialogue using a micro language model

---

## Service Overview

A lightweight Python microservice that uses a tiny language model (Gemma 3 270M or similar) to identify speakers in narrative text. This service handles ambiguous or complex dialogue attribution that regex cannot reliably parse.

---

## Technical Specifications

### Core Requirements

- **Language**: Python 3.10+
- **Framework**: FastAPI (can be integrated with Kokoro service or standalone)
- **Port**: 8002 (if standalone) or add endpoints to Kokoro service (8001)
- **Model**: Gemma 3 270M, Qwen 2.5 0.5B, Phi-3 Mini, or LLaMA 3.2 1B
- **VRAM**: <1GB (can run on CPU if needed)
- **Response Format**: JSON

### Model Selection Criteria

| Model | Size | VRAM | Speed | Strength |
|-------|------|------|-------|----------|
| **Gemma 3 270M** (Recommended) | 270M | ~600MB | Very fast | Modern, efficient |
| Qwen 2.5 0.5B | 500M | ~800MB | Fast | Strong instruction following |
| Phi-3 Mini | 3.8B | ~3GB | Medium | Excellent reasoning |
| LLaMA 3.2 1B | 1B | ~1.5GB | Fast | Reliable, well-tested |

**Recommendation**: Start with **Gemma 3 270M** for minimal resource usage and fast inference.

### Dependencies

```python
# Required packages
fastapi
uvicorn
transformers  # HuggingFace Transformers
torch
accelerate    # For optimized inference
pydantic      # For request/response validation
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
  "model": "gemma-3-270m",
  "version": "1.0",
  "inference_device": "cuda:0"
}
```

---

### 2. Parse Speakers

```http
POST /parse-speakers
Content-Type: application/json
```

**Request Body:**
```json
{
  "narrative": "She glances away. \"I can't help you with that.\"\nNaomi crosses her arms. \"But I can.\"",
  "characters": [
    {
      "id": "amelie",
      "name": "Amélie",
      "aliases": ["Amelie", "the French woman", "the blonde"],
      "description": "French woman with long blonde hair"
    },
    {
      "id": "scarlett",
      "name": "Scarlett",
      "aliases": ["the redhead", "the Irish woman"],
      "description": "Irish woman with red hair"
    },
    {
      "id": "naomi",
      "name": "Naomi",
      "aliases": ["the Black woman"],
      "description": "Black woman, confident demeanor"
    }
  ],
  "context": {
    "currentRoom": "hotel_room_405",
    "recentSpeakers": ["amelie"]
  }
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `narrative` | string | ✅ Yes | Full narrative paragraph with dialogue |
| `characters` | array | ✅ Yes | List of possible speakers in scene |
| `context` | object | No | Additional context (recent speakers, location) |

**Response:**
```json
{
  "success": true,
  "segments": [
    {
      "text": "I can't help you with that.",
      "speaker": "amelie",
      "confidence": 0.92,
      "reasoning": "Context suggests 'she' refers to Amélie based on recent speaker history"
    },
    {
      "text": "But I can.",
      "speaker": "naomi",
      "confidence": 0.98,
      "reasoning": "Explicit name 'Naomi' mentioned before quote"
    }
  ],
  "processing_time_ms": 87
}
```

**When unable to determine speaker:**
```json
{
  "text": "Mysterious voice speaks.",
  "speaker": "narrator",
  "confidence": 0.3,
  "reasoning": "Unable to attribute to any character; defaulting to narrator"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Model inference failed",
  "error_code": "INFERENCE_ERROR"
}
```

---

## Prompt Engineering

### System Prompt Template

```python
SYSTEM_PROMPT = """You are a dialogue attribution expert for narrative text.

Your task: Given a narrative paragraph and a list of characters present in the scene, identify who speaks each quoted line.

Rules:
1. Only attribute dialogue to characters in the provided character list
2. Use contextual clues (pronouns, descriptions, actions) to infer speakers
3. Match aliases (e.g., "the redhead" → "Scarlett")
4. If uncertain, set speaker to "narrator" with low confidence
5. Respond ONLY with valid JSON - no additional text

Output format:
{
  "segments": [
    {
      "text": "quoted dialogue text",
      "speaker": "character_id",
      "confidence": 0.0-1.0,
      "reasoning": "brief explanation"
    }
  ]
}"""
```

### User Prompt Template

```python
def build_user_prompt(narrative: str, characters: list, context: dict) -> str:
    char_list = "\n".join([
        f"- {c['id']} ({c['name']}): {c['description']}"
        f"  Aliases: {', '.join(c.get('aliases', []))}"
        for c in characters
    ])

    recent = context.get('recentSpeakers', [])
    recent_info = f"\nRecent speakers: {', '.join(recent)}" if recent else ""

    return f"""Characters in scene:
{char_list}{recent_info}

Narrative paragraph:
{narrative}

Identify the speaker of each quoted line. Output JSON only."""
```

---

## Implementation Guidelines

### 1. Model Loading

```python
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

class SpeakerDetector:
    def __init__(self, model_name: str = "google/gemma-3-270m"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        # Load model with optimization
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            device_map="auto",
            low_cpu_mem_usage=True
        )

        self.model.eval()  # Inference mode
```

### 2. Inference

```python
def parse_speakers(self, narrative: str, characters: list, context: dict = None):
    # Build prompt
    prompt = build_user_prompt(narrative, characters, context or {})
    full_prompt = f"{SYSTEM_PROMPT}\n\n{prompt}"

    # Tokenize
    inputs = self.tokenizer(full_prompt, return_tensors="pt").to(self.device)

    # Generate
    with torch.no_grad():
        outputs = self.model.generate(
            **inputs,
            max_new_tokens=512,
            temperature=0.3,  # Low temp for consistency
            do_sample=True,
            top_p=0.9,
            pad_token_id=self.tokenizer.eos_token_id
        )

    # Decode
    response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)

    # Extract JSON from response
    json_match = re.search(r'\{.*\}', response, re.DOTALL)
    if json_match:
        return json.loads(json_match.group(0))
    else:
        raise ValueError("Model did not return valid JSON")
```

### 3. Optimization

**Use KV-caching** for faster generation:
```python
self.model.generate(
    **inputs,
    use_cache=True,  # Reuse key-value cache
    # ... other params
)
```

**Batch processing** (if multiple narratives):
```python
# Process multiple narratives in one batch
inputs = self.tokenizer(prompts, return_tensors="pt", padding=True)
outputs = self.model.generate(**inputs)
```

**Quantization** (optional, for even smaller VRAM):
```python
from transformers import BitsAndBytesConfig

quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.float16
)

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    quantization_config=quantization_config,
    device_map="auto"
)
```

---

## Integration Options

### Option 1: Standalone Service (Recommended for Flexibility)

```python
# Separate service on port 8002
# speaker_detection_service.py

from fastapi import FastAPI
app = FastAPI()

detector = SpeakerDetector()

@app.post("/parse-speakers")
async def parse_speakers(request: ParseRequest):
    result = detector.parse_speakers(
        request.narrative,
        request.characters,
        request.context
    )
    return result
```

**Run:**
```bash
uvicorn speaker_detection_service:app --host 0.0.0.0 --port 8002
```

### Option 2: Integrated with Kokoro Service (Recommended for Simplicity)

```python
# Add to kokoro_service.py

from speaker_detector import SpeakerDetector

app = FastAPI()
tts_service = KokoroTTS()
speaker_detector = SpeakerDetector()

@app.post("/synthesize")
async def synthesize(request):
    # TTS endpoint (existing)
    pass

@app.post("/parse-speakers")
async def parse_speakers(request):
    # New speaker detection endpoint
    result = speaker_detector.parse_speakers(
        request.narrative,
        request.characters,
        request.context
    )
    return result
```

**Advantage**: Single service to manage, shared GPU resources

### Option 3: Node.js In-Process (Alternative)

Use **transformers.js** to run the model directly in Node.js:

```typescript
// src/audio/speaker-detector.ts
import { pipeline } from '@xenova/transformers';

class SpeakerDetector {
  private model: any;

  async init() {
    this.model = await pipeline(
      'text-generation',
      'onnx-community/gemma-3-270m'
    );
  }

  async parseS speakers(narrative: string, characters: Character[]) {
    const prompt = this.buildPrompt(narrative, characters);
    const result = await this.model(prompt, {
      max_new_tokens: 512,
      temperature: 0.3
    });
    return this.parseJSON(result[0].generated_text);
  }
}
```

**Advantage**: No separate service needed
**Disadvantage**: Slower inference, higher Node.js memory usage

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Inference latency | <100ms | On GPU with Gemma 3 270M |
| Model load time | <5s | At service startup |
| VRAM usage | <1GB | For Gemma 3 270M |
| CPU fallback latency | <500ms | Still acceptable |

---

## Testing & Validation

### Manual Testing

```bash
# Health check
curl http://192.168.1.95:8002/health

# Parse speakers (simple case)
curl -X POST http://192.168.1.95:8002/parse-speakers \
  -H "Content-Type: application/json" \
  -d '{
    "narrative": "\"Hello,\" Amélie says with a smile.",
    "characters": [
      {"id": "amelie", "name": "Amélie", "aliases": [], "description": "French woman"}
    ]
  }'

# Parse speakers (ambiguous case)
curl -X POST http://192.168.1.95:8002/parse-speakers \
  -H "Content-Type: application/json" \
  -d '{
    "narrative": "She glances away. \"I cannot help you.\"",
    "characters": [
      {"id": "amelie", "name": "Amélie", "aliases": ["she"], "description": "French woman"}
    ],
    "context": {
      "recentSpeakers": ["amelie"]
    }
  }'
```

### Accuracy Testing

Create test cases covering:
1. **Explicit attribution**: "Hello," Amélie says.
2. **Pronoun resolution**: She says, "Hello." (with context)
3. **Contextual reference**: The redhead laughs. "Hello."
4. **Multiple speakers**: Complex paragraphs with multiple characters
5. **Edge cases**: Ambiguous or unclear attribution

**Success criteria**: >95% accuracy on explicit cases, >80% on ambiguous cases

---

## Deployment

### Docker (Recommended)

```dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY speaker_detection_service.py .

# Download model at build time (optional)
RUN python -c "from transformers import AutoModel; AutoModel.from_pretrained('google/gemma-3-270m')"

EXPOSE 8002

CMD ["uvicorn", "speaker_detection_service:app", "--host", "0.0.0.0", "--port", "8002"]
```

### Systemd Service

```ini
[Unit]
Description=Speaker Detection Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/service
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/uvicorn speaker_detection_service:app --host 0.0.0.0 --port 8002
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## Integration with Narrative Engine

The Node.js Narrative Engine will use this service for all speaker detection:

```typescript
// src/audio/text-analyzer.ts

async detectSpeakers(narrative: string, characters: Character[]): Promise<AudioSegment[]> {
  // Call Gemma 3 micro LLM for speaker detection
  const result = await axios.post('http://192.168.1.95:8002/parse-speakers', {
    narrative,
    characters: this.formatCharactersForLLM(characters),
    context: this.getRecentContext()
  });

  // Fallback to narrator for low-confidence segments
  return result.data.segments.map(segment => {
    if (segment.confidence < 0.5) {
      return { ...segment, speaker: 'narrator' };
    }
    return segment;
  });
}
```

---

## Configuration

### Model Selection

Add to game configuration:

```yaml
# games/lovebug/game.yaml

audio:
  enabled: true
  provider: "kokoro"

  speakerDetection:
    provider: "micro-llm"
    serviceUrl: "http://192.168.1.95:8002"
    model: "gemma-3-270m"
    narratorFallbackThreshold: 0.5  # Low confidence → narrator
    timeout: 200  # ms
```

---

## Monitoring & Debugging

### Logging

Log each inference with:
- Input narrative
- Detected speakers
- Confidence scores
- Processing time
- Any low-confidence segments requiring narrator fallback

This helps debug attribution errors.

### Metrics

Track:
- **Average confidence**: Overall detection confidence
- **Narrator fallback rate**: % of segments with confidence <0.5
- **Latency**: p50, p95, p99 for inference
- **Accuracy**: Manual review of sample outputs

---

## Alternative: CPU-Only Inference

If GPU is unavailable, the service can run on CPU:

```python
# Force CPU inference
device = "cpu"
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float32,  # Full precision for CPU
    device_map="cpu"
)
```

**Expected latency on CPU**: 200-500ms (still acceptable given 40-120s narrative generation)

---

## Success Criteria

The service is considered complete when:

- ✅ Model loads successfully and responds to `/health`
- ✅ Can parse explicit speaker attribution with >95% accuracy
- ✅ Can resolve pronouns using context with >80% accuracy
- ✅ Handles ambiguous cases gracefully (fallback to narrator)
- ✅ Latency <100ms on GPU (or <500ms on CPU)
- ✅ Integrates seamlessly with Narrative Engine text analyzer
- ✅ Provides confidence scores for decision-making
- ✅ Handles edge cases without crashing

---

## Questions for Implementation

1. **Model choice**: Gemma 3 270M or prefer another micro model?
2. **Integration**: Standalone service (8002) or integrate with Kokoro (8001)?
3. **GPU sharing**: Will this share GPU with Kokoro TTS?
4. **Quantization**: Use 4-bit quantization to reduce VRAM further?
5. **Testing data**: Do you have sample narratives I can use for testing?
