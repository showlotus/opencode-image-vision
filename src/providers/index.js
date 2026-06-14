import { GLMProvider } from './glm.js'

const PROVIDERS = {
  glm: GLMProvider,
}

export function createProvider(type, config) {
  const Provider = PROVIDERS[type]
  if (!Provider) {
    throw new Error(
      `Unknown provider: ${type}. Available: ${Object.keys(PROVIDERS).join(', ')}`,
    )
  }
  return new Provider(config)
}
