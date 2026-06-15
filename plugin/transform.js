import { createHash } from 'node:crypto'
import { isImagePart, extractBase64 } from '../shared/image-utils.js'
import { isUnsupportedModel, extractModelFromMessages } from '../shared/model-detect.js'
import { toastProgress, toastDone, toastFail } from '../shared/toast.js'

export function createTransformHook(provider, cache, config, client) {
  return async (input, output) => {
    try {
      if (!output?.messages?.length) return

      let hasImage = false
      for (const msg of output.messages) {
        if (msg.parts?.some(isImagePart)) {
          hasImage = true
          break
        }
      }
      if (!hasImage) return

      const modelId = extractModelFromMessages(output.messages)
      if (modelId && !isUnsupportedModel(modelId, config.unsupportedModels)) return

      const pending = []
      for (const message of output.messages) {
        if (message.info?.role !== 'user') continue
        const parts = message.parts
        if (!parts) continue

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]
          if (!isImagePart(part)) continue

          const base64 = extractBase64(part)
          if (!base64) continue

          const hash = createHash('md5').update(base64).digest('hex').slice(0, 16)

          if (cache.has(hash)) {
            parts[i] = { type: 'text', text: '[Image description]\n' + cache.get(hash) }
            continue
          }

          pending.push({ parts, index: i, base64, hash, mime: part.mime })
        }
      }

      if (pending.length === 0) return

      let success = 0
      for (let j = 0; j < pending.length; j++) {
        const item = pending[j]
        await toastProgress(client, j + 1, pending.length)

        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), config.timeout || 30000)
        try {
          const desc = await Promise.race([
            provider.analyze(item.base64, item.mime, config.prompt),
            new Promise((_, reject) => {
              ctrl.signal.addEventListener('abort', () =>
                reject(new Error('Vision analyze timeout')),
              )
            }),
          ])
          cache.set(item.hash, desc)
          item.parts[item.index] = { type: 'text', text: '[Image description]\n' + desc }
          success++
        } catch (e) {
          console.error(`[image-vision] ${e.message}`)
          await toastFail(client)
        } finally {
          clearTimeout(timer)
        }
      }

      if (success > 0) await toastDone(client, success)
    } catch (e) {
      console.error(`[image-vision] ${e.message}`)
    }
  }
}
