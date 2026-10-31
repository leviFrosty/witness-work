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

/** Whether this build can read a MyTime backup. */
export const canReadMytimeDb = true

/** Adapts an open `expo-sqlite` database to the reader's table source. */
const nativeSource = (db: SQLite.SQLiteDatabase): MytimeTableSource => ({
  async listTables() {
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
    return new Set(rows.map((r) => r.name))
  },
  async listColumns(table) {
    // Table names come only from our own `TABLE_COLUMNS` keys, never user
    // input, so interpolating them here is safe (PRAGMA can't be parametrized).
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

// expo-sqlite's default database directory is `${documentDirectory}SQLite`, so
// copying the picked file there lets us open it by name with no path-encoding
// surprises (the `file://`-prefixed picker URI is awkward to pass directly).
const SQLITE_DIR = `${FileSystem.documentDirectory}SQLite`
const IMPORT_DB_FILENAME = 'mytime-import-source.sqlite'
const IMPORT_DB_PATH = `${SQLITE_DIR}/${IMPORT_DB_FILENAME}`

/**
 * Copies the picked backup into expo-sqlite's directory under a fixed name. We
 * operate on this disposable copy and delete it afterward — the user's original
 * file is never opened, let alone written, which is the read-only guarantee the
 * ADR calls for.
 */
const copyIntoSqliteDir = async (uri: string): Promise<void> => {
  await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true })
  await FileSystem.deleteAsync(IMPORT_DB_PATH, { idempotent: true })
  await FileSystem.copyAsync({ from: uri, to: IMPORT_DB_PATH })
}

/**
 * Reads the copy's first bytes and names its kind, so a wrong file type (a PDF,
 * a text export, a zip) is turned away before SQLite opens it.
 */
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

/**
 * Opens a picked `.mytimedb` backup and reads it into raw MyTime rows. The
 * source file is copied to a throwaway location, opened, read, then closed and
 * the copy deleted — even if reading throws. Surfaces a `MytimeImportError` for
 * the two expected failure modes (not a SQLite file / not a MyTime store);
 * anything else propagates as an unexpected error.
 *
 * Read-only safety (per the ADR) is achieved two ways: we only ever touch a
 * disposable copy, never the user's original file, and we set `query_only` on
 * the connection so even the copy can't be mutated. (`expo-sqlite` exposes no
 * read-only open flag.)
 *
 * Requires a dev-client rebuild (`pnpm run ios`) — `expo-sqlite` is native.
 */
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
