import { GLMProvider } from './glm.js'
import { resolveProviderConfig } from '../opencode.js'

// Provider ID → provider class mapping
const PROVIDER_MAP = {
  'zhipuai-coding-plan': GLMProvider,
  'zai-coding-plan': GLMProvider,
  'z-ai': GLMProvider,
  'zhipuai': GLMProvider,
}

export function createProvider() {
  const raw = process.env.model || 'zhipuai-coding-plan/glm-4.6v'
  const slashIdx = raw.indexOf('/')
  if (slashIdx === -1) {
    throw new Error(
      `Invalid VISION_MODEL format: "${raw}". Expected "provider/model", e.g. "zhipuai-coding-plan/glm-4.6v"`,
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
