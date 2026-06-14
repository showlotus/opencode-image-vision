import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'

function detectDbPath() {
  const candidates = []

  if (process.env.OPENCODE_DB_PATH) {
    candidates.push(process.env.OPENCODE_DB_PATH)
  }

  const opencodeDir = 'opencode'
  const dbFile = 'opencode.db'

  if (process.env.XDG_DATA_HOME) {
    candidates.push(join(process.env.XDG_DATA_HOME, opencodeDir, dbFile))
  }

  const home = homedir()
  if (platform() === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
    candidates.push(join(localAppData, opencodeDir, dbFile))
  } else {
    candidates.push(join(home, '.local', 'share', opencodeDir, dbFile))
  }

  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  throw new Error(
    `OpenCode database not found. Searched:\n${candidates.map(p => `  - ${p}`).join('\n')}\nSet OPENCODE_DB_PATH to override.`,
  )
}

export function getDatabase() {
  return new Database(detectDbPath(), { readonly: true, fileMustExist: true })
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
