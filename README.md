# opencode-image-vision

[![npm version](https://img.shields.io/npm/v/@showlotus/opencode-image-vision.svg)](https://www.npmjs.com/package/@showlotus/opencode-image-vision)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

OpenCode plugin that gives **text-only models** (GLM-5, DeepSeek V4, MiniMax, etc.) the ability to understand pasted images. Images are analyzed by a vision model in the background and replaced with text descriptions before the chat model runs — **paste → ask → done**.

Requires OpenCode 1.14+, Node 18+, and a signed-in vision provider (e.g. `glm-4.6v`).

---

## Install

Add to `~/.config/opencode/opencode.json` (or `opencode.jsonc`):

```jsonc
{
  "plugin": [
    [
      "@showlotus/opencode-image-vision",
      {
        "model": "zhipuai-coding-plan/glm-4.6v",
        "timeout": 120000,
      },
    ],
  ],
}
```

**`model` is required** (`providerId/modelId`). API keys are read from OpenCode's `auth.json` — no extra key setup.

For local development, use a `file://` absolute path (symlinks in `plugins/` are skipped):

```jsonc
["file:///Users/YOU/path/to/opencode-image-vision", { "model": "zhipuai-coding-plan/glm-4.6v" }]
```

Restart OpenCode, paste an image, and ask about it.

---

## Options

| Option    | Required | Default  | Description |
| --------- | -------- | -------- | ----------- |
| `model`   | Yes      | —        | Vision model, e.g. `zhipuai-coding-plan/glm-4.6v` |
| `prompt`  | No       | built-in | Analysis prompt |
| `timeout` | No       | `120000` | Vision API timeout (ms) |
| `debug`   | No       | `false`  | Log to `/tmp/iv-debug.log` |

Debug via env: `IMAGE_VISION_DEBUG=1` (optional `IMAGE_VISION_DEBUG_PATH`).

See [config.example.json](config.example.json) for more examples.

---

## How it works

On each message, the `experimental.chat.messages.transform` hook:

1. Scans **only the current user message** for image parts
2. Skips if the chat model already supports image input
3. Calls the vision API and replaces each image with `[图片识别结果]\n…` text

Failed images become `[图片识别失败: reason]` and do not block others. Identical images are cached by MD5.

---

## Providers

Any provider registered in `src/opencode.js` works. Common examples:

| Provider ID | Example model |
| ----------- | ------------- |
| `zhipuai-coding-plan` | `glm-4.6v` |
| `openai` | `gpt-4o` |
| `qwen` / `dashscope` | `qwen-vl-max` |
| `anthropic` / `claude` | `claude-3-5-sonnet-20241022` |

Base URLs are resolved from OpenCode at runtime when available. To add a provider, update `PROVIDER_REGISTRY` and `PROVIDER_MAP` in `src/opencode.js` and `src/providers/index.js`.

---

## Troubleshooting

- **Plugin not loading** — Confirm `model` is set; check logs for `[image-vision] 初始化失败`; run `opencode auth`
- **Timeout on large images** — Increase `"timeout": 120000` (or higher)
- **No API key** — Sign in to the vision provider in OpenCode (`opencode auth`)
- **Local dev** — Use `file:///absolute/path`, not symlinks; set `"debug": true` and check `/tmp/iv-debug.log`

---

## License

MIT — see [LICENSE](LICENSE).
