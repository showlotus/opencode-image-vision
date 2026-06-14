import { VisionProvider } from './base.js'

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const DEFAULT_MODEL = 'glm-4.6v'
const REQUEST_TIMEOUT_MS = 60_000

export class GLMProvider extends VisionProvider {
  constructor(config) {
    super(config)
    this.apiKey = config.apiKey || process.env.GLM_API_KEY
    this.baseUrl = config.baseUrl || process.env.GLM_BASE_URL || DEFAULT_BASE_URL
    this.model = config.model || process.env.GLM_VISION_MODEL || DEFAULT_MODEL

    if (!this.apiKey) {
      throw new Error('GLM API key not configured. Set GLM_API_KEY env var or pass apiKey in config.')
    }
  }

  async analyze(base64, mime, prompt) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
                { type: 'text', text: prompt },
              ],
            },
          ],
          stream: false,
        }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`GLM API ${res.status}: ${t.slice(0, 200)}`)
      }

      const json = await res.json()
      return json.choices?.[0]?.message?.content?.trim() || '[No content returned]'
    } finally {
      clearTimeout(timer)
    }
  }
}
