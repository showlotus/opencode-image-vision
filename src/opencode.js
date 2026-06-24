import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Provider ID → base URL mapping
// Future providers can be added here
const PROVIDER_REGISTRY = {
  'zhipuai-coding-plan':    { baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', format: 'openai' },
  'zai-coding-plan':        { baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', format: 'openai' },
  'z-ai':                   { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai' },
  'zhipuai':                { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai' },
  'moonshot':               { baseUrl: 'https://api.moonshot.cn/v1', format: 'openai' },
  'kimi':                   { baseUrl: 'https://api.moonshot.cn/v1', format: 'openai' },
  'minimax':                { baseUrl: 'https://api.minimaxi.chat/v1', format: 'openai' },
  'minimax-cn-coding-plan': { baseUrl: 'https://api.minimaxi.chat/v1', format: 'openai' },
  'openai':                 { baseUrl: 'https://api.openai.com/v1', format: 'openai' },
  'qwen':                   { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', format: 'openai' },
  'dashscope':              { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', format: 'openai' },
  'doubao':                 { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', format: 'openai' },
  'volcengine':             { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', format: 'openai' },
  'yi':                     { baseUrl: 'https://api.lingyiwanwu.com/v1', format: 'openai' },
  'lingyiwanwu':            { baseUrl: 'https://api.lingyiwanwu.com/v1', format: 'openai' },
  'gemini':                 { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', format: 'openai' },
  'google':                 { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', format: 'openai' },
  'stepfun':                { baseUrl: 'https://api.stepfun.com/v1', format: 'openai' },
  'baichuan':               { baseUrl: 'https://api.baichuan-ai.com/v1', format: 'openai' },
  'hunyuan':                { baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', format: 'openai' },
  'anthropic':              { baseUrl: 'https://api.anthropic.com/v1', format: 'anthropic' },
  'claude':                 { baseUrl: 'https://api.anthropic.com/v1', format: 'anthropic' },
};

// 从 OpenCode 凭据文件读取指定提供商的 API key
// 优先读 auth.json（OpenCode 当前使用的凭据源，扁平结构 providerId -> { type, key }）
// 读不到则回退 account.json（旧格式，嵌套 active/accounts 结构）
async function readApiKey(opencodeDir, providerId) {
  // auth.json：当前凭据源
  try {
    const auth = JSON.parse(await readFile(join(opencodeDir, 'auth.json'), 'utf-8'))
    const entry = auth.active?.[providerId] || auth[providerId]
    if (entry?.key) return entry.key
  } catch {
    // auth.json 不存在或解析失败，继续尝试 account.json
  }

  // account.json：旧格式回退
  try {
    const account = JSON.parse(await readFile(join(opencodeDir, 'account.json'), 'utf-8'))
    const accountId = account.active?.[providerId]
    const key = account.accounts?.[accountId]?.credential?.key
    if (key) return key
  } catch {
    // account.json 不存在或解析失败
  }

  return null
}

export async function resolveProviderConfig(providerId, modelId) {
  const opencodeDir = join(homedir(), '.local', 'share', 'opencode')

  // 读取 API key，优先 auth.json，回退 account.json
  const apiKey = await readApiKey(opencodeDir, providerId)
  if (!apiKey) {
    throw new Error(`No API key found for provider "${providerId}" in auth.json or account.json`)
  }

  // 从注册表中查找 base URL
  const registry = PROVIDER_REGISTRY[providerId]
  if (!registry) throw new Error(`Provider "${providerId}" not in PROVIDER_REGISTRY. Available: ${Object.keys(PROVIDER_REGISTRY).join(', ')}. Please add it to src/opencode.js`)

  return {
    apiKey,
    baseUrl: registry.baseUrl,
    model: modelId,
  }
}

// 通过 opencode SDK 读取全部 provider（含模型能力信息）
// 这会尊重用户在 opencode 配置里的覆盖以及 models.dev 的定义
// 带超时兜底：client 调用若长时间无响应（如 server 未就绪/代理异常），超时后返回空数组，
// 绝不无限等待，避免拖垮调用方
export async function fetchOpencodeProviders(client, timeoutMs = 5000) {
  try {
    if (!client?.config?.providers) return []
    const res = await Promise.race([
      client.config.providers(),
      new Promise(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ])
    if (!res) return []
    return res?.data?.providers ?? res?.providers ?? []
  } catch {
    return []
  }
}

// 从已取得的 providers 中解析指定 provider 实际配置的接口 baseURL
// 例如 zhipuai-coding-plan 在 opencode 中对应编程端点 /api/coding/paas/v4 而非通用端点
// 解析不到时返回 null，由调用方回退到本地 PROVIDER_REGISTRY
export function getProviderBaseUrl(providers, providerId) {
  if (!Array.isArray(providers)) return null
  const found = providers.find(p => p.id === providerId)
  const baseUrl = found?.options?.baseURL
  if (typeof baseUrl === 'string' && baseUrl.trim()) {
    // 去掉末尾斜杠，保持与拼接 /chat/completions 的约定一致
    return baseUrl.replace(/\/+$/, '')
  }
  return null
}

// 判断指定模型是否支持图片输入
// 返回 true 支持 / false 不支持 / null 无法判定（数据缺失，交由调用方兜底）
export function modelSupportsImage(providers, modelId) {
  if (!modelId || !Array.isArray(providers)) return null
  for (const p of providers) {
    const model = p?.models?.[modelId]
    if (model) {
      const image = model?.capabilities?.input?.image
      return typeof image === 'boolean' ? image : null
    }
  }
  return null
}
