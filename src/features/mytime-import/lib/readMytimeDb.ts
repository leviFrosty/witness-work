import * as SQLite from 'expo-sqlite'
import * as FileSystem from 'expo-file-system/legacy'
import type {
  MytimeAdditionalInfoRow,
  MytimeAdditionalInfoTypeRow,
  MytimeCallRow,
  MytimeRawTables,
  MytimeReturnVisitRow,
  MytimeStatisticsAdjustmentRow,
  MytimeTimeEntryRow,
  MytimeTimeTypeRow,
  MytimeUserRow,
} from '@/features/mytime-import/lib/mytimeSchema'

/**
 * Why the import failed in a way the user can act on, as opposed to an
 * unexpected bug. The hook shows a "this isn't a MyTime backup" message for
 * both reasons and does NOT report them to Sentry — picking the wrong file is a
 * user mistake, not a defect.
 *
 * - `notMytime` — the file is a valid SQLite database but lacks MyTime's tables.
 * - `openFailed` — the file could not be opened as a SQLite database at all
 *   (wrong file type, truncated, encrypted, …).
 */
export type MytimeImportErrorReason = 'notMytime' | 'openFailed'

export class MytimeImportError extends Error {
  readonly reason: MytimeImportErrorReason
  constructor(reason: MytimeImportErrorReason, message: string) {
    super(message)
    this.name = 'MytimeImportError'
    this.reason = reason
  }
}

/**
 * The narrow slice of a SQLite database the reader needs, expressed as
 * schema-aware operations rather than raw SQL. Keeping the core behind this
 * interface lets us unit-test validation and graceful degradation against a
 * fake without a native SQLite engine.
 */
export interface MytimeTableSource {
  /** Names of every table in the database. */
  listTables(): Promise<Set<string>>
  /** Names of every column on a table. */
  listColumns(table: string): Promise<Set<string>>
  /** All rows for the given columns of a table, keyed by column name. */
  selectAll<T>(table: string, columns: readonly string[]): Promise<T[]>
}

/**
 * The columns the reader pulls per table, mirroring `mytimeSchema.ts` exactly
 * (including MyTime's own `ZLATTITUDE` misspelling). Every column the mapper
 * reads must appear here; anything the table is missing is simply dropped from
 * the `SELECT`, leaving that field `undefined` on the row (the mapper tolerates
 * it — MyTime shipped ~19 schema versions).
 */
const TABLE_COLUMNS = {
  ZCALL: [
    'Z_PK',
    'ZDELETEDCALL',
    'ZNAME',
    'ZHOUSENUMBER',
    'ZSTREET',
    'ZAPARTMENTNUMBER',
    'ZCITY',
    'ZSTATE',
    'ZLATTITUDE',
    'ZLONGITUDE',
    'ZMOSTRECENTRETURNVISITDATE',
  ],
  ZRETURNVISIT: ['Z_PK', 'ZCALL', 'ZDATE', 'ZNOTES', 'ZTYPE'],
  ZADDITIONALINFORMATION: ['Z_PK', 'ZCALL', 'ZTYPE', 'ZVALUE', 'ZDATE'],
  ZADDITIONALINFORMATIONTYPE: ['Z_PK', 'ZNAME'],
  ZTIMEENTRY: ['Z_PK', 'ZMINUTES', 'ZTYPE', 'ZDATE', 'ZNOTES'],
  ZTIMETYPE: ['Z_PK', 'ZNAME', 'ZDIRECTCREDIT'],
  ZSTATISTICSADJUSTMENT: ['Z_PK', 'ZTYPE', 'ZTIMESTAMP', 'ZADJUSTMENT'],
  ZUSER: ['Z_PK', 'ZPUBLISHERTYPE', 'ZPIONEERSTARTDATE', 'ZNAME'],
} as const

/**
 * Validates the database is a MyTime store and reads its tables into the raw
 * row shapes the mapper consumes. Pure of any native dependency — see
 * `readMytimeDb` for the `expo-sqlite`-backed entry point.
 *
 * Validation gate: a genuine MyTime backup always has both `ZCALL` and
 * `ZRETURNVISIT`. Their absence means the user picked the wrong file, so we
 * reject up front rather than silently importing nothing. Past that gate every
 * table is optional — a missing table or column degrades to empty/absent so a
 * schema-drifted backup still imports what it can.
 */
export async function readMytimeTables(
  source: MytimeTableSource
): Promise<MytimeRawTables> {
  const tables = await source.listTables()
  if (!tables.has('ZCALL') || !tables.has('ZRETURNVISIT')) {
    throw new MytimeImportError(
      'notMytime',
      'Database is missing MyTime core tables (ZCALL/ZRETURNVISIT).'
    )
  }

  const read = async <T>(
    name: keyof typeof TABLE_COLUMNS,
    columns: readonly string[]
  ): Promise<T[]> => {
    if (!tables.has(name)) return []
    const available = await source.listColumns(name)
    const present = columns.filter((c) => available.has(c))
    // Every record's deterministic id is derived from its Core Data PK; without
    // it the row is unusable, so treat the table as absent.
    if (!present.includes('Z_PK')) return []
    return source.selectAll<T>(name, present)
  }

  const [
    calls,
    returnVisits,
    additionalInfo,
    additionalInfoTypes,
    timeEntries,
    timeTypes,
    statisticsAdjustments,
    users,
  ] = await Promise.all([
    read<MytimeCallRow>('ZCALL', TABLE_COLUMNS.ZCALL),
    read<MytimeReturnVisitRow>('ZRETURNVISIT', TABLE_COLUMNS.ZRETURNVISIT),
    read<MytimeAdditionalInfoRow>(
      'ZADDITIONALINFORMATION',
      TABLE_COLUMNS.ZADDITIONALINFORMATION
    ),
    read<MytimeAdditionalInfoTypeRow>(
      'ZADDITIONALINFORMATIONTYPE',
      TABLE_COLUMNS.ZADDITIONALINFORMATIONTYPE
    ),
    read<MytimeTimeEntryRow>('ZTIMEENTRY', TABLE_COLUMNS.ZTIMEENTRY),
    read<MytimeTimeTypeRow>('ZTIMETYPE', TABLE_COLUMNS.ZTIMETYPE),
    read<MytimeStatisticsAdjustmentRow>(
      'ZSTATISTICSADJUSTMENT',
      TABLE_COLUMNS.ZSTATISTICSADJUSTMENT
    ),
    read<MytimeUserRow>('ZUSER', TABLE_COLUMNS.ZUSER),
  ])

  return {
    calls,
    returnVisits,
    additionalInfo,
    additionalInfoTypes,
    timeEntries,
    timeTypes,
    statisticsAdjustments,
    users,
  }
}

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
export async function readMytimeDb(uri: string): Promise<MytimeRawTables> {
  await copyIntoSqliteDir(uri)

  let db: SQLite.SQLiteDatabase | undefined
  try {
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
