# TODO: Tool Spinner 与视觉反馈优化

## 现状

插件采用 **三 hook + tool** 架构（`chat.message` + `chat.params` + `messages.transform` + `tool.analyze_image`），功能完整：

- ✅ 图片检测（transform hook）
- ✅ 图片写入临时文件（`os.tmpdir()/iv-images/<hash>.<ext>`），替换为带 `file_path` 路径的指令文本
- ✅ `toolChoice` 注入（`chat.params` hook，作为 fallback）
- ✅ `analyze_image` 工具接收 `file_path` 参数（Zod schema `tool.schema.string()`）
- ✅ 模型通过 `file_path` 自发调用工具（不依赖 toolChoice 强制注入）
- ✅ SDK 子会话调视觉模型（session.create + session.prompt + session.delete）
- ✅ MD5 去重缓存
- ✅ 递归防护（visionModel modelId 比较）
- ✅ 缓存命中直接替换不触发工具

## 待解决问题

### P0: 工具执行期间无 spinner 动画

**现象**：`analyze_image` 执行 30s 期间，TUI 显示静态 `⚙ analyze_image`（无 spinner 动画），完成后也不显示执行时间。

**根因**：OpenCode TUI 的 `GenericTool` 组件硬编码 `complete={true}`：

```tsx
// packages/tui/src/routes/session/index.tsx
// GenericTool（插件工具回退渲染器）
<InlineTool complete={true}>     // ← 硬编码，永远不显示 spinner
  {props.tool} {input(props.input)}
</InlineTool>

// 对比：内置工具（如 Shell）
<InlineTool complete={part.state.status === "completed"}>  // ← 动态判断
```

`InlineTool` 本身完整支持 spinner，但 `GenericTool` 从未传 `complete={false}`。

**已验证不可行的 hack**（8 种全部排除）：

| Hack | 失败原因 |
|------|---------|
| `context.metadata()` 更新状态 | GenericTool 忽略 running 状态 |
| 异步生成器/yield | `fromPlugin()` 包装为 `Effect.promise()` |
| `setInterval` + metadata() | 同上，状态变化被 GenericTool 忽略 |
| `tool.execute.before` hook | 后端运行，触及不到 TUI 渲染 |
| 发射假 `message.part.updated` 事件 | 插件无事件发射 API |
| 结构化返回值 | 只影响最终状态 |
| 欺骗 `toolDisplay()` | 工具名注册时固定 |
| 抛异常/abort | 直接变 error 状态 |

**官方 Issue 追踪**：

| Issue | 状态 | 说明 |
|-------|------|------|
| [#21018](https://github.com/anomalyco/opencode/issues/21018) | Open | 插件工具无法自定义 TUI 渲染 |
| [#33302](https://github.com/anomalyco/opencode/issues/33302) | Closed: not planned | TUI 工具渲染插槽 |
| [#18585](https://github.com/anomalyco/opencode/issues/18585) | Open | 插件 metadata title 被 TUI 忽略 |

**结论**：从插件侧无法修复，需等待 OpenCode 官方修复 `GenericTool` 的 `complete` prop。

### P1: 图片高亮丢失

**现象**：粘贴图片后，发送消息时 transform hook 将 `type: 'file'` 替换为 `type: 'text'`，TUI 高亮色块消失。

**根因**：`experimental.chat.messages.transform` hook 原位修改 `parts[index]`，影响 TUI 渲染引用。

**已探索的方案**：

| 方案 | 结果 |
|------|------|
| 保留 file part 不替换 | OpenCode 未自动剥离 image part → LLM 返回"不支持图片"错误 |
| 参考 JochenYang/opencode-vision | 他们保留 file part + system prompt 引导工具调用，但需要 system.transform hook |
| subagent 模式 | 子代理原生看图，可保留 file part |

**当前取舍**：图片替换为带 file_path 路径的指令文本（非 `[图片]` 空标记），模型能从文本中理解需要调用 `analyze_image` 工具并传入正确路径。接受高亮丢失，保证功能可靠。

### P2: `toolChoice` 透传未确认

**当前状态**：已降级为 fallback。temp file 策略下，模型通过替换文本中的 `file_path` 路径自发调用工具，`toolChoice` 不再是唯一触发机制。即使 `toolChoice` 注入失败，模型仍能正确调用 `analyze_image`。

## 生态调研总结

调研了 8 个 opencode vision 插件的实现：

| 模式 | 插件 | file part | UI 反馈 |
|------|------|-----------|---------|
| Transform-Replace | vision-bridge, vision-paste | ❌ 替换为文本 | Log / 无 |
| File Relay | minimax-easy-vision, image-relay | ❌ 删除 + 注入路径 | Toast / Log |
| Tool-Based | see-image, 本项目 | ❌ 替换为标记 | tool spinner（受限） |
| Keep File Part | JochenYang/opencode-vision | ✅ 保留 | system prompt + tool |

**关键发现**：JochenYang 是唯一保留 file part 的插件，依赖 OpenCode 内部 `unsupportedParts` 机制 + system prompt 引导。

## 后续选项

### 选项 A: 向 OpenCode 提 PR（推荐）

修复 `GenericTool` 的 `complete` prop：

```diff
- <InlineTool complete={true}>
+ <InlineTool complete={part.state.status !== "completed" && part.state.status !== "error" ? false : true}>
```

一行改动，解决所有插件工具的 spinner 问题。

### 选项 B: Subagent 模式

- 用户在 `opencode.json` 配置 `image-vision` 子代理（视觉模型）
- 插件注入 `experimental.chat.system.transform` 引导 LLM 委派
- 子代理执行时 TUI 原生显示 spinner（走 `Task` 组件，不经过 `GenericTool`）
- 子代理原生看图，可保留 file part 高亮
- 缺点：依赖 LLM 自愿委派，需要用户额外配置

### 选项 C: 接受现状

工具功能正常（30s 执行、返回描述），仅缺少 spinner 视觉反馈。可考虑回退到 transform 内联 SDK 调用（更简单、更可靠），放弃 tool spinner 目标。
