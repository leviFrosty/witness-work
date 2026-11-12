import { describe, expect, it } from 'vitest'
import { toB64u } from '@/lib/bytes'
import {
  doNotCallData,
  doorData,
  guestData,
  readDoNotCall,
  readDoor,
  readGuest,
  readGuestKeys,
  readStreet,
  readWorked,
  workedData,
} from '@/features/territories/guest/codecs'
import * as app from '@/features/territories/lib/shared/territoryRecords'

const S = 'ERERERERQRGBEREREREREQ'
const key = toB64u(new Uint8Array(32).fill(7))

describe('guest codecs', () => {
  it('reads a link’s keys, skipping bad scopes and keys', () => {
    const keys = readGuestKeys({
      title: '12 · North Hill',
      from: 'Anna',
      houseRecords: true,
      scopes: { [S]: { 1: key, 2: 'short', x: key }, nope: { 1: key } },
      expiresAt: 5,
    })
    expect(keys?.title).toBe('12 · North Hill')
    expect(Object.keys(keys!.scopes)).toEqual([S])
    expect(Object.keys(keys!.scopes[S]!)).toEqual(['1'])
    expect(readGuestKeys({ title: 'x', from: 'y', scopes: {} })).toBeNull()
  })

  it('reads a street, clipping its name and ignoring device-only fields', () => {
    const street = readStreet({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'x'.repeat(100),
      numbering: 'odd',
      first: 3,
      order: 2,
      next: 9,
      doors: [],
    })
    expect(street).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'x'.repeat(80),
      numbering: 'odd',
      first: 3,
      order: 2,
    })
    expect(readStreet({ id: 'x', name: 'a', numbering: 'odd' })).toBeNull()
  })

  it('reads doors, needing a label, outcome and time', () => {
    expect(
      readDoor({
        label: ' 12 ',
        outcome: 'spoke',
        at: 10,
        tries: 2,
        by: 'm',
        byName: 'Joe',
        coordinate: { latitude: 1, longitude: 2 },
        coordinateSource: 'gps',
      })
    ).toEqual({
      label: ' 12 ',
      outcome: 'spoke',
      at: 10,
      tries: 2,
      by: 'm',
      byName: 'Joe',
      coordinate: { latitude: 1, longitude: 2 },
      coordinateSource: 'gps',
    })
    expect(
      readDoor({ label: '1', outcome: 'maybe', at: 1, by: 'm' })
    ).toBeNull()
    expect(readDoor({ label: '1', outcome: 'spoke', at: 1 })).toEqual({
      label: '1',
      outcome: 'spoke',
      at: 1,
      tries: 1,
    })
  })

  it('keeps unknown fields when writing a record back', () => {
    const data = doorData(
      {
        label: '4',
        outcome: 'notHome',
        at: 1,
        tries: 1,
        by: 'g',
        byName: 'Maria',
      },
      { label: '3', future: 'kept', description: 'old' }
    )
    expect(data).toEqual({
      label: '4',
      outcome: 'notHome',
      at: 1,
      tries: 1,
      by: 'g',
      byName: 'Maria',
      future: 'kept',
    })
    expect(workedData({ by: 'g' }, { at: 5, x: 1 })).toEqual({ by: 'g', x: 1 })
  })

  it('never writes a name or a reason into a do-not-call', () => {
    expect(
      doNotCallData(
        { address: '8 Oak Street', at: 2, label: '8' },
        { name: 'Smith', reason: 'angry', extra: true }
      )
    ).toEqual({ address: '8 Oak Street', at: 2, label: '8', extra: true })
    expect(readDoNotCall({ address: '8 Oak', at: 2, name: 'x' })).toEqual({
      address: '8 Oak',
      at: 2,
    })
  })

  it('reads worked and guest records', () => {
    expect(readWorked({ by: 'g' })).toEqual({ by: 'g' })
    expect(readWorked({ at: 3 })).toEqual({ at: 3 })
    expect(readGuest({ name: ' Maria ', linkId: 'L', joinedAt: 1 })).toEqual({
      name: 'Maria',
      linkId: 'L',
      joinedAt: 1,
    })
    expect(readGuest({ name: ' ', linkId: 'L', joinedAt: 1 })).toBeNull()
  })
})

describe('guest and app codecs agree', () => {
  const door = {
    id: '22222222-2222-4222-8222-222222222222',
    label: '14',
    outcome: 'doNotCall' as const,
    at: 1_700_000_000_000,
    tries: 2,
    coordinate: { latitude: 40.1, longitude: -75.2 },
    coordinateSource: 'gps' as const,
    description: 'Blue door',
  }
  const dnc = {
    id: '33333333-3333-4333-8333-333333333333',
    address: '8 Oak Street',
    at: 1_700_000_000_000,
    coordinate: { latitude: 40.1, longitude: -75.2 },
    label: '8',
  }

  it('reads what the app writes, for every kind a guest reads', () => {
    const street = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Oak Street',
      numbering: 'odd' as const,
      first: 3,
      descending: true,
      saveLocations: true,
      doors: [],
      next: 5,
    }
    expect(readStreet(app.streetData(street, 2))).toEqual(
      app.readStreetData(app.streetData(street, 2))
    )
    expect(readWorked(app.workedData(5, 'm', 'Anna'))).toEqual({
      at: 5,
      by: 'm',
      byName: 'Anna',
    })
    expect(readDoor(app.doorData(door, 'm', 'Anna'))).toEqual({
      ...omitId(door),
      by: 'm',
      byName: 'Anna',
    })
    expect(readDoNotCall(app.doNotCallData(dnc))).toEqual(omitId(dnc))
    expect(
      readGuest(app.guestData({ name: 'Maria', linkId: 'L', joinedAt: 1 }))
    ).toEqual({ name: 'Maria', linkId: 'L', joinedAt: 1 })
  })

  it('writes what the app reads, for every kind a guest writes', () => {
    const recorded = doorData({ ...omitId(door), by: 'g', byName: 'Maria' })
    expect(app.readDoorData(recorded)).toEqual({
      ...omitId(door),
      by: 'g',
      byName: 'Maria',
    })
    expect(recorded).toEqual(app.doorData(door, 'g', 'Maria'))
    expect(
      app.readWorkedData(workedData({ at: 9, by: 'g', byName: 'Maria' }))
    ).toEqual({ at: 9, by: 'g', byName: 'Maria' })
    expect(app.readWorkedData(workedData({ by: 'g' }))).toEqual({ by: 'g' })
    expect(app.readDoNotCallData(doNotCallData(omitId(dnc)))).toEqual(
      omitId(dnc)
    )
    expect(
      app.readGuestData(
        guestData({ name: ' Maria ', linkId: 'L', joinedAt: 1 })
      )
    ).toEqual({ name: 'Maria', linkId: 'L', joinedAt: 1 })
  })

  it('clips to the protocol’s limits both ways', () => {
    const long = (n: number) => 'x'.repeat(n + 10)
    const written = doorData({
      label: long(40),
      outcome: 'spoke',
      at: 1,
      tries: 1,
      description: long(200),
      by: 'g',
      byName: long(40),
    })
    expect((written.label as string).length).toBe(40)
    expect((written.description as string).length).toBe(200)
    expect((written.byName as string).length).toBe(40)
    expect(
      (doNotCallData({ address: long(200), at: 1 }).address as string).length
    ).toBe(200)
    expect(
      (guestData({ name: long(40), linkId: 'L', joinedAt: 1 }).name as string)
        .length
    ).toBe(40)
    expect(
      readStreet(app.streetData({ ...baseStreet, name: long(80) }, 0))?.name
    ).toHaveLength(80)
  })

  it('never keeps a name or reason on a do-not-call, in either writer', () => {
    const previous = { name: 'Smith', reason: 'angry', future: 1 }
    expect(doNotCallData(omitId(dnc), previous)).toEqual({
      ...app.doNotCallData(dnc),
      future: 1,
    })
    expect(
      app.withUnknownFields('doNotCall', previous, app.doNotCallData(dnc))
    ).toEqual({ ...app.doNotCallData(dnc), future: 1 })
  })
})

const baseStreet = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Oak',
  numbering: 'both' as const,
  doors: [],
  next: 1,
}

function omitId<T extends { id: string }>(value: T): Omit<T, 'id'> {
  const { id: _, ...rest } = value
  return rest
}
