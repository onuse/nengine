# Creative Set Integration Guide

Quick reference for integrating with the **creative** working set for game/roleplay servers.

## Connection Info

```python
BASE_URL = "http://192.168.1.95:8000/v1"
ADMIN_URL = "http://192.168.1.95:8000/admin"
```

No API key required.

## Available Models

| Model | Purpose | Quantization |
|-------|---------|--------------|
| `llama-3.3-70b-abliterated` | Creative text generation, roleplay, storytelling | Q5_K_M (47GB) |
| `flux-unchained:12b` | Uncensored image generation | Q8_0 (12GB) |

**Note**: Both models are uncensored/abliterated - no content restrictions.

## Working Set Switching

The creative set must be active before use. Only one working set can run at a time.

### Check Current Set

```python
import requests

response = requests.get(f"{ADMIN_URL}/sets")
current = response.json()["current"]
print(f"Active set: {current}")
```

### Switch to Creative

```python
if current != "creative":
    response = requests.post(
        f"{ADMIN_URL}/sets/switch",
        json={"target_set": "creative"}
    )
    # Models take 30-60 seconds to load
    time.sleep(60)
```

## Text Generation

OpenAI-compatible chat completions API:

```python
response = requests.post(
    f"{BASE_URL}/chat/completions",
    json={
        "model": "llama-3.3-70b-abliterated",
        "messages": [
            {"role": "system", "content": "You are a fantasy game master."},
            {"role": "user", "content": "Describe a mysterious tavern."}
        ],
        "temperature": 0.9,  # Higher = more creative
        "max_tokens": 500
    }
)

text = response.json()["choices"][0]["message"]["content"]
```

### Recommended Parameters

| Parameter | Roleplay | Storytelling | Dialogue |
|-----------|----------|--------------|----------|
| temperature | 0.9 | 0.8-0.9 | 0.7-0.8 |
| top_p | 0.95 | 0.9 | 0.9 |
| max_tokens | 200-500 | 500-1000 | 100-200 |

## Image Generation

OpenAI-compatible image generation API:

```python
response = requests.post(
    f"{BASE_URL}/images/generations",
    json={
        "model": "flux-unchained:12b",
        "prompt": "a mysterious tavern interior, fantasy art, warm lighting",
        "size": "512x512",  # 512x512, 768x768, 1024x1024
        "n": 1  # Number of images (1-4)
    }
)

# Image is returned as base64
import base64
image_b64 = response.json()["data"][0]["b64_json"]
image_bytes = base64.b64decode(image_b64)

with open("tavern.png", "wb") as f:
    f.write(image_bytes)
```

### Advanced Parameters

```python
{
    "model": "flux-unchained:12b",
    "prompt": "your prompt here",
    "negative_prompt": "blurry, low quality, deformed",  # Optional
    "size": "512x512",
    "steps": 20,  # 15-30, higher = better quality
    "cfg_scale": 1.0,  # 1.0-2.0 for FLUX
    "seed": 42  # Optional, for reproducibility
}
```

## Using OpenAI Python SDK

The API is fully compatible with the official OpenAI library:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://192.168.1.95:8000/v1",
    api_key="not-needed"
)

# Text generation
response = client.chat.completions.create(
    model="llama-3.3-70b-abliterated",
    messages=[{"role": "user", "content": "Tell me a story."}]
)
print(response.choices[0].message.content)

# Image generation
response = client.images.generate(
    model="flux-unchained:12b",
    prompt="fantasy castle",
    size="512x512"
)
print(response.data[0].b64_json)
```

## Performance Expectations

### Text Generation
- Prompt processing: ~53ms/token
- Generation: ~114ms/token (8-9 tokens/sec)
- 200 token response: ~23 seconds
- 500 token response: ~57 seconds

### Image Generation
- 512x512 @ 20 steps: ~30-45 seconds
- 768x768 @ 20 steps: ~60-90 seconds
- 1024x1024 @ 20 steps: ~120-180 seconds

## Error Handling

### Wrong Working Set Active

```python
# Error: "No chat model available in current working set"
# Solution: Switch to creative set first

response = requests.post(
    f"{ADMIN_URL}/sets/switch",
    json={"target_set": "creative"}
)
time.sleep(60)
```

### Service Unavailable

```python
# Check health endpoint
response = requests.get("http://192.168.1.95:8000/health")
if response.json()["status"] != "healthy":
    print("Server issue - check with admin")
```

## Example Integration

```python
class CreativeAI:
    """Simple client for creative AI services"""

    def __init__(self):
        self.base_url = "http://192.168.1.95:8000/v1"
        self.admin_url = "http://192.168.1.95:8000/admin"
        self._ensure_creative_set()

    def _ensure_creative_set(self):
        """Switch to creative set if needed"""
        response = requests.get(f"{self.admin_url}/sets")
        if response.json()["current"] != "creative":
            requests.post(
                f"{self.admin_url}/sets/switch",
                json={"target_set": "creative"}
            )
            time.sleep(60)

    def generate_text(self, prompt: str, system: str = None, **kwargs) -> str:
        """Generate creative text"""
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        response = requests.post(
            f"{self.base_url}/chat/completions",
            json={
                "model": "llama-3.3-70b-abliterated",
                "messages": messages,
                "temperature": kwargs.get("temperature", 0.9),
                "max_tokens": kwargs.get("max_tokens", 500)
            }
        )
        return response.json()["choices"][0]["message"]["content"]

    def generate_image(self, prompt: str, **kwargs) -> bytes:
        """Generate image and return bytes"""
        response = requests.post(
            f"{self.base_url}/images/generations",
            json={
                "model": "flux-unchained:12b",
                "prompt": prompt,
                "size": kwargs.get("size", "512x512"),
                "steps": kwargs.get("steps", 20)
            }
        )
        b64_data = response.json()["data"][0]["b64_json"]
        return base64.b64decode(b64_data)

# Usage
ai = CreativeAI()

# Generate NPC dialogue
dialogue = ai.generate_text(
    "What would you say to a stranger?",
    system="You are a grumpy tavern keeper."
)

# Generate character portrait
portrait = ai.generate_image("grumpy tavern keeper, fantasy art")
with open("tavern_keeper.png", "wb") as f:
    f.write(portrait)
```

## Limits and Constraints

- **Memory**: Creative set uses 76GB / 128GB (52GB free)
- **Concurrent requests**: Server handles 4 parallel requests
- **Context window**: 32K tokens for text generation
- **Max tokens**: No hard limit, but generation slows for 1000+ tokens
- **Image dimensions**: Multiples of 64 recommended (512, 768, 1024)

## Troubleshooting

**Text generation is slow**
- Normal: 8-9 tokens/sec is expected for 70B model
- Check: Server isn't handling multiple simultaneous requests

**Image generation fails**
- Check: Creative set is active (not STINA set)
- Check: Prompt doesn't have special characters causing JSON errors
- Try: Simpler prompt or lower resolution

**Connection refused**
- Check: Server is reachable at 192.168.1.95:8000
- Check: Firewall allows port 8000

**Wrong working set**
- Use admin API to switch: `POST /admin/sets/switch`
- Wait 60 seconds for models to load

## Support

For issues, check server logs:
```bash
sudo journalctl -u model-router -f
sudo journalctl -u llama-server-llama33 -f
sudo journalctl -u sd-server -f
```

Or check the main [README.md](README.md) for full documentation.
