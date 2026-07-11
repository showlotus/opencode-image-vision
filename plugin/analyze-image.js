import { tool } from '@opencode-ai/plugin'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { computeTimeoutBySize, isPathAllowed } from '../shared/image-utils.js'
import { dbg } from '../shared/debug.js'

function guessMimeFromExt(ext) {
  const map = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  }
  return map[ext.toLowerCase()] || 'image/png'
}

function formatElapsed(ms) {
  const totalSec = ms / 1000
  if (totalSec < 60) return totalSec.toFixed(1) + 's'
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

export function createAnalyzeImageTool(deps) {
  const { client, cache, state, visionModel, prompt, timeout } = deps

  return {
    description: 'Analyze images in the conversation. Returns detailed text descriptions including text content, UI layout, colors, and code details.',
    args: {
      file_path: tool.schema.string().describe('Path to the image file to analyze (provided automatically)'),
    },
    execute: async (args, context) => {
      const startTime = Date.now()
      const filePaths = args.file_path
        ? [args.file_path]
        : (state.pendingFilePaths || [])
      if (!filePaths.length) return { output: 'No images to analyze.', title: 'No images' }

      dbg(() => ({ event: 'execute_paths', argsPath: args.file_path, pendingCount: state.pendingFilePaths?.length }))

      const { createHash } = await import('node:crypto')
      const results = []
      let analyzedCount = 0

      for (const filePath of filePaths) {
        let actualPath = filePath
        let base64, mime
        if (!isPathAllowed(actualPath)) {
          results.push('[Analysis failed: path not allowed]')
          continue
        }
        try {
          const buffer = readFileSync(actualPath)
          base64 = buffer.toString('base64')
          mime = guessMimeFromExt(extname(actualPath))
        } catch (e) {
          if (e.code === 'ENOENT' && state.pendingFilePaths?.length) {
            actualPath = state.pendingFilePaths[0]
            dbg(() => ({ event: 'path_fallback', original: filePath, fallback: actualPath }))
            if (!isPathAllowed(actualPath)) {
              results.push('[Analysis failed: path not allowed]')
              continue
            }
            try {
              const buffer = readFileSync(actualPath)
              base64 = buffer.toString('base64')
              mime = guessMimeFromExt(extname(actualPath))
            } catch (e2) {
              results.push(`[Analysis failed: cannot read file ${actualPath}: ${e2.message}]`)
              dbg(() => ({ event: 'tool_analyze_fail', error: e2.message }))
              continue
            }
          } else {
            results.push(`[Analysis failed: cannot read file ${filePath}: ${e.message}]`)
            dbg(() => ({ event: 'tool_analyze_fail', error: e.message }))
            continue
          }
        }

        const hash = createHash('md5').update(base64).digest('hex').slice(0, 16)
        if (cache.has(hash)) {
          results.push(cache.get(hash))
          if (args.file_path) {
            const idx = state.pendingFilePaths.indexOf(actualPath)
            if (idx !== -1) state.pendingFilePaths.splice(idx, 1)
          }
          continue
        }
        if (state.processingHashes?.has(hash)) {
          results.push('[This image is currently being analyzed. Please wait for the existing analysis to complete.]')
          dbg(() => ({ event: 'skip_duplicate', hash }))
          continue
        }
        if (!state.processingHashes) state.processingHashes = new Set()
        state.processingHashes.add(hash)

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
          analyzedCount++
          if (args.file_path) {
            const idx = state.pendingFilePaths.indexOf(actualPath)
            if (idx !== -1) state.pendingFilePaths.splice(idx, 1)
          }
          dbg(() => ({ event: 'tool_analyze_ok', descLen: desc.length }))
        } catch (e) {
          clearTimeout(timeoutId)
          results.push(`[Analysis failed: ${e.message}]`)
          dbg(() => ({ event: 'tool_analyze_fail', error: e.message }))
        } finally {
          state.processingHashes?.delete(hash)
          if (childId) {
            try { await client.session.abort({ path: { id: childId } }) } catch {}
            try { await client.session.delete({ path: { id: childId } }) } catch {}
          }
        }
      }

      if (!args.file_path) {
        state.pendingFilePaths = []
      }
      if (state.pendingFilePaths.length === 0) {
        state.hasPendingImages = false
        state.pendingSessionId = null
      }

      const elapsed = Date.now() - startTime
      const output = results.length === 1
        ? results[0]
        : results.map((desc, i) => `### Image ${i + 1}\n\n${desc}`).join('\n\n---\n\n')
      dbg(() => ({ event: 'tool_complete', count: results.length, analyzedCount, elapsedMs: elapsed }))
      if (analyzedCount > 0 && client?.tui?.showToast) {
        const hasFail = results.some(r => r.includes('[Analysis failed'))
        try {
          await client.tui.showToast({
            body: {
              title: 'Image Vision',
              message: hasFail
                ? `❌ ${results.find(r => r.includes('[Analysis failed'))}`
                : `⏱ ${analyzedCount} image${analyzedCount > 1 ? 's' : ''} analyzed in ${formatElapsed(elapsed)}`,
              variant: hasFail ? 'error' : 'success',
              duration: hasFail ? 5000 : 3000,
            },
          })
        } catch (e) {
          dbg(() => ({ event: 'toast_fail', error: e.message }))
        }
      }
      return { output }
    },
  }
}
