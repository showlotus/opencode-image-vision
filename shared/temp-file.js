import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEMP_DIR = join(tmpdir(), 'iv-images')

const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
}

export function saveImageToTempDir(base64, mime, hash) {
  mkdirSync(TEMP_DIR, { recursive: true })
  const ext = MIME_TO_EXT[mime] || 'png'
  const filePath = join(TEMP_DIR, `${hash}.${ext}`)
  writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return filePath
}
