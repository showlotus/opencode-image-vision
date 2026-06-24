export const DEFAULT_UNSUPPORTED_MODELS = [
  'glm-5',
  'glm-5.2',
  'deepseek-v4',
  'minimax-text-01',
  'glm-4.5',
  'glm-4.5-air',
  'glm-4.5-flash',
]

export function isUnsupportedModel(modelId, extraList = []) {
  const lower = modelId.toLowerCase()
  const list = [...DEFAULT_UNSUPPORTED_MODELS, ...extraList]
  return list.some(kw => lower.includes(kw.toLowerCase()))
}

export function extractModelFromMessages(messages) {
  for (const message of messages) {
    const info = message.info
    if (!info) continue

    const candidate =
      info.model?.id ||
      info.model?.modelID ||
      info.modelID ||
      (typeof info.model === 'string' ? info.model : null)

    if (candidate) return candidate
  }

  return null
}
