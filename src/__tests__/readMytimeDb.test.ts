import { describe, it, expect, vi } from 'vitest'

// The reader module imports native-only packages at the top level; the pure
// core under test (`readMytimeTables`) never touches them, so empty stubs are
// enough to let the module load under vitest.
vi.mock('expo-sqlite', () => ({}))
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
}))

import {
  MytimeImportError,
  readMytimeTables,
  type MytimeTableSource,
} from '@/features/mytime-import/lib/readMytimeDb'

/**
 * A fake table source backed by plain objects. `tables` maps a table name to
 * its rows; a row's keys are its available columns, so omitting a key from
 * every row models a missing column. A table absent from the map models a
 * missing table.
 */
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

// The minimum that passes validation: both core tables present.
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
    // A schema-drifted backup whose ZCALL lacks the coordinate columns.
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
          // No Z_PK column at all — every id would be `mytime-time-undefined`.
          ZTIMEENTRY: [{ ZMINUTES: 60 }],
        })
      )
    )
    expect(tables.timeEntries).toEqual([])
  })
})
