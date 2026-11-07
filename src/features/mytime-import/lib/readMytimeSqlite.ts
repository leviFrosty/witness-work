import type { Database, SqlJsStatic, SqlValue } from 'sql.js'
import type { MytimeRawTables } from '@/features/mytime-import/lib/mytimeSchema'
import {
  classifyFileHead,
  FILE_HEAD_LENGTH,
  MytimeImportError,
  readMytimeTables,
  type MytimeTableSource,
} from '@/features/mytime-import/lib/readMytimeTables'

export const MYTIME_MAX_FILE_BYTES = 25 * 1024 * 1024

const memorySource = (db: Database): MytimeTableSource => ({
  async listTables() {
    const [result] = db.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
    return new Set((result?.values ?? []).map(([name]) => String(name)))
  },
  async listColumns(table) {
    const [result] = db.exec(`PRAGMA table_info("${table}")`)
    const name = result?.columns.indexOf('name') ?? -1
    return new Set((result?.values ?? []).map((row) => String(row[name])))
  },
  async selectAll<T>(table: string, columns: readonly string[]) {
    const statement = db.prepare(
      `SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM "${table}"`
    )
    try {
      const rows: Record<string, SqlValue>[] = []
      while (statement.step()) rows.push(statement.getAsObject())
      return rows as T[]
    } finally {
      statement.free()
    }
  },
})

let engine: Promise<SqlJsStatic> | undefined

function loadEngine(locateFile?: (file: string) => string) {
  engine ??= import('sql.js')
    .then(({ default: initSqlJs }) => initSqlJs({ locateFile }))
    .catch((error: unknown) => {
      engine = undefined
      throw error
    })
  return engine
}

export async function readMytimeSqlite(
  bytes: Uint8Array,
  locateFile?: (file: string) => string
): Promise<MytimeRawTables> {
  const fileKind = classifyFileHead(bytes.subarray(0, FILE_HEAD_LENGTH))
  if (fileKind !== 'sqlite')
    throw new MytimeImportError(
      'openFailed',
      `File does not start with the SQLite header (${fileKind}).`,
      fileKind
    )

  const SQL = await loadEngine(locateFile)
  let db: Database | undefined
  try {
    try {
      db = new SQL.Database(bytes)
      db.exec('PRAGMA query_only = ON')
    } catch (e) {
      throw new MytimeImportError(
        'openFailed',
        `Could not open the file as a database: ${String(e)}`
      )
    }
    return await readMytimeTables(memorySource(db))
  } finally {
    db?.close()
  }
}
