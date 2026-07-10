import { tool } from '@opencode-ai/plugin'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { computeTimeoutBySize } from '../shared/image-utils.js'
import { dbg } from '../shared/debug.js'

function guessMimeFromExt(ext) {
  const map = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  }
  return map[ext.toLowerCase()] || 'image/png'
}

export function createAnalyzeImageTool(deps) {
  const { client, cache, state, visionModel, prompt, timeout } = deps

  return {
    description: 'Analyze images in the conversation. Returns detailed text descriptions including text content, UI layout, colors, and code details.',
    args: {
      file_path: tool.schema.string().describe('Path to the image file to analyze (provided automatically)'),
    },
    execute: async (args, context) => {
      const filePaths = args.file_path
        ? [args.file_path]
        : (state.pendingFilePaths || [])
      if (!filePaths.length) return { output: 'No images to analyze.', title: 'No images' }

      const { createHash } = await import('node:crypto')
      const results = []

      for (const filePath of filePaths) {
        let base64, mime
        try {
          const buffer = readFileSync(filePath)
          base64 = buffer.toString('base64')
          mime = guessMimeFromExt(extname(filePath))
        } catch (e) {
          results.push(`[Analysis failed: cannot read file ${filePath}: ${e.message}]`)
          dbg(() => ({ event: 'tool_analyze_fail', error: e.message }))
          continue
        }

        const hash = createHash('md5').update(base64).digest('hex').slice(0, 16)
        if (cache.has(hash)) {
          results.push(cache.get(hash))
          continue
        }

        let childId
        let timeoutId
        try {
          const childSession = await client.session.create({ body: { parentID: state.pendingSessionId, title: 'Vision Analysis' } })
          childId = childSession?.data?.id ?? childSession?.id
          if (!childId) throw new Error('Failed to create child session')

          const computedTimeout = computeTimeoutBySize(base64.length, timeout)
          const result = await Promise.race([
            client.session.prompt({
              path: { id: childId },
              body: {
                model: visionModel,
                parts: [
                  { type: 'file', mime, url: `data:${mime};base64,${base64}` },
                  { type: 'text', text: prompt },
                ],
                tools: {},
              },
            }),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('Vision API timeout')), computedTimeout)
            }),
          ])
          clearTimeout(timeoutId)

          const respParts = result?.data?.parts ?? result?.parts ?? []
          const textPart = respParts.find(p => p.type === 'text')
          const desc = textPart?.text?.trim() || '[No description returned]'
          cache.set(hash, desc)
          results.push(desc)
          dbg(() => ({ event: 'tool_analyze_ok', descLen: desc.length }))
        } catch (e) {
          clearTimeout(timeoutId)
          results.push(`[Analysis failed: ${e.message}]`)
          dbg(() => ({ event: 'tool_analyze_fail', error: e.message }))
        } finally {
          if (childId) {
            try { await client.session.abort({ path: { id: childId } }) } catch {}
            try { await client.session.delete({ path: { id: childId } }) } catch {}
          }
        }
      }

      state.pendingFilePaths = []
      state.hasPendingImages = false
      state.pendingSessionId = null

      const output = results.length === 1
        ? results[0]
        : results.map((desc, i) => `### Image ${i + 1}\n\n${desc}`).join('\n\n---\n\n')
      dbg(() => ({ event: 'tool_complete', count: results.length }))
      return { output, title: `${results.length} image(s) analyzed` }
    },
  }
}
