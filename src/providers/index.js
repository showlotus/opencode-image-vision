import { OpenAICompatibleProvider } from './openai-compatible.js'
import { ClaudeProvider } from './claude.js'
import { resolveProviderConfig } from '../opencode.js'

const OPENAI_COMPATIBLE = {
  'zhipuai-coding-plan': OpenAICompatibleProvider,
  'zai-coding-plan': OpenAICompatibleProvider,
  'z-ai': OpenAICompatibleProvider,
  'zhipuai': OpenAICompatibleProvider,
  'moonshot': OpenAICompatibleProvider,
  'kimi': OpenAICompatibleProvider,
  'minimax': OpenAICompatibleProvider,
  'minimax-cn-coding-plan': OpenAICompatibleProvider,
  'openai': OpenAICompatibleProvider,
  'qwen': OpenAICompatibleProvider,
  'dashscope': OpenAICompatibleProvider,
  'doubao': OpenAICompatibleProvider,
  'volcengine': OpenAICompatibleProvider,
  'yi': OpenAICompatibleProvider,
  'lingyiwanwu': OpenAICompatibleProvider,
  'gemini': OpenAICompatibleProvider,
  'google': OpenAICompatibleProvider,
  'stepfun': OpenAICompatibleProvider,
  'baichuan': OpenAICompatibleProvider,
  'hunyuan': OpenAICompatibleProvider,
}

const PROVIDER_MAP = {
  ...OPENAI_COMPATIBLE,
  'anthropic': ClaudeProvider,
  'claude': ClaudeProvider,
}

export function createProvider() {
  const raw = process.env.model || 'zhipuai-coding-plan/glm-4.6v'
  const slashIdx = raw.indexOf('/')
  if (slashIdx === -1) {
    throw new Error(
      `Invalid model format: "${raw}". Expected "provider/model", e.g. "zhipuai-coding-plan/glm-4.6v"`,
    )
  }
  const providerId = raw.slice(0, slashIdx)
  const modelId = raw.slice(slashIdx + 1)

  const Provider = PROVIDER_MAP[providerId]
  if (!Provider) {
    throw new Error(
      `Unknown provider: ${providerId}. Available: ${Object.keys(PROVIDER_MAP).join(', ')}`,
    )
  }

  const config = resolveProviderConfig(providerId, modelId)
  config.timeout = Number(process.env.timeout) || undefined
  return new Provider(config)
}
