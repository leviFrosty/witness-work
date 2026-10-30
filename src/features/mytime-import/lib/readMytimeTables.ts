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
 * both reasons and does NOT report them to error tracking — picking the wrong
 * file is a user mistake, not a defect.
 *
 * - `notMytime` — the file is a valid SQLite database but lacks MyTime's tables.
 * - `openFailed` — the file could not be opened as a SQLite database at all
 *   (wrong file type, truncated, encrypted, an iCloud placeholder that was
 *   never downloaded, …).
 */
export type MytimeImportErrorReason = 'notMytime' | 'openFailed'

/**
 * What the picked file looks like from its first bytes, so analytics can tell
 * which wrong files people pick without sending anything from inside them.
 */
export type MytimeFileKind =
  | 'sqlite'
  | 'zip'
  | 'pdf'
  | 'bplist'
  | 'json'
  | 'text'
  | 'empty'
  | 'unknown'

export class MytimeImportError extends Error {
  readonly reason: MytimeImportErrorReason
  /**
   * Defaults to `sqlite`: only the header check rejects other kinds, so every
   * error raised after it is about a file that starts like a SQLite database.
   */
  readonly fileKind: MytimeFileKind
  constructor(
    reason: MytimeImportErrorReason,
    message: string,
    fileKind: MytimeFileKind = 'sqlite'
  ) {
    super(message)
    this.name = 'MytimeImportError'
    this.reason = reason
    this.fileKind = fileKind
  }
}

/** SQLite's result code 26 (`SQLITE_NOTADB`), as `expo-sqlite` reports it. */
const isNotADatabaseError = (e: unknown): boolean =>
  /file is not a database|error code 26\b/i.test(String(e))

const notADatabase = (e: unknown) =>
  new MytimeImportError(
    'openFailed',
    `Could not read the file as a database: ${String(e)}`
  )

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
  // SQLite opens a file lazily, so one that isn't a database opens "fine" and
  // only fails here, on the first query. Any other failure is a real fault.
  let tables: Set<string>
  try {
    tables = await source.listTables()
  } catch (e) {
    throw isNotADatabaseError(e) ? notADatabase(e) : e
  }
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
  ]).catch((e: unknown) => {
    throw isNotADatabaseError(e) ? notADatabase(e) : e
  })

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

const startsWith = (bytes: Uint8Array, prefix: string): boolean =>
  bytes.length >= prefix.length &&
  [...prefix].every((ch, i) => bytes[i] === ch.charCodeAt(0))

/** How many leading bytes `classifyFileHead` needs to tell the kinds apart. */
export const FILE_HEAD_LENGTH = 64

/**
 * Names a file's kind from its first bytes. Only the kind leaves the device;
 * the bytes themselves are never logged or sent.
 */
export const classifyFileHead = (bytes: Uint8Array): MytimeFileKind => {
  if (bytes.length === 0) return 'empty'
  // Every SQLite database starts with `SQLite format 3\0`.
  if (startsWith(bytes, 'SQLite format 3\0')) return 'sqlite'
  // Local file header, or the end record of an empty archive.
  if (startsWith(bytes, 'PK\x03\x04') || startsWith(bytes, 'PK\x05\x06'))
    return 'zip'
  if (startsWith(bytes, '%PDF-')) return 'pdf'
  if (startsWith(bytes, 'bplist')) return 'bplist'
  // Text has no control bytes besides tab, newline and carriage return; bytes
  // from 0x80 up are allowed so UTF-8 text still counts.
  const isText = bytes.every(
    (b) => b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b !== 0x7f)
  )
  if (!isText) return 'unknown'
  // Skip a UTF-8 byte order mark and leading whitespace before the first char.
  let i = startsWith(bytes, '\xef\xbb\xbf') ? 3 : 0
  while (i < bytes.length && [0x09, 0x0a, 0x0d, 0x20].includes(bytes[i])) i++
  return bytes[i] === 0x7b || bytes[i] === 0x5b ? 'json' : 'text'
}
