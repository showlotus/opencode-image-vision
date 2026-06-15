import { resolveProviderConfig } from '../src/opencode.js'
import { createProviderFromConfig } from '../src/providers/index.js'
import { createCache } from '../shared/cache.js'
import { createTransformHook } from './transform.js'
import { createToolBeforeHook } from './tool-before.js'

const DEFAULT_PROMPT = [
  'Describe this image in detail, including:',
  'text content, UI layout structure, interface elements, color scheme.',
  'If there are code or technical details, list them thoroughly.',
].join(' ')

export default {
  id: 'image-vision',
  server: async (input, options = {}) => {
    try {
      const model = options.model || 'zhipuai-coding-plan/glm-4.6v'
      const unsupportedModels = options.unsupportedModels || []
      const timeout = options.timeout || 30000
      const prompt = options.prompt || DEFAULT_PROMPT

      const slashIdx = model.indexOf('/')
      if (slashIdx === -1) throw new Error(`Invalid model format: "${model}"`)
      const providerId = model.slice(0, slashIdx)
      const modelId = model.slice(slashIdx + 1)

      const config = resolveProviderConfig(providerId, modelId)
      config.timeout = timeout
      config.providerId = providerId
      const provider = createProviderFromConfig(config)

      const cache = createCache()

      const hookConfig = { prompt, timeout, unsupportedModels }
      const client = input.client

      return {
        'experimental.chat.messages.transform': createTransformHook(provider, cache, hookConfig, client),
        'tool.execute.before': createToolBeforeHook(provider, cache, hookConfig, client),
      }
    } catch (e) {
      console.error(`[image-vision] Failed to initialize: ${e.message}`)
      return {}
    }
  },
}
