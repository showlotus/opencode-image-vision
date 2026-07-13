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
      "@showlotus/opencode-image-vision@latest",
      {
        "model": "zhipuai-coding-plan/glm-4.6v"
      }
    ]
  ]
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
| `timeout` | No       | `120000` | Base timeout for vision API (ms); actual timeout scales with image size up to 300s |
| `debug`   | No       | `false`  | Log to `/tmp/iv-debug.log` |

Debug via env: `IMAGE_VISION_DEBUG=1` (optional `IMAGE_VISION_DEBUG_PATH`).

---



## How it works

The plugin hooks into 4 stages of OpenCode's message lifecycle:

1. **`chat.message`** — Fires when a user sends a message. Detects image parts and sets a flag to trigger tool injection.
2. **`chat.params`** — Injects `tool_choice` as a fallback hint (actual tool invocation is driven by the transform hook's text instruction).
3. **`experimental.chat.messages.transform`** — Saves each image to a temp file (`<tmpdir>/iv-images/<hash>.<ext>`) and replaces the image part with a text instruction containing the file path. The model reads the path and calls the tool on its own — no reliance on forced tool injection.
4. **`analyze_image` tool** — Accepts a `file_path` parameter (SDK schema). Reads the image from disk, runs a child session via the OpenCode SDK against the vision model, and returns the description as tool output. Temp files are preserved for re-analysis in follow-up turns.

The active model automatically skips image processing if it already supports vision. Failed images produce `[Analysis failed: reason]` and do not block others. Identical images are cached by MD5 hash — cache hits replace the result directly without triggering the tool.

---

## Troubleshooting

- **Plugin not loading** — Confirm `model` is set; check logs for `[image-vision] init failed`; run `opencode auth`
- **Timeout on large images** — Increase `"timeout": 120000` (or higher)
- **No API key** — Sign in to the vision provider in OpenCode (`opencode auth`)
- **Local dev** — Use `file:///absolute/path`, not symlinks; set `"debug": true` and check `/tmp/iv-debug.log`

---

## License

MIT — see [LICENSE](LICENSE).
