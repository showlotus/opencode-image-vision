# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

`@showlotus/opencode-image-vision` 为 OpenCode 中的纯文本大模型（GLM-5、DeepSeek V4、MiniMax 等不支持图像的模型）补充视觉能力。通过插件钩子拦截粘贴的图像，发送给视觉模型（如 GLM-4.6V）分析，将识别结果以文本形式注入对话。

技术栈：纯 JavaScript（无 TypeScript）、ESM（`"type": "module"`）、Node 18+。**无构建步骤、无测试、无 lint 配置** —— 源码即发布物。

## 架构

入口 [plugin/index.js](plugin/index.js)（`package.json` 的 `exports`）。利用生命周期钩子透明拦截图像，用户无需显式调用工具。**配置来自插件 `options`**。

唯一钩子：
- `experimental.chat.messages.transform`（[plugin/transform.js](plugin/transform.js)）：发送消息前直接用视觉 provider 识别图像 part，并把图像 part 原地替换成识别结果文本。无需模型主动调用任何工具，识别结果自动注入对话。单张失败转为 `[图片识别失败: 原因]` 文本，不中断其余图片；按图像 base64 的 MD5 哈希去重缓存。

所有识别路径最终汇聚到 `provider.analyze(base64, mime, prompt)`。

## 常用命令

包管理工具为 **pnpm**（固定 `pnpm@8.11.0`）。

```bash
pnpm install   # 安装依赖
```

package.json 中**没有** build/test/lint 脚本。发布通过 GitHub Actions 手动触发（[.github/workflows/publish.yml](.github/workflows/publish.yml)，`workflow_dispatch` → `pnpm publish --access public --no-git-checks`）。

## 核心模块

- **Provider 体系**：[src/providers/base.js](src/providers/base.js) 抽象基类 `VisionProvider`；两个实现 —— `OpenAICompatibleProvider`（`/chat/completions`，覆盖 20+ 提供商）和 `ClaudeProvider`（`/messages`，Anthropic 专有格式）。均用 `fetch` + `AbortController` 控制超时。
- **配置解析**：[src/opencode.js](src/opencode.js) 从 `~/.local/share/opencode/` 自动读取 API 密钥（优先 `auth.json`，回退 `account.json`）—— **项目源码中不存任何密钥**。插件模式还通过 SDK 动态读取 provider 端点与模型能力。
- **共享工具**：[shared/](shared/) 下 `image-utils.js`、`model-detect.js`、`cache.js`（MD5 去重缓存）、`toast.js`、`debug.js`。

## 扩展：添加视觉提供商

OpenAI 兼容的提供商需**同时更新两处映射**：
1. `PROVIDER_REGISTRY`（[src/opencode.js](src/opencode.js)）—— 添加 `providerId → { baseUrl, format }`。
2. `PROVIDER_MAP`（[src/providers/index.js](src/providers/index.js)）—— 添加 `providerId → 类`。

非标准 API 格式需继承 `VisionProvider` 实现新类。

## 关键约定

- **`model` 格式**：插件选项 `model` 必填，格式为 `providerId/modelId`，按 `/` 拆分决定一切。
- **单图容错**：一张图分析失败不会中断其余图像，错误转为 `[图片识别失败: 原因]` 文本。
- **MD5 缓存**：按图像 base64 哈希去重，避免重复分析。
- **当前轮次**：transform 只处理最后一条 user 消息中的图片，避免多轮对话重复识别。
- **启动死锁**：`plugin/index.js` 的 `server()` 不得在初始化时 await opencode client，所有 client 调用延迟到钩子触发时。
