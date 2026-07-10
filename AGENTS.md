# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-10
**Commit:** `12dbdc5`
**Branch:** `master`

## OVERVIEW

OpenCode 插件，为纯文本 LLM（GLM-5、DeepSeek V4 等）添加图片视觉能力。粘贴图片经视觉模型分析后替换为文本描述，再交给文本模型。纯 JavaScript ESM，零运行时依赖。

## STRUCTURE

```
opencode-image-vision/
├── plugin/             # 插件入口 + 4 阶段 hook 注册（详见 plugin/AGENTS.md）
│   ├── index.js        # 唯一公共入口，server 函数返回 hooks
│   ├── transform.js    # experimental.chat.messages.transform
│   └── analyze-image.js# analyze_image 工具
├── shared/             # 纯工具函数，零框架依赖
│   ├── cache.js        # Map 包装，MD5→描述缓存
│   ├── debug.js        # appendFileSync 日志，惰性求值零开销
│   ├── image-utils.js  # 图片检测 / base64 提取 / 超时计算
│   ├── model-detect.js # 文本模型黑名单 + modelId 提取
│   ├── opencode.js     # SDK 封装（providers 查询 + 能力检测）
│   └── temp-file.js    # base64→磁盘写入 tmpdir/iv-images/
├── demo/demo.png       # 演示截图
├── package.json        # exports 三路别名均指向 plugin/index.js
└── .github/workflows/publish.yml  # 手动触发 npm 发布
```

## WHERE TO LOOK

| 任务 | 位置 | 备注 |
|------|------|------|
| 新增/修改 hook | `plugin/index.js:42-68` | server 返回的 hook 映射对象 |
| 图片替换逻辑 | `plugin/transform.js:56-79` | base64→临时文件→指令文本 |
| 工具执行逻辑 | `plugin/analyze-image.js:23-102` | readFileSync→子 session→vision model |
| 添加新的不支持的模型 | `shared/model-detect.js:1-9` | `DEFAULT_UNSUPPORTED_MODELS` 数组 |
| 调试开关 | `shared/debug.js:6-12` | 环境变量 `IMAGE_VISION_DEBUG=1` |
| 临时文件路径 | `shared/temp-file.js:5` | `join(tmpdir(), 'iv-images')` |
| 超时策略调整 | `shared/image-utils.js:20-23` | 每 0.5MB +20s，上限 300s |
| 用户配置选项 | `plugin/index.js:19` | options: model（必填）/ prompt / timeout / debug |
| 已知限制与后续计划 | `TODO.md` | P0 spinner / P1 高亮丢失 / P2 toolChoice |

## CODE MAP

| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| `server` | function | `plugin/index.js:16` | 入口 | 校验配置，创建 cache/state，返回 4 hooks |
| `createTransformHook` | function | `plugin/transform.js:14` | 1 (index.js:57) | 图片→临时文件→指令文本替换 |
| `createAnalyzeImageTool` | function | `plugin/analyze-image.js:15` | 1 (index.js:62) | 工具工厂：读盘→子 session→视觉模型 |
| `saveImageToTempDir` | function | `shared/temp-file.js:16` | 1 (transform.js:69) | base64 写入 `tmpdir/iv-images/<hash>.<ext>` |
| `fetchOpencodeProviders` | function | `shared/opencode.js:5` | 1 (index.js:32) | SDK providers 查询，带 5s 超时兜底 |
| `modelSupportsImage` | function | `shared/opencode.js:21` | 1 (transform.js:46) | 检查 capabilities.input.image |
| `isUnsupportedModel` | function | `shared/model-detect.js:11` | 1 (transform.js:42) | 快速黑名单匹配，零 IPC |
| `extractModelFromMessages` | function | `shared/model-detect.js:17` | 1 (transform.js:21) | 从 message.info 提取 modelId |
| `isImagePart` | function | `shared/image-utils.js:5` | 2 (index.js:44, transform.js:36) | `type==='file' && mime.startsWith('image/')` |
| `extractBase64` | function | `shared/image-utils.js:9` | 1 (transform.js:58) | 从 data URL 提取 base64 |
| `computeTimeoutBySize` | function | `shared/image-utils.js:20` | 1 (analyze-image.js:57) | 动态超时，120s 基础 + 每 0.5MB 20s |
| `createCache` | function | `shared/cache.js:1` | 1 (index.js:28) | Map 包装，内存级，重启丢失 |
| `dbg` | function | `shared/debug.js:17` | 4+ | 惰性求值日志，关闭时零开销 |
| `setDebug` | function | `shared/debug.js:10` | 1 (index.js:18) | 环境变量优先级最高 |
| `DEFAULT_UNSUPPORTED_MODELS` | const | `shared/model-detect.js:1` | 1 | GLM-5/5.2, DeepSeek-V4, MiniMax 等 |

## CONVENTIONS

- **模块系统**：ESM（`"type": "module"`），全部 `import/export`，无 CJS
- **文件命名**：kebab-case（`temp-file.js`、`model-detect.js`）
- **函数命名**：camelCase，动词前缀（`create*`、`is*`、`extract*`、`fetch*`）
- **导出**：`shared/` 全部具名导出；仅 `plugin/index.js` 用 `export default`
- **异步**：`async/await` 为主，无裸 `.then()`
- **注释**：中文函数级注释，字母数字与中文间空格分隔，无装饰字符
- **缩进**：2 空格，`editor.formatOnSave: false`
- **提交**：Conventional commits（`feat:` / `fix:` / `refactor:` / `perf:` / `docs:`）
- **错误处理**：内部 try-catch 兜底 + `dbg()` + `console.error('[image-vision] ...')`，绝不崩溃

## ANTI-PATTERNS (THIS PROJECT)

- **禁止新增运行时依赖** — `package.json` dependencies 保持 `{}`，仅 peerDep `@opencode-ai/plugin`；用 `node:` 内置模块
- **禁止用 zod 直接 import** — 参数 schema 必须用 SDK 的 `tool.schema.string()`（`analyze-image.js:21`），版本兼容
- **禁止自动 commit / format / 加注释** — 除非用户显式要求
- **禁止删除临时文件** — OS `/tmp` 兜底清理，保留以支持多轮 re-analysis
- **禁止修改 `computeTimeoutBySize` 调用** — 超时策略已校准（`diagnose-input-lag`）
- **禁止改 toolChoice 注入** — `chat.params` 作为 fallback 保留（`temp-file-strategy`）
- **禁止改 SDK 子会话流程** — `session.create`→`prompt`→`abort`→`delete` 四步不可变
- **`dbg()` 参数须用箭头函数** — `dbg(() => ({...}))`，关闭时不构造对象，避免 `Object.keys` 等计算开销
- **同步 I/O 已知热点**（性能关注项，非禁止）：`readFileSync`(analyze-image:35)、`writeFileSync`(temp-file:20)、`mkdirSync`(temp-file:17)、`appendFileSync`(debug:21) — 常规路径应避免，工具执行路径可接受

## UNIQUE STYLES

- **惰性调试日志**：`dbg()` 接受对象或函数；函数形式仅在开关开启时求值，避免关闭时仍构造参数对象（`debug.js:17-19`）
- **双级模型门控**：先快速匹配黑名单（零 IPC），未知模型才查 SDK providers（`transform.js:42-49`）
- **递归防护**：`modelId === visionModel.modelID` 时直接 return，防止视觉模型自身触发 transform（`transform.js:24`）
- **file_path 指令注入**：图片替换为带真实路径的中文指令文本，引导模型自发调用工具（`transform.js:75-78`）

## COMMANDS

```bash
# 安装依赖
pnpm install

# 本地开发：在 ~/.config/opencode/opencode.json 中配置
# ["file:///absolute/path/to/opencode-image-vision", { "model": "zhipuai-coding-plan/glm-4.6v" }]
# 修改后重启 OpenCode 即可生效，无构建步骤

# 调试
IMAGE_VISION_DEBUG=1  # 日志写入 /tmp/iv-debug.log

# 发布（GitHub Actions 手动触发，或本地）
pnpm publish --access public --no-git-checks
```

> 无 `build` / `test` / `lint` / `typecheck` 脚本。源码即发布物。

## NOTES

- **无测试** — 零测试文件、零测试框架、零 CI 测试步骤。验证靠手动粘贴图片。
- **无 TypeScript** — 纯 JS，无 tsconfig，无类型检查。deno LSP 已安装但非项目配置。
- **state 跨 hook 共享** — `plugin/index.js:34-38` 的 `state` 对象被 4 个 hook 读写，当前顺序调用无竞态，但无锁保护。
- **缓存仅内存** — MD5→描述映射存 Map，重启丢失。hash 基于 base64 字符串（非原始字节），截断 16 字符。
- **图片格式** — 仅支持 png/jpg/jpeg/gif/webp/bmp/svg（`temp-file.js:7-14`），不支持 avif/tiff/ico。
- **临时文件含明文图片数据** — 写入 `os.tmpdir()/iv-images/`，macOS `/tmp` 通常 777 权限，同机其他进程可读。
- **`config.example.json` 缺失** — README 引用但文件不存在。
- **`.omo/`、`.codegraph/`、`.claude/`** — 开发工具产物，npm 发布时由 `files` 字段排除。
