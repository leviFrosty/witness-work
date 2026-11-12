import { describe, expect, it } from 'vitest'
import {
  AWAY_METRES,
  autoPinDoor,
  awayFromStreet,
  distanceMetres,
  distanceToOutline,
  doNotCallField,
  doorPinState,
  doNotCallNumberTaken,
  editDoNotCall,
  pinCentre,
  setDoorPin,
  wholeYearsSince,
} from '@/features/territories/lib/doorPins'
import {
  savesDoorLocations,
  territoryDoNotCalls,
  type FormatDoorAddress,
} from '@/features/territories/lib/doors'
import type {
  Territory,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const at = (north: number, east = 0) => ({
  latitude: 40 + north / 111_195,
  longitude: -75 + east / (111_195 * Math.cos((40 * Math.PI) / 180)),
})

const door = (patch: Partial<TerritoryDoor> = {}): TerritoryDoor => ({
  id: 'd1',
  label: '1',
  outcome: 'notHome',
  at: 0,
  tries: 1,
  ...patch,
})

const street = (patch: Partial<TerritoryStreet> = {}): TerritoryStreet => ({
  id: 's1',
  name: 'Oak Street',
  numbering: 'both',
  next: 1,
  doors: [],
  ...patch,
})

const territory = (patch: Partial<Territory> = {}): Territory => ({
  id: 't1',
  number: '12',
  checkedOutAt: 0,
  streets: [street()],
  doNotCalls: [],
  createdAt: 0,
  ...patch,
})

const format: FormatDoorAddress = (where, what) =>
  where.numbering === 'none'
    ? `${what.description}, ${where.name}`
    : `${what.label} ${where.name}`

describe('distanceMetres', () => {
  it('measures short distances on the ground', () => {
    expect(distanceMetres(at(0), at(1000))).toBeCloseTo(1000, -1)
    expect(distanceMetres(at(0), at(0, 300))).toBeCloseTo(300, -1)
  })
})

describe('distanceToOutline', () => {
  const square = [at(-100, -100), at(-100, 100), at(100, 100), at(100, -100)]

  it('is zero inside the outline', () => {
    expect(distanceToOutline(at(0), square)).toBe(0)
  })

  it('measures to the nearest edge outside it', () => {
    expect(distanceToOutline(at(600, 0), square)).toBeCloseTo(500, -1)
    expect(distanceToOutline(at(0, -350), square)).toBeCloseTo(250, -1)
  })

  it('has no answer without an outline', () => {
    expect(distanceToOutline(at(0), undefined)).toBeUndefined()
    expect(distanceToOutline(at(0), [])).toBeUndefined()
  })
})

describe('awayFromStreet', () => {
  it('pins as before when there is nothing to compare with', () => {
    expect(awayFromStreet(at(50_000), territory(), street())).toBe(false)
  })

  it('compares with the territory pin', () => {
    const pinned = territory({ coordinate: at(0) })
    expect(awayFromStreet(at(AWAY_METRES - 50), pinned, street())).toBe(false)
    expect(awayFromStreet(at(AWAY_METRES + 50), pinned, street())).toBe(true)
  })

  it('counts a fix inside a large outline as on the street', () => {
    const outline = [at(-3000, -3000), at(-3000, 3000), at(3000, 3000)]
    const big = territory({ outline, coordinate: at(-2900, 2900) })
    expect(awayFromStreet(at(-2000, 1000), big, street())).toBe(false)
    expect(awayFromStreet(at(5000, -5000), big, street())).toBe(true)
  })

  it("compares with this street's pinned doors and do-not-calls", () => {
    const pinned = street({ doors: [door({ coordinate: at(2000) })] })
    expect(awayFromStreet(at(2100), territory(), pinned)).toBe(false)
    expect(awayFromStreet(at(0), territory(), pinned)).toBe(true)
    const listed = territory({
      doNotCalls: [
        { id: 'n', address: '4 Oak', at: 0, streetId: 's1', coordinate: at(0) },
      ],
    })
    expect(awayFromStreet(at(100), listed, pinned)).toBe(false)
  })

  it("ignores the door's own old pin and other streets' pins", () => {
    const own = street({ doors: [door({ label: '7', coordinate: at(0) })] })
    expect(awayFromStreet(at(3000), territory(), own, '7')).toBe(false)
    const elsewhere = territory({
      doNotCalls: [
        { id: 'n', address: '4 Elm', at: 0, streetId: 's2', coordinate: at(0) },
      ],
    })
    expect(awayFromStreet(at(3000), elsewhere, street())).toBe(false)
  })
})

describe('door pins', () => {
  it('auto-pins a door once, from GPS', () => {
    const pinned = autoPinDoor(street({ doors: [door()] }), '1', at(0))
    expect(pinned.doors[0]).toMatchObject({
      coordinate: at(0),
      coordinateSource: 'gps',
    })
    expect(autoPinDoor(pinned, '1', at(500)).doors[0].coordinate).toEqual(at(0))
  })

  it('places, moves and removes a pin by hand', () => {
    const placed = setDoorPin(street({ doors: [door()] }), 'd1', at(10))
    expect(placed.doors[0]).toMatchObject({
      coordinate: at(10),
      coordinateSource: 'manual',
    })
    const removed = setDoorPin(placed, 'd1', undefined)
    expect(removed.doors[0].coordinate).toBeUndefined()
    expect(removed.doors[0].coordinateSource).toBeUndefined()
  })

  it("centres the map on the street's pins, then the territory", () => {
    expect(pinCentre(territory())).toBeUndefined()
    expect(pinCentre(territory({ coordinate: at(0) }))).toEqual(at(0))
    const doors = street({
      doors: [
        door({ coordinate: at(0) }),
        door({ id: 'd2', coordinate: at(200) }),
      ],
    })
    expect(
      pinCentre(territory({ coordinate: at(5000) }), doors)?.latitude
    ).toBeCloseTo(at(100).latitude, 6)
  })
})

describe('wholeYearsSince', () => {
  const day = (text: string) => new Date(text).getTime()

  it('counts only whole years', () => {
    expect(
      wholeYearsSince(day('2021-03-03T12:00'), day('2026-11-11T12:00'))
    ).toBe(5)
    expect(
      wholeYearsSince(day('2025-11-12T12:00'), day('2026-11-11T12:00'))
    ).toBe(0)
    expect(
      wholeYearsSince(day('2025-11-11T12:00'), day('2026-11-11T12:00'))
    ).toBe(1)
    expect(
      wholeYearsSince(day('2027-01-01T12:00'), day('2026-11-11T12:00'))
    ).toBe(0)
  })
})

describe('editing a do-not-call', () => {
  const now = new Date('2026-11-11T12:00').getTime()
  const old = new Date('2021-03-03T12:00').getTime()

  it('changes the date, address and pin of a typed entry', () => {
    const listed = territory({
      doNotCalls: [{ id: 'n', address: '9 Pine Road', at: now }],
    })
    const [entry] = territoryDoNotCalls(listed, format)
    expect(doNotCallField(listed, entry)).toEqual({
      field: 'address',
      text: '9 Pine Road',
    })
    const edited = editDoNotCall(
      listed,
      entry,
      { text: '11 Pine Road', at: old, coordinate: at(0) },
      now,
      format
    )
    expect(edited.doNotCalls[0]).toMatchObject({
      address: '11 Pine Road',
      at: old,
      coordinate: at(0),
    })
  })

  it('renumbers an entry on a numbered street', () => {
    const listed = territory({
      doNotCalls: [
        {
          id: 'n',
          address: '4 Oak Street',
          at: now,
          streetId: 's1',
          label: '4',
        },
      ],
    })
    const [entry] = territoryDoNotCalls(listed, format)
    expect(doNotCallField(listed, entry)).toEqual({
      field: 'number',
      text: '4',
    })
    const edited = editDoNotCall(
      listed,
      entry,
      { text: '6', at: now, coordinate: undefined },
      now,
      format
    )
    expect(edited.doNotCalls[0]).toMatchObject({
      label: '6',
      address: '6 Oak Street',
    })
  })

  it('edits the door behind a recorded do-not-call', () => {
    const recorded = territory({
      streets: [
        street({
          numbering: 'none',
          doors: [
            door({
              outcome: 'doNotCall',
              at: now,
              description: 'Blue gate',
              coordinate: at(0),
              coordinateSource: 'gps',
            }),
          ],
        }),
      ],
    })
    const [entry] = territoryDoNotCalls(recorded, format)
    expect(doNotCallField(recorded, entry)).toEqual({
      field: 'description',
      text: 'Blue gate',
    })
    const sameSpot = editDoNotCall(
      recorded,
      entry,
      { text: 'Green gate', at: old, coordinate: at(0) },
      now,
      format
    )
    expect(sameSpot.streets[0].doors[0]).toMatchObject({
      description: 'Green gate',
      at: old,
      coordinateSource: 'gps',
    })
    const moved = editDoNotCall(
      recorded,
      entry,
      { text: 'Green gate', at: old, coordinate: at(20) },
      now,
      format
    )
    expect(moved.streets[0].doors[0].coordinateSource).toBe('manual')
    expect(territoryDoNotCalls(moved, format)[0].address).toBe(
      'Green gate, Oak Street'
    )
  })

  it('never dates an entry in the future', () => {
    const listed = territory({
      doNotCalls: [{ id: 'n', address: '9 Pine Road', at: old }],
    })
    const [entry] = territoryDoNotCalls(listed, format)
    const edited = editDoNotCall(
      listed,
      entry,
      { text: '9 Pine Road', at: now + 86_400_000, coordinate: undefined },
      now,
      format
    )
    expect(edited.doNotCalls[0].at).toBe(now)
  })

  it('spots a house number already on the street', () => {
    const recorded = territory({
      streets: [street({ doors: [door({ id: 'd2', label: '8' })] })],
      doNotCalls: [
        {
          id: 'n',
          address: '4 Oak Street',
          at: now,
          streetId: 's1',
          label: '4',
        },
        { id: 'm', address: '10 Oak Street', at: now },
      ],
    })
    const entry = { id: 'n', streetId: 's1' }
    expect(doNotCallNumberTaken(recorded, entry, '8', format)).toBe(true)
    expect(doNotCallNumberTaken(recorded, entry, '10', format)).toBe(true)
    expect(doNotCallNumberTaken(recorded, entry, '4', format)).toBe(false)
    expect(doNotCallNumberTaken(recorded, entry, '6', format)).toBe(false)
  })
})

describe('saving where each door is', () => {
  it('is on for a street nobody chose for', () => {
    expect(savesDoorLocations({ numbering: 'both' })).toBe(true)
    expect(savesDoorLocations({ numbering: 'odd' })).toBe(true)
    expect(savesDoorLocations({ numbering: 'none' })).toBe(true)
  })

  it('stays off once turned off', () => {
    expect(
      savesDoorLocations({ numbering: 'both', saveLocations: false })
    ).toBe(false)
    expect(
      savesDoorLocations({ numbering: 'none', saveLocations: false })
    ).toBe(false)
  })

  it('stays on once turned on', () => {
    expect(savesDoorLocations({ numbering: 'even', saveLocations: true })).toBe(
      true
    )
  })
})

describe('doorPinState', () => {
  it('is on before location has been asked for', () => {
    expect(doorPinState({ on: true, access: 'ask', away: false })).toBe('on')
    expect(doorPinState({ on: true, access: null, away: false })).toBe('on')
  })

  it('needs attention when location is refused', () => {
    expect(doorPinState({ on: true, access: 'denied', away: false })).toBe(
      'denied'
    )
  })

  it('needs attention away from the street', () => {
    expect(doorPinState({ on: true, access: 'granted', away: true })).toBe(
      'away'
    )
  })

  it('is off when turned off, whatever location allows', () => {
    expect(doorPinState({ on: false, access: 'denied', away: true })).toBe(
      'off'
    )
  })
})
