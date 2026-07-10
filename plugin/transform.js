import { isImagePart, extractBase64 } from '../shared/image-utils.js'
import { isUnsupportedModel, extractModelFromMessages } from '../shared/model-detect.js'
import { modelSupportsImage } from '../shared/opencode.js'
import { dbg } from '../shared/debug.js'
import { saveImageToTempDir } from '../shared/temp-file.js'

function findLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info?.role === 'user') return messages[i]
  }
  return null
}

export function createTransformHook(deps) {
  const { state, cache, getProviders, visionModel } = deps

  return async (input, output) => {
    try {
      if (!output?.messages?.length) return

      const modelId = extractModelFromMessages(output.messages)

      dbg(() => ({ event: 'gate_model', modelId, visionModel }))
      if (modelId === visionModel.modelID) return

      if (!modelId) return

      const sessionId = output.messages[0]?.info?.sessionID
      if (!sessionId) return

      const lastUser = findLastUserMessage(output.messages)
      if (!lastUser?.parts) return

      const targets = []
      for (let i = 0; i < lastUser.parts.length; i++) {
        if (isImagePart(lastUser.parts[i])) {
          targets.push(i)
        }
      }
      if (!targets.length) return

      const unsupportedFast = isUnsupportedModel(modelId, [])
      let intervene = unsupportedFast
      if (!unsupportedFast) {
        const providers = getProviders ? await getProviders() : []
        intervene = !modelSupportsImage(providers, modelId)
        dbg(() => ({ event: 'gate', modelId, intervene }))
      }
      if (!intervene) return

      const { createHash } = await import('node:crypto')
      state.pendingFilePaths = []
      state.hasPendingImages = false
      state.pendingSessionId = sessionId

      for (const index of targets) {
        const part = lastUser.parts[index]
        const base64 = extractBase64(part)
        if (!base64) continue

        const hash = createHash('md5').update(base64).digest('hex').slice(0, 16)
        if (cache.has(hash)) {
          lastUser.parts[index] = { type: 'text', text: '[Image analysis result]\n' + cache.get(hash) }
          continue
        }

        let tempPath
        try {
          tempPath = saveImageToTempDir(base64, part.mime, hash)
        } catch (e) {
          lastUser.parts[index] = { type: 'text', text: '[Image analysis failed: failed to write temp file]' }
          continue
        }
        state.pendingFilePaths.push(tempPath)
        lastUser.parts[index] = {
          type: 'text',
          text: `[An image was pasted. Call the analyze_image tool with file_path="${tempPath}" to get the image description.]`
        }
        state.hasPendingImages = true
      }

      dbg(() => ({
        event: 'transform_complete',
        pending: state.pendingFilePaths.length,
        cached: targets.length - state.pendingFilePaths.length,
      }))
    } catch (e) {
      console.error(`[image-vision] transform failed: ${e.message}`)
    }
  }
}
