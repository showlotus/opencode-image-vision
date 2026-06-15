import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { isImageFile } from '../shared/image-utils.js'
import { toastProgress, toastDone, toastFail } from '../shared/toast.js'

export function createToolBeforeHook(provider, cache, config, client) {
  return async (input, output) => {
    try {
      if (input.tool !== 'read') return

      const filePath = output.args.filePath || output.args.path
      if (!filePath || typeof filePath !== 'string') return
      if (!isImageFile(filePath)) return

      let buf
      try {
        buf = readFileSync(filePath)
      } catch {
        return
      }

      const base64 = buf.toString('base64')

      const ext = extname(filePath).toLowerCase()
      const mimeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
      }
      const mime = mimeMap[ext] || 'image/*'

      const hash = createHash('md5').update(base64).digest('hex').slice(0, 16)

      let desc
      if (cache.has(hash)) {
        desc = cache.get(hash)
      } else {
        await toastProgress(client, 1, 1)

        const ctrl = new AbortController()
        const timeout = config?.timeout || 60_000
        const timer = setTimeout(() => ctrl.abort(), timeout)
        try {
          desc = await Promise.race([
            provider.analyze(base64, mime, config?.prompt, { signal: ctrl.signal }),
            new Promise((_, reject) => {
              ctrl.signal.addEventListener('abort', () =>
                reject(new Error('Vision analysis timeout')),
              )
            }),
          ])
          cache.set(hash, desc)
          await toastDone(client, 1)
        } catch (e) {
          await toastFail(client)
          return
        } finally {
          clearTimeout(timer)
        }
      }

      const dir = join(tmpdir(), 'opencode-image-vision')
      mkdirSync(dir, { recursive: true })
      const tempPath = join(dir, basename(filePath) + '.' + hash.slice(0, 8) + '.txt')
      writeFileSync(tempPath, '[Image description]\n' + desc)

      output.args.filePath = tempPath
      output.args.path = tempPath
    } catch (e) {
      console.error(`[image-vision] tool.execute.before failed: ${e.message}`)
    }
  }
}
