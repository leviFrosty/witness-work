import { describe, expect, it } from 'vitest'
import { buildMytimeBackup } from '../../../../e2e/web/mytimeFixture'
import { mapMytimeData } from '@/features/mytime-import/lib/mapMytimeData'
import { MytimeImportError } from '@/features/mytime-import/lib/readMytimeTables'
import { readMytimeSqlite } from '@/features/mytime-import/lib/readMytimeSqlite'

const text = (value: string) => new TextEncoder().encode(value)

describe('readMytimeSqlite', () => {
  it('reads a MyTime backup into raw rows, in memory', async () => {
    const tables = await readMytimeSqlite(await buildMytimeBackup())
    expect(tables.calls.map((call) => call.ZNAME)).toEqual([
      'Maria Santos',
      'Daniel Okafor',
      'Removed Person',
    ])
    expect(tables.returnVisits).toHaveLength(3)
    expect(tables.timeEntries.map((entry) => entry.ZMINUTES)).toEqual([90, 60])
    expect(tables.users[0]).toMatchObject({ ZPUBLISHERTYPE: 'Pioneer' })
  })

  it('feeds the same mapper as the native reader', async () => {
    const mapped = mapMytimeData(
      await readMytimeSqlite(await buildMytimeBackup()),
      new Date('2025-04-01T00:00:00Z')
    )
    // The soft-deleted contact is left out.
    expect(mapped.contacts.map((contact) => contact.name).sort()).toEqual([
      'Daniel Okafor',
      'Maria Santos',
    ])
    expect(mapped.visits).toHaveLength(3)
    expect(mapped.timeEntries).toHaveLength(2)
    expect(mapped.publisher?.role).toBe('regularPioneer')
  })

  it('does not change the bytes it was given', async () => {
    const bytes = await buildMytimeBackup()
    const before = Buffer.from(bytes).toString('base64')
    await readMytimeSqlite(bytes)
    expect(Buffer.from(bytes).toString('base64')).toBe(before)
  })

  it('turns away files that are not SQLite before opening them', async () => {
    for (const [bytes, kind] of [
      [text('%PDF-1.7 not a database'), 'pdf'],
      [text('PK\u0003\u0004zip'), 'zip'],
      [text('{"hello":"world"}'), 'json'],
      [new Uint8Array(0), 'empty'],
    ] as const)
      await expect(readMytimeSqlite(bytes)).rejects.toMatchObject({
        name: 'MytimeImportError',
        reason: 'openFailed',
        fileKind: kind,
      })
  })

  it('says a database without MyTime tables is not a MyTime backup', async () => {
    const { default: initSqlJs } = await import('sql.js')
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run('CREATE TABLE notes (id INTEGER)')
    const bytes = db.export()
    db.close()
    await expect(readMytimeSqlite(bytes)).rejects.toMatchObject({
      reason: 'notMytime',
    })
  })

  it('reports a database that starts like SQLite but is damaged', async () => {
    const bytes = await buildMytimeBackup()
    // Keep the header and first page, lose the rest.
    const truncated = bytes.slice(0, 4096)
    const garbled = new Uint8Array(bytes)
    garbled.fill(0xff, 200, 3000)
    for (const broken of [truncated, garbled])
      await expect(readMytimeSqlite(broken)).rejects.toBeInstanceOf(
        MytimeImportError
      )
  })
})
