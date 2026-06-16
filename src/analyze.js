import { getDatabase, getImages } from './db.js'
import { mapWithConcurrency } from './concurrency.js'

// 默认分析提示词
const DEFAULT_PROMPT = [
  'Describe this image in detail, including:',
  'text content, UI layout structure, interface elements, color scheme.',
  'If there are code or technical details, list them thoroughly.',
].join(' ')

// 默认与上限配置
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20
const DEFAULT_CONCURRENCY = 5

// 分析指定 OpenCode 会话里的图片，返回格式化的文字描述
// provider 已就绪的视觉模型 provider；sessionId 会话 id（ses_xxx）
// 单张失败不影响其余图片，结果保持原顺序
// 返回 { ok, text }：ok=false 表示数据库打开失败（调用方可据此标记错误）
export async function analyzeSessionImages(provider, sessionId, options = {}) {
  const prompt = options.prompt || DEFAULT_PROMPT
  const limit = Math.min(options.limit || DEFAULT_LIMIT, MAX_LIMIT)
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY

  let db
  try {
    db = getDatabase()
  } catch (e) {
    return { ok: false, text: `Failed to open database: ${e.message}` }
  }

  try {
    const images = getImages(db, sessionId, limit)
    if (!images.length) {
      return { ok: true, text: `No images found in session ${sessionId}.` }
    }

    // 并发分析，单张失败转为文字块，不中断其余图片
    const results = await mapWithConcurrency(
      images,
      concurrency,
      async (img, i) => {
        try {
          const desc = await provider.analyze(img.base64, img.mime, prompt)
          return `### Image ${i + 1}: ${img.filename}\n\n${desc}`
        } catch (e) {
          return `### Image ${i + 1}: ${img.filename}\n\n[Analysis failed: ${e.message}]`
        }
      },
    )

    return {
      ok: true,
      text: `Analyzed ${images.length} image(s):\n\n${results.join('\n\n---\n\n')}`,
    }
  } finally {
    db.close()
  }
}

export { DEFAULT_PROMPT, MAX_LIMIT }
