import type { Database, SqlJsStatic, SqlValue } from 'sql.js'
import type { MytimeRawTables } from '@/features/mytime-import/lib/mytimeSchema'
import {
  classifyFileHead,
  FILE_HEAD_LENGTH,
  MytimeImportError,
  readMytimeTables,
  type MytimeTableSource,
} from '@/features/mytime-import/lib/readMytimeTables'

/** The largest backup the web reads, as the largest file the app moves. */
export const MYTIME_MAX_FILE_BYTES = 25 * 1024 * 1024

/**
 * Adapts an open `sql.js` database to the reader's table source. Table and
 * column names come from the reader's own `TABLE_COLUMNS` keys, never from the
 * file, so quoting them into the SQL is safe.
 */
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

/**
 * SQLite compiled to WebAssembly, loaded on first use and kept: `sql.js` stays
 * out of the entry chunk, and one instance serves every import. `locateFile`
 * says where the wasm file is; the web serves it from its own origin.
 */
function loadEngine(locateFile?: (file: string) => string) {
  engine ??= import('sql.js')
    .then(({ default: initSqlJs }) => initSqlJs({ locateFile }))
    .catch((error: unknown) => {
      engine = undefined
      throw error
    })
  return engine
}

/**
 * Reads a MyTime backup from its bytes, in memory: SQLite opens a copy of the
 * file inside the page. Nothing is written and the original is never touched;
 * it needs no SharedArrayBuffer, worker or cross-origin isolation (ADR 0037
 * §5).
 *
 * Throws `MytimeImportError` for a file that isn't a SQLite database or isn't
 * MyTime's, as the native reader does.
 */
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
