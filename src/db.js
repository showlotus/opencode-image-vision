import { homedir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

const DEFAULT_DB_PATH = join(homedir(), '.local', 'share', 'opencode', 'opencode.db')

export function getDatabase() {
  const dbPath = process.env.OPENCODE_DB_PATH || DEFAULT_DB_PATH
  return new Database(dbPath, { readonly: true, fileMustExist: true })
}

export function getImages(db, sessionId, limit) {
  const rows = db
    .prepare(
      `SELECT data FROM part
       WHERE json_extract(data, '$.type') = 'file'
         AND json_extract(data, '$.mime') LIKE 'image/%'
         AND session_id = ?
       ORDER BY time_created DESC
       LIMIT ?`,
    )
    .all(sessionId, limit)

  return rows
    .map(row => {
      const d = JSON.parse(row.data)
      const match = d.url?.match(/^data:([^;]+);base64,(.+)$/)
      return match
        ? { mime: d.mime || match[1], base64: match[2], filename: d.filename || 'image.png' }
        : null
    })
    .filter(Boolean)
}
