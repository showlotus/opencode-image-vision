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

// 根据图片 base64 大小计算合理的识别超时
// base64 越大，视觉模型处理越久；在基础超时上按大小梯度增加（每 0.5MB +20s），设有上限避免无限等待
export function computeTimeoutBySize(base64Length, baseTimeout = 120000) {
  const sizeMB = base64Length / (1024 * 1024)
  const extraMs = Math.ceil(sizeMB / 0.5) * 20000
  return Math.min(baseTimeout + extraMs, 300000)
}
