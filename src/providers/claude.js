import { VisionProvider } from './base.js'

export class ClaudeProvider extends VisionProvider {
  constructor(config) {
    super(config)
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl
    this.model = config.model
    this.timeout = config.timeout || 60_000

    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured.')
    }
    if (!this.baseUrl) {
      throw new Error('Anthropic base URL not configured.')
    }
    if (!this.model) {
      throw new Error('Anthropic model not configured.')
    }
  }

  async analyze(base64, mime, prompt) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeout)

    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mime, data: base64 },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 200)}`)
      }

      const json = await res.json()
      return json.content?.[0]?.text?.trim() || '[No content returned]'
    } finally {
      clearTimeout(timer)
    }
  }
}
