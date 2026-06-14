import { VisionProvider } from './base.js'

export class GLMProvider extends VisionProvider {
  constructor(config) {
    super(config)
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl
    this.model = config.model
    this.timeout = config.timeout || 60_000

    if (!this.apiKey) {
      throw new Error('GLM API key not configured.')
    }
    if (!this.baseUrl) {
      throw new Error('GLM base URL not configured.')
    }
    if (!this.model) {
      throw new Error('GLM model not configured.')
    }
  }

  async analyze(base64, mime, prompt) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeout)

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
