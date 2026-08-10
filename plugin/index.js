import { fetchOpencodeProviders } from '../shared/opencode.js'
import { createCache } from '../shared/cache.js'
import { dbg, setDebug } from '../shared/debug.js'
import { isImagePart } from '../shared/image-utils.js'
import { createTransformHook } from './transform.js'
import { createAnalyzeImageTool } from './analyze-image.js'

const DEFAULT_PROMPT = [
  'Describe this image in detail, including:',
  'text content, UI layout structure, interface elements, color scheme.',
  'If there are code or technical details, list them thoroughly.',
].join(' ')

export default {
  id: 'image-vision',
  server: async (input, options = {}) => {
    try {
      setDebug(options.debug)
      const model = options.model
      if (!model || typeof model !== 'string') {
        throw new Error('Vision model not configured. Set "model" in plugin options (format: providerId/modelId)')
      }
      const slashIdx = model.indexOf('/')
      if (slashIdx === -1) throw new Error(`Invalid model format: "${model}"`)
      const providerId = model.slice(0, slashIdx)
      const modelId = model.slice(slashIdx + 1)

      const cache = createCache()
      const visionModel = { providerID: providerId, modelID: modelId }

      const client = input.client
      let providersPromise
      const getProviders = () => (providersPromise ??= fetchOpencodeProviders(client))

      const state = {
        hasPendingImages: false,
        pendingFilePaths: [],
        pendingSessionId: null,
      }

      dbg(() => ({ event: 'server_init_ok', model, providerId, modelId }))

      return {
        'chat.message': async (input, output) => {
          state.hasPendingImages = output?.parts?.some(p => isImagePart(p)) || false
        },

        // toolChoice injection removed entirely.
        // The text instruction from the transform hook ("Call the analyze_image
        // tool with file_path=...") is sufficient for any model that supports
        // tool calling. toolChoice is a force-mechanism that breaks providers
        // that don't support it (e.g. NVIDIA NIM) and is not needed for
        // providers that do.

        'experimental.chat.messages.transform': createTransformHook({
          state, cache, getProviders, visionModel,
        }),

        tool: {
          analyze_image: createAnalyzeImageTool({
            client, cache, state, visionModel,
            prompt: options.prompt || DEFAULT_PROMPT,
            timeout: options.timeout || 120000,
          }),
        },
      }
    } catch (e) {
      dbg(() => ({ event: 'server_init_fail', error: e.message }))
      console.error(`[image-vision] init failed: ${e.message}`)
      return {}
    }
  },
}
