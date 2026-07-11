# plugin/ — OpenCode 插件生命周期

入口与 hook 注册层。通过 `package.json` exports 三路别名（`.`、`./plugin`、`./server`）暴露。

## WHERE TO LOOK

| 任务 | 位置 | 备注 |
|------|------|------|
| 新增 hook | `index.js:42-68` | server 返回的映射对象，按 OpenCode 约定命名 |
| 修改用户配置解析 | `index.js:19-26` | options 校验：model 必填，格式 `providerId/modelId` |
| 调整图片替换策略 | `transform.js:56-79` | base64→临时文件→指令文本 |
| 修改工具执行流程 | `analyze-image.js:25-181` | readFileSync→子 session→vision model |
| 调整 toolChoice fallback | `index.js:47-55` | hasPendingImages 时注入 |
| 递归防护条件 | `transform.js:24` | modelId === visionModel.modelID 时跳过 |

## 4 阶段 Hook 流程

```
chat.message (index.js:43)        → 检测图片 part，设 hasPendingImages
    ↓
chat.params (index.js:47)         → 注入 toolChoice（fallback）
    ↓
experimental.chat.messages.transform (transform.js:14)
    → 跳过视觉模型自身 / 已支持图片的模型
    → base64 → MD5 hash → 缓存检查
    → 缓存命中：替换为 [图片识别结果] 文本
    → 未命中：写临时文件，替换为 file_path 指令文本
    ↓
tool: analyze_image (analyze-image.js:15)
    → readFileSync → 子 session.create → session.prompt(vision model)
    → 超时：computeTimeoutBySize (120s base, max 300s)
    → 缓存结果 → finally: session.abort + session.delete
```

## CONVENTIONS

- 工厂模式：`createTransformHook(deps)` / `createAnalyzeImageTool(deps)` 接收 `{ state, cache, ... }` 依赖注入
- `state` 对象（`index.js:35-39`）在所有 hook 间共享：`hasPendingImages`、`pendingFilePaths`、`pendingSessionId`、`processingHashes`（惰性初始化的 Set，防止同一 hash 并发分析）
- `deps.getProviders` 惰性初始化：首次调用才发 IPC，promise 缓存复用（`index.js:31-32`）
- 工具参数用 `tool.schema.string()`（SDK 提供），禁止直接 import zod
- `console.error` 前缀统一 `[image-vision]`

## ANTI-PATTERNS

> 全局约束见 root `AGENTS.md`。本目录特有：

- `tool.execute` 中禁止 `await` 非必要的外部调用 — 该函数在主对话的 turn 内运行，阻塞直接影响 TUI 响应
- 禁止在 transform hook 中新增同步 I/O — 该 hook 在 OpenCode 热点路径（每次发送消息触发），同步阻塞导致输入卡顿

## NOTES

- **P0 spinner 不可用** — `analyze_image` 执行期间无 spinner 动画，根因是上游 `GenericTool` 硬编码 `complete={true}`，插件侧无法修复（详见 root TODO.md）
- **P1 图片高亮丢失** — transform 原位替换 `type: 'file'` 为 `type: 'text'`，TUI 高亮色块消失，接受此取舍
- **子 session 清理** — `analyze-image.js:142-143` 两个空 catch 块为有意设计，清理失败不影响主流程
- **悬垂 timer 风险** — `Promise.race` 超时后 session.prompt 可能仍 resolve，写入已 delete 的 session，resolve 被静默丢弃
