import { extname } from 'node:path'

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']

export function isImagePart(part) {
  return part.type === 'file' && typeof part.mime === 'string' && part.mime.startsWith('image/')
}

export function extractBase64(part) {
  const match = part.url?.match(/^data:([^;]+);base64,(.+)$/)
  return match ? match[2] : null
}

export function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.includes(extname(filePath).toLowerCase())
}
