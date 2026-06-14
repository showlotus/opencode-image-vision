# opencode-image-vision

> MCP server that reads images from OpenCode's SQLite database and analyzes them via vision AI providers (GLM-4.6V and more).

## How it works

```
┌──────────┐    tool call     ┌───────────────────┐    SQL query    ┌────────────┐
│ OpenCode │ ───────────────> │ opencode-image-   │ ──────────────> │ SQLite DB  │
│  (MCP    │ <─────────────   │ vision (MCP)       │ <────────────── │ (images)   │
│  client) │    text result   └────────┬──────────┘    base64 rows  └────────────┘
└──────────┘                           │
                                       │ POST base64 image
                                       ▼
                              ┌───────────────────┐
                              │  Vision AI API    │
                              │  (GLM / OpenAI /  │
                              │   Claude / Qwen)  │
                              └───────────────────┘
```

1. OpenCode calls the `analyze_images` tool with a `session_id`
2. The server queries OpenCode's SQLite database for images in that session
3. Each image (base64) is sent to the configured vision AI provider
4. Text descriptions are returned to OpenCode

## Installation

```bash
git clone https://github.com/YOUR_USER/opencode-image-vision.git
cd opencode-image-vision
npm install
```

## Configuration

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GLM_API_KEY` | Yes (for GLM) | — | ZhipuAI / GLM API key |
| `GLM_BASE_URL` | No | `https://open.bigmodel.cn/api/paas/v4` | GLM API base URL |
| `GLM_VISION_MODEL` | No | `glm-4.6v` | GLM vision model name |
| `VISION_PROVIDER` | No | `glm` | Provider type: `glm` (extensible) |
| `OPENCODE_DB_PATH` | No | `~/.local/share/opencode/opencode.db` | Path to OpenCode SQLite DB |

### config.json (optional)

Copy `config.example.json` to `config.json` and fill in your credentials:

```json
{
  "provider": "glm",
  "glm": {
    "apiKey": "your-glm-api-key",
    "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
    "model": "glm-4.6v"
  }
}
```

## OpenCode config

Add to your `opencode.jsonc`:

```jsonc
{
  "mcp": {
    "image-vision": {
      "command": "node",
      "args": ["/path/to/opencode-image-vision/src/index.js"],
      "env": {
        "GLM_API_KEY": "${GLM_API_KEY}"
      }
    }
  }
}
```

## AGENTS.md instructions

Add this to your project's `AGENTS.md` to guide the AI when to use the tool:

```markdown
# Image Recognition
31. When the user pastes an image or needs image analysis, and the current model may not
    support image input, call the image-vision MCP `analyze_images` tool. Pass the current
    session ID (from error messages or context) and the tool will read images from the database
    and return GLM-4.6V vision descriptions. Supports analyzing multiple images at once.
32. When encountering "does not support image input" errors, auto-invoke
    `analyze_images` to obtain image descriptions; do not tell the user recognition
    is unsupported.
```

## Extending with new providers

1. Create a new file in `src/providers/`, e.g. `openai.js`:

```javascript
import { VisionProvider } from './base.js'

export class OpenAIProvider extends VisionProvider {
  constructor(config) {
    super(config)
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY
  }

  async analyze(base64, mime, prompt) {
    // Implement OpenAI vision API call here
  }
}
```

2. Register it in `src/providers/index.js`:

```javascript
import { OpenAIProvider } from './openai.js'

const PROVIDERS = {
  glm: GLMProvider,
  openai: OpenAIProvider,
}
```

3. Set `VISION_PROVIDER=openai` and configure the corresponding env vars.

Providers can be added for: OpenAI (GPT-4V), Anthropic (Claude), Qwen (Tongyi), etc.

## License

MIT
