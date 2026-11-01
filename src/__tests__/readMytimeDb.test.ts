import { describe, it, expect, vi } from 'vitest'

const native = vi.hoisted(() => ({
  readAsStringAsync: vi.fn<() => Promise<string>>(),
  openDatabaseAsync: vi.fn(),
}))
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: native.openDatabaseAsync }))
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: () => Promise.resolve(),
  deleteAsync: () => Promise.resolve(),
  copyAsync: () => Promise.resolve(),
  readAsStringAsync: native.readAsStringAsync,
}))

import {
  classifyFileHead,
  MytimeImportError,
  readMytimeDb,
  readMytimeTables,
  type MytimeTableSource,
} from '@/features/mytime-import/lib/readMytimeDb'

const fakeSource = (
  tables: Record<string, Array<Record<string, unknown>>>
): MytimeTableSource => ({
  async listTables() {
    return new Set(Object.keys(tables))
  },
  async listColumns(table) {
    const rows = tables[table] ?? []
    const cols = new Set<string>()
    for (const row of rows) for (const k of Object.keys(row)) cols.add(k)
    return cols
  },
  async selectAll<T>(table: string, columns: readonly string[]) {
    return (tables[table] ?? []).map((row) => {
      const out: Record<string, unknown> = {}
      for (const c of columns) out[c] = row[c]
      return out as T
    })
  },
})

const withCoreTables = (
  extra: Record<string, Array<Record<string, unknown>>> = {}
): Record<string, Array<Record<string, unknown>>> => ({
  ZCALL: [],
  ZRETURNVISIT: [],
  ...extra,
})

describe('readMytimeTables — validation', () => {
  it('rejects a database with neither core table', async () => {
    await expect(readMytimeTables(fakeSource({ FOO: [] }))).rejects.toThrow(
      MytimeImportError
    )
    await expect(
      readMytimeTables(fakeSource({ FOO: [] }))
    ).rejects.toMatchObject({ reason: 'notMytime' })
  })

  it('rejects when only one core table is present', async () => {
    await expect(
      readMytimeTables(fakeSource({ ZCALL: [] }))
    ).rejects.toMatchObject({ reason: 'notMytime' })
    await expect(
      readMytimeTables(fakeSource({ ZRETURNVISIT: [] }))
    ).rejects.toMatchObject({ reason: 'notMytime' })
  })

  it('accepts a database with both core tables and returns empty arrays', async () => {
    const tables = await readMytimeTables(fakeSource(withCoreTables()))
    expect(tables).toEqual({
      calls: [],
      returnVisits: [],
      additionalInfo: [],
      additionalInfoTypes: [],
      timeEntries: [],
      timeTypes: [],
      statisticsAdjustments: [],
      users: [],
    })
  })
})

describe('readMytimeTables — reading', () => {
  it('reads each table into its corresponding raw-rows key', async () => {
    const tables = await readMytimeTables(
      fakeSource(
        withCoreTables({
          ZCALL: [{ Z_PK: 1, ZNAME: 'Jane' }],
          ZRETURNVISIT: [{ Z_PK: 2, ZCALL: 1 }],
          ZADDITIONALINFORMATION: [{ Z_PK: 3, ZCALL: 1, ZVALUE: '555' }],
          ZADDITIONALINFORMATIONTYPE: [{ Z_PK: 4, ZNAME: 'Phone' }],
          ZTIMEENTRY: [{ Z_PK: 5, ZMINUTES: 60 }],
          ZTIMETYPE: [{ Z_PK: 6, ZNAME: 'Hours' }],
          ZSTATISTICSADJUSTMENT: [
            { Z_PK: 7, ZTYPE: 'Hours', ZTIMESTAMP: 202509 },
          ],
          ZUSER: [{ Z_PK: 8, ZPUBLISHERTYPE: 'Pioneer' }],
        })
      )
    )

    expect(tables.calls).toEqual([{ Z_PK: 1, ZNAME: 'Jane' }])
    expect(tables.returnVisits[0]).toMatchObject({ Z_PK: 2, ZCALL: 1 })
    expect(tables.additionalInfo[0]).toMatchObject({ Z_PK: 3 })
    expect(tables.additionalInfoTypes[0]).toMatchObject({ ZNAME: 'Phone' })
    expect(tables.timeEntries[0]).toMatchObject({ ZMINUTES: 60 })
    expect(tables.timeTypes[0]).toMatchObject({ ZNAME: 'Hours' })
    expect(tables.statisticsAdjustments[0]).toMatchObject({
      ZTIMESTAMP: 202509,
    })
    expect(tables.users[0]).toMatchObject({ ZPUBLISHERTYPE: 'Pioneer' })
  })

  it('selects only known columns, dropping unknown ones from the source', async () => {
    const tables = await readMytimeTables(
      fakeSource(
        withCoreTables({
          ZCALL: [{ Z_PK: 1, ZNAME: 'Jane', ZUNKNOWNFUTURECOLUMN: 'junk' }],
        })
      )
    )
    expect(tables.calls[0]).toEqual({ Z_PK: 1, ZNAME: 'Jane' })
    expect('ZUNKNOWNFUTURECOLUMN' in tables.calls[0]).toBe(false)
  })

  it('degrades a missing column to undefined rather than failing', async () => {
    const tables = await readMytimeTables(
      fakeSource(
        withCoreTables({
          ZCALL: [{ Z_PK: 1, ZNAME: 'Jane' }],
        })
      )
    )
    expect(tables.calls[0].ZLATTITUDE).toBeUndefined()
    expect(tables.calls[0].ZLONGITUDE).toBeUndefined()
  })

  it('treats a table whose rows lack Z_PK as absent (unusable for ids)', async () => {
    const tables = await readMytimeTables(
      fakeSource(
        withCoreTables({
          ZTIMEENTRY: [{ ZMINUTES: 60 }],
        })
      )
    )
    expect(tables.timeEntries).toEqual([])
  })
})

describe('readMytimeTables — files SQLite cannot read', () => {
  const notADatabase = new Error('Error code 26: file is not a database')

  it('rejects as openFailed when listing tables says the file is not a database', async () => {
    const source: MytimeTableSource = {
      ...fakeSource({}),
      listTables: () => Promise.reject(notADatabase),
    }
    await expect(readMytimeTables(source)).rejects.toThrow(MytimeImportError)
    await expect(readMytimeTables(source)).rejects.toMatchObject({
      reason: 'openFailed',
    })
  })

  it('lets any other listing failure through unchanged', async () => {
    const busy = new Error('Error code 5: database is locked')
    const source: MytimeTableSource = {
      ...fakeSource({}),
      listTables: () => Promise.reject(busy),
    }
    await expect(readMytimeTables(source)).rejects.toBe(busy)
  })

  it('rejects as openFailed when a later read says the file is not a database', async () => {
    const source: MytimeTableSource = {
      ...fakeSource(withCoreTables({ ZCALL: [{ Z_PK: 1 }] })),
      selectAll: () => Promise.reject(notADatabase),
    }
    await expect(readMytimeTables(source)).rejects.toMatchObject({
      reason: 'openFailed',
    })
  })

  it('lets any other read failure through unchanged', async () => {
    const boom = new Error('disk I/O error')
    const source: MytimeTableSource = {
      ...fakeSource(withCoreTables({ ZCALL: [{ Z_PK: 1 }] })),
      selectAll: () => Promise.reject(boom),
    }
    await expect(readMytimeTables(source)).rejects.toBe(boom)
  })
})

const bytes = (head: string) => new TextEncoder().encode(head)
const binary = (...values: number[]) => new Uint8Array(values)

describe('classifyFileHead', () => {
  it('names each known header', () => {
    expect(classifyFileHead(bytes('SQLite format 3\0\x10\x00'))).toBe('sqlite')
    expect(classifyFileHead(binary(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00))).toBe(
      'zip'
    )

    expect(classifyFileHead(binary(0x50, 0x4b, 0x05, 0x06, 0x00))).toBe('zip')
    expect(classifyFileHead(bytes('%PDF-1.7\n%\xe2\xe3'))).toBe('pdf')
    expect(classifyFileHead(bytes('bplist00\xd4\x01'))).toBe('bplist')
  })

  it('calls a file with no bytes empty', () => {
    expect(classifyFileHead(new Uint8Array())).toBe('empty')
  })

  it('tells JSON from other text', () => {
    expect(classifyFileHead(bytes('{"contacts": []}'))).toBe('json')
    expect(classifyFileHead(bytes('\ufeff\n  [1, 2]'))).toBe('json')
    expect(classifyFileHead(bytes('Name,Street\r\nSam,1 Main St'))).toBe('text')
    expect(classifyFileHead(bytes('Visita a Zoë — café'))).toBe('text')
  })

  it('calls other binary data unknown', () => {
    expect(
      classifyFileHead(binary(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    ).toBe('unknown')
    expect(classifyFileHead(binary(0x00, 0x00, 0x00, 0x00))).toBe('unknown')
  })
})

describe('readMytimeDb — files that are not SQLite', () => {
  const head = (data: Uint8Array) =>
    native.readAsStringAsync.mockResolvedValue(
      Buffer.from(data).toString('base64')
    )

  it.each([
    ['zip', binary(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00)],
    ['pdf', bytes('%PDF-1.4\n')],
    ['empty', new Uint8Array()],
  ] as const)(
    'rejects a %s file as openFailed without opening it',
    async (kind, data) => {
      head(data)
      const error = await readMytimeDb('file:///picked/backup').catch(
        (e: unknown) => e
      )
      expect(error).toBeInstanceOf(MytimeImportError)
      expect(error).toMatchObject({ reason: 'openFailed', fileKind: kind })
      expect(native.openDatabaseAsync).not.toHaveBeenCalled()
    }
  )

  it('calls a file it cannot read unknown', async () => {
    native.readAsStringAsync.mockRejectedValue(new Error('no such file'))
    await expect(readMytimeDb('file:///picked/backup')).rejects.toMatchObject({
      reason: 'openFailed',
      fileKind: 'unknown',
    })
  })
})

describe('MytimeImportError', () => {
  it('defaults to a SQLite file, the only kind that gets past the header check', () => {
    expect(new MytimeImportError('notMytime', 'x').fileKind).toBe('sqlite')
  })
})
