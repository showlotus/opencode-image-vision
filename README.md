# opencode-image-vision

[![npm version](https://img.shields.io/npm/v/@showlotus/opencode-image-vision.svg)](https://www.npmjs.com/package/@showlotus/opencode-image-vision)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Server-blue.svg)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)

> MCP server that adds vision capabilities to text-only LLMs in OpenCode by reading pasted images from the session database and analyzing them via a vision model.

---

## The problem

Text-only models like **GLM-5**, **DeepSeek V4**, and **MiniMax** are great for code, but they cannot process images. Every time you paste a screenshot, OpenCode throws:

```
ERROR: Cannot read "clipboard" (this model does not support image input)
```

## The fix

This MCP server reads images directly from OpenCode's **session SQLite database** — where pasted images are stored before the model rejects them — sends each image to a **vision model** (e.g. GLM-4.6V), and returns a text description the text-only model can reason about.

**Result: paste → ask → done.** No file saving, no manual paths.

---

## Features

- 🔍 **Session-based image reading** — Reads pasted images directly from OpenCode's SQLite database, no clipboard access needed
- 🖼️ **Multi-image support** — Analyze multiple images in a single tool call
- 🔌 **Zero API key configuration** — Automatically reads API keys from OpenCode's `account.json`
- 🧩 **Extensible provider architecture** — Currently supports GLM/ZhipuAI; easily extendable to OpenAI, Claude, Qwen, etc.
- 🖥️ **Cross-platform** — Auto-detects OpenCode database path on macOS, Linux, and Windows
- ⚡ **MCP standard** — Works with OpenCode and any MCP-capable client

---

## Requirements

- **Node.js 18+** (ESM support required)
- **pnpm** (`npm install -g pnpm`)
- **OpenCode** with a configured text-only model (e.g. GLM-5, DeepSeek V4)
- A **vision model provider** configured in OpenCode's account (e.g. GLM-4.6V)

---

## Quick start

You can use this MCP server in two ways: **npx** (zero install) or **local clone**.

### Option A: npx (recommended)

No clone or install needed. Just add to your `opencode.jsonc`:

```jsonc
{
  "mcp": {
    "image-vision": {
      "type": "local",
      "command": ["npx", "-y", "@showlotus/opencode-image-vision"],
      "environment": {
        "model": "zhipuai-coding-plan/glm-4.6v",
      },
    },
  },
}
```

npx will automatically download and run the server on first use.

### Option B: Local clone

For development or custom configurations:

```bash
git clone https://github.com/showlotus/opencode-image-vision.git ~/.config/opencode/mcp-servers/opencode-image-vision
cd ~/.config/opencode/mcp-servers/opencode-image-vision
pnpm install
```

Then wire it with the absolute path:

```jsonc
{
  "mcp": {
    "image-vision": {
      "type": "local",
      "command": [
        "node",
        "/Users/YOU/.config/opencode/mcp-servers/opencode-image-vision/src/index.js",
      ],
      "environment": {
        "model": "zhipuai-coding-plan/glm-4.6v",
      },
    },
  },
}
```

> The install location doesn't matter — you'll reference it by absolute path in the config.

### Add AGENTS.md instructions

Add this to your `~/.config/opencode/AGENTS.md` so the AI knows when to use the tool:

```markdown
# Image Recognition

31. When the user pastes an image or needs image analysis, and the current model may not
    support image input, call the image-vision MCP `analyze_images` tool. Pass the current
    session ID (from error messages or context) and the tool will read images from the database
    and return vision model descriptions. Supports analyzing multiple images at once.
32. When encountering "does not support image input" errors, auto-invoke
    `analyze_images` to obtain image descriptions; do not tell the user recognition
    is unsupported.
```

### 4. Restart OpenCode

That's it. Paste an image and ask about it — the AI will automatically call `analyze_images` to get a description.

---

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
                              │  (GLM-4.6V, etc)  │
                              └───────────────────┘
```

1. User pastes an image → OpenCode stores it in the session SQLite database
2. Text-only model rejects the image (`unsupportedParts()`)
3. Model calls the `analyze_images` tool with the current `session_id`
4. Server queries the database for image parts in that session
5. Each image (base64) is sent to the configured vision AI provider
6. Text descriptions are returned to the model

---

## Tool reference

### `analyze_images`

Reads images from an OpenCode session and analyzes them via a vision model.

| Parameter    | Type   | Required | Default    | Description                          |
| ------------ | ------ | -------- | ---------- | ------------------------------------ |
| `session_id` | string | **Yes**  | —          | OpenCode session ID (e.g. `ses_xxx`) |
| `prompt`     | string | No       | _built-in_ | Custom analysis prompt               |
| `limit`      | number | No       | `5`        | Max number of images to analyze      |

**Example output:**

```
Analyzed 2 image(s):

### Image 1: clipboard

This is a GitHub issue page titled "Image Clipboard Paste Not Working in OpenCode"...

---

### Image 2: screenshot.png

The screenshot shows a terminal with the following error message...
```

---

## Configuration

### Environment variables

| Variable    | Required | Default                        | Description                                                                                  |
| ----------- | -------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `model`     | No       | `zhipuai-coding-plan/glm-4.6v` | Vision model in `provider/model` format. API key auto-resolved from OpenCode `account.json`. |
| `prompt`    | No       | _built-in English prompt_      | Default analysis prompt sent to the vision model                                             |
| `timeout`   | No       | `60000`                        | Request timeout in milliseconds                                                              |
| `limit`     | No       | `5`                            | Default max images per analysis                                                              |
| `max_limit` | No       | `20`                           | Hard cap on images per analysis                                                              |

> **No API key needed.** The server reads the API key automatically from OpenCode's `account.json` based on the provider ID in the `model` variable. The database path is auto-detected per OS.

### Advanced example

```jsonc
{
  "mcp": {
    "image-vision": {
      "type": "local",
      "command": ["node", "/path/to/opencode-image-vision/src/index.js"],
      "environment": {
        "model": "zhipuai-coding-plan/glm-4.6v",
        "limit": "10",
        "timeout": "30000",
        "prompt": "Extract all text from this image and describe the UI layout.",
      },
    },
  },
}
```

### Supported providers

**OpenAI-compatible** (reuse `OpenAICompatibleProvider`):

| Provider ID           | Base URL                                                 | Example Models                              |
| --------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `zhipuai-coding-plan` | `https://open.bigmodel.cn/api/paas/v4`                   | `glm-4.6v`                                  |
| `zai-coding-plan`     | `https://open.bigmodel.cn/api/paas/v4`                   | `glm-4.6v`                                  |
| `z-ai`                | `https://open.bigmodel.cn/api/paas/v4`                   | `glm-4.6v`                                  |
| `zhipuai`             | `https://open.bigmodel.cn/api/paas/v4`                   | `glm-4.6v`                                  |
| `moonshot` / `kimi`   | `https://api.moonshot.cn/v1`                             | `moonshot-v1-32k-vision-preview`            |
| `minimax` / `minimax-cn-coding-plan` | `https://api.minimaxi.chat/v1`             | `MiniMax-Text-01`                           |
| `openai`              | `https://api.openai.com/v1`                              | `gpt-4o`, `gpt-4o-mini`                     |
| `qwen` / `dashscope`  | `https://dashscope.aliyuncs.com/compatible-mode/v1`      | `qwen-vl-max`, `qwen-vl-plus`               |
| `doubao` / `volcengine` | `https://ark.cn-beijing.volces.com/api/v3`             | `doubao-vision-pro-32k`                     |
| `yi` / `lingyiwanwu`  | `https://api.lingyiwanwu.com/v1`                         | `yi-vision-v2`                              |
| `gemini` / `google`   | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash`, `gemini-1.5-pro`      |
| `stepfun`             | `https://api.stepfun.com/v1`                             | `step-1v-32k`                               |
| `baichuan`            | `https://api.baichuan-ai.com/v1`                         | `Baichuan4-Vision`                          |
| `hunyuan`             | `https://api.hunyuan.cloud.tencent.com/v1`               | `hunyuan-vision`                            |

**Custom API format**:

| Provider ID           | Base URL                           | Provider Class   | Example Models                           |
| --------------------- | ---------------------------------- | ---------------- | ---------------------------------------- |
| `anthropic` / `claude` | `https://api.anthropic.com/v1`    | `ClaudeProvider` | `claude-3-5-sonnet-20241022`             |

---

## Usage example

```
You: [paste a screenshot of an error]
     "What's wrong with this?"

Model: [calls analyze_images with session_id]
     → "The error in the screenshot says ECONNREFUSED 127.0.0.1:5432.
        PostgreSQL isn't running on port 5432. Start it with: brew services start postgresql"
```

The text-only model never sees pixels — it reads the description returned by the vision model and reasons over it.

---

## Extending with new providers

Most vision model providers use the **OpenAI-compatible chat completions API** — you only need to add 2 registry entries (no code). Only providers with a **different API format** need a custom class.

### Adding an OpenAI-compatible provider (e.g. OpenAI, Qwen, Doubao)

**1. Add base URL** (`src/opencode.js` → `PROVIDER_REGISTRY`):

```javascript
'my-provider': { baseUrl: 'https://api.example.com/v1', format: 'openai' },
```

**2. Add provider mapping** (`src/providers/index.js` → `OPENAI_COMPATIBLE`):

```javascript
'my-provider': OpenAICompatibleProvider,
```

Done. Set `"model": "my-provider/my-vision-model"` in config.

### Adding a custom-format provider (e.g. Anthropic Claude)

**1. Add base URL** (`src/opencode.js` → `PROVIDER_REGISTRY`):

```javascript
'my-provider': { baseUrl: 'https://api.example.com/v1', format: 'custom' },
```

**2. Create a provider class** (`src/providers/my-provider.js`):

```javascript
import { VisionProvider } from './base.js'

export class MyProvider extends VisionProvider {
  async analyze(base64, mime, prompt) {
    // Implement provider-specific API call
  }
}
```

See `src/providers/claude.js` for a working example (Anthropic uses `x-api-key` auth and `/messages` endpoint).

**3. Add provider mapping** (`src/providers/index.js` → `PROVIDER_MAP`):

```javascript
'my-provider': MyProvider,
```

---

## Troubleshooting

<details>
<summary><b>MCP error: Connection closed</b></summary>

The server crashed on startup. Check:

1. Use **absolute path** in the `command` array (not `~` or `$HOME`)
2. Run `node src/index.js` manually to see the error output
3. Ensure `pnpm install` was run in the project directory
</details>

<details>
<summary><b>"Provider not found in account.json"</b></summary>

The provider ID in `model` doesn't match any entry in `~/.local/share/opencode/account.json`. Verify you're signed in to that provider in OpenCode. Run `opencode auth` to check.

</details>

<details>
<summary><b>"OpenCode database not found"</b></summary>

The auto-detection couldn't find the database. Set the `OPENCODE_DB_PATH` environment variable to the full path of your `opencode.db` file.

</details>

<details>
<summary><b>Tools don't appear in OpenCode</b></summary>

Restart OpenCode completely. Check the MCP server status in the right panel — if it shows an error, the server process failed to start.

</details>

---

## Security

- **No API keys in source code.** Keys are read from OpenCode's `account.json` at runtime
- **Read-only database access.** The server opens the SQLite database in `readonly` mode — it never writes or modifies OpenCode data
- **No network listener.** The server runs as a local stdio process — it only talks to the MCP client over stdin/stdout and to the vision API over HTTPS
- **No telemetry.** No analytics, no phone-home

---

## License

MIT — see [LICENSE](LICENSE).
