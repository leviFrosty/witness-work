import * as SQLite from 'expo-sqlite'
import * as FileSystem from 'expo-file-system/legacy'
import type { MytimeRawTables } from '@/features/mytime-import/lib/mytimeSchema'
import {
  classifyFileHead,
  FILE_HEAD_LENGTH,
  MytimeImportError,
  readMytimeTables,
  type MytimeFileKind,
  type MytimeTableSource,
} from '@/features/mytime-import/lib/readMytimeTables'

export * from '@/features/mytime-import/lib/readMytimeTables'

export const canReadMytimeDb = true

const nativeSource = (db: SQLite.SQLiteDatabase): MytimeTableSource => ({
  async listTables() {
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
    return new Set(rows.map((r) => r.name))
  },
  async listColumns(table) {
    const rows = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info("${table}")`
    )
    return new Set(rows.map((r) => r.name))
  },
  async selectAll<T>(table: string, columns: readonly string[]) {
    const cols = columns.map((c) => `"${c}"`).join(', ')
    return db.getAllAsync<T>(`SELECT ${cols} FROM "${table}"`)
  },
})

const SQLITE_DIR = `${FileSystem.documentDirectory}SQLite`
const IMPORT_DB_FILENAME = 'mytime-import-source.sqlite'
const IMPORT_DB_PATH = `${SQLITE_DIR}/${IMPORT_DB_FILENAME}`

const copyIntoSqliteDir = async (uri: string): Promise<void> => {
  await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true })
  await FileSystem.deleteAsync(IMPORT_DB_PATH, { idempotent: true })
  await FileSystem.copyAsync({ from: uri, to: IMPORT_DB_PATH })
}

const readFileKind = async (path: string): Promise<MytimeFileKind> => {
  const head = await FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.Base64,
    position: 0,
    length: FILE_HEAD_LENGTH,
  }).catch(() => null)
  if (head === null) return 'unknown'
  const binary = globalThis.atob(head)
  return classifyFileHead(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

export async function readMytimeDb(
  uri: string,
  _file?: Blob
): Promise<MytimeRawTables> {
  await copyIntoSqliteDir(uri)

  let db: SQLite.SQLiteDatabase | undefined
  try {
    const fileKind = await readFileKind(IMPORT_DB_PATH)
    if (fileKind !== 'sqlite') {
      throw new MytimeImportError(
        'openFailed',
        `File does not start with the SQLite header (${fileKind}).`,
        fileKind
      )
    }
    try {
      db = await SQLite.openDatabaseAsync(IMPORT_DB_FILENAME)
      await db.execAsync('PRAGMA query_only = ON')
    } catch (e) {
      throw new MytimeImportError(
        'openFailed',
        `Could not open the file as a database: ${String(e)}`
      )
    }
    return await readMytimeTables(nativeSource(db))
  } finally {
    if (db) await db.closeAsync().catch(() => undefined)
    await FileSystem.deleteAsync(IMPORT_DB_PATH, {
      idempotent: true,
    }).catch(() => undefined)
  }
}
