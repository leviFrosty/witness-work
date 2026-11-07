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

export type MytimeImportErrorReason = 'notMytime' | 'openFailed'

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

const isNotADatabaseError = (e: unknown): boolean =>
  /file is not a database|error code 26\b|database disk image is malformed|error code 11\b/i.test(
    String(e)
  )

const notADatabase = (e: unknown) =>
  new MytimeImportError(
    'openFailed',
    `Could not read the file as a database: ${String(e)}`
  )

export interface MytimeTableSource {
  listTables(): Promise<Set<string>>

  listColumns(table: string): Promise<Set<string>>

  selectAll<T>(table: string, columns: readonly string[]): Promise<T[]>
}

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

export async function readMytimeTables(
  source: MytimeTableSource
): Promise<MytimeRawTables> {
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

export const FILE_HEAD_LENGTH = 64

export const classifyFileHead = (bytes: Uint8Array): MytimeFileKind => {
  if (bytes.length === 0) return 'empty'

  if (startsWith(bytes, 'SQLite format 3\0')) return 'sqlite'

  if (startsWith(bytes, 'PK\x03\x04') || startsWith(bytes, 'PK\x05\x06'))
    return 'zip'
  if (startsWith(bytes, '%PDF-')) return 'pdf'
  if (startsWith(bytes, 'bplist')) return 'bplist'

  const isText = bytes.every(
    (b) => b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b !== 0x7f)
  )
  if (!isText) return 'unknown'

  let i = startsWith(bytes, '\xef\xbb\xbf') ? 3 : 0
  while (i < bytes.length && [0x09, 0x0a, 0x0d, 0x20].includes(bytes[i])) i++
  return bytes[i] === 0x7b || bytes[i] === 0x5b ? 'json' : 'text'
}
