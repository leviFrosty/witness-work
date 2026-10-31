import { describe, expect, it } from 'vitest'
import type { MileageRecord } from '@/lib/mileage/records'
import {
  mileageRecordData,
  sharedRecordFits,
  sharedTripFits,
} from '@/lib/mileage/sharedCar'
import { RECORD_PLAINTEXT_MAX_BYTES } from '@/lib/sharedSpaces/records'
import {
  readMileageRecord,
  unreadMileageFields,
} from '@/app/sharedCars/carRecords'
import type { Trip } from '@/types/mileage'
import type { SharedCarRecordKind } from '@/types/sharedCars'

const records: [SharedCarRecordKind, MileageRecord][] = [
  [
    'car',
    { id: 'car-1', name: 'Mazda', archived: true, createdAt: 1, updatedAt: 5 },
  ],
  ['fuel', { id: 'fuel-1', name: 'Gasoline', createdAt: 1, updatedAt: 5 }],
  [
    'price',
    {
      id: 'price-1',
      fuelId: 'fuel-1',
      effectiveFrom: '2026-01-01',
      pricePerGallon: 3.25,
      updatedAt: 5,
    },
  ],
  [
    'setup',
    {
      id: 'setup-1',
      vehicleId: 'car-1',
      effectiveFrom: '2026-01-01',
      fuelId: 'fuel-1',
      milesPerGallon: 31,
      updatedAt: 5,
    },
  ],
  [
    'trip',
    {
      id: 'trip-1',
      vehicleId: 'car-1',
      date: '2026-02-03',
      distanceMiles: 12.5,
      roundTrip: true,
      odometerStartMiles: 100,
      odometerEndMiles: 112.5,
      note: 'Territory',
      loggedBy: 'member-a',
      editedBy: 'member-b',
      createdAt: 2,
      updatedAt: 5,
    },
  ],
]

describe('mileage records on the wire', () => {
  it.each(records)('carry a %s and read it back unchanged', (kind, record) => {
    const data = mileageRecordData(record)
    expect(data).not.toHaveProperty('id')
    // Through JSON, as the sealed plaintext carries it.
    const sent = JSON.parse(JSON.stringify(data)) as Record<string, unknown>
    expect(readMileageRecord(kind, record.id, 5, sent)).toEqual(record)
  })

  it('take the stamp as updatedAt, whatever the data says', () => {
    const [, car] = records[0]
    const read = readMileageRecord('car', car.id, 99, {
      ...mileageRecordData(car),
      updatedAt: 1,
    })
    expect(read?.updatedAt).toBe(99)
  })

  it('drop fields this version does not know, and wrong types', () => {
    const read = readMileageRecord('trip', 'trip-1', 5, {
      vehicleId: 'car-1',
      date: '2026-02-03',
      distanceMiles: 3,
      createdAt: 1,
      future: 'field',
      roundTrip: 'yes',
      note: 7,
    })
    expect(read).toEqual({
      id: 'trip-1',
      vehicleId: 'car-1',
      date: '2026-02-03',
      distanceMiles: 3,
      createdAt: 1,
      updatedAt: 5,
    })
  })

  it("read a record that isn't one as nothing", () => {
    expect(readMileageRecord('trip', 't', 5, { date: '2026-02-03' })).toBeNull()
    expect(
      readMileageRecord('price', 'p', 5, {
        fuelId: 'f',
        effectiveFrom: 'soon',
        pricePerGallon: 3,
      })
    ).toBeNull()
    expect(
      readMileageRecord('car', 'c', 5, { name: 3, createdAt: 1 })
    ).toBeNull()
  })

  it('keep what this version can’t read, to send back', () => {
    const [, trip] = records[4]
    const read = (data: Record<string, unknown>) =>
      readMileageRecord('trip', trip.id, 5, data)!
    // A field a newer version added, and a known one in a newer format.
    const noteDoc = { v: 2, doc: { type: 'doc', content: [] }, textHash: 'h' }
    const data = { ...mileageRecordData(trip), future: { level: 2 }, noteDoc }
    expect(unreadMileageFields(data, read(data))).toEqual({
      future: { level: 2 },
      noteDoc,
    })
    const plain = mileageRecordData(trip)
    expect(unreadMileageFields(plain, read(plain))).toBeNull()
  })

  it('are never cut to fit: a trip says whether it fits, note and all', () => {
    const trip = records[4][1] as Trip
    expect(sharedTripFits(trip)).toBe(true)
    expect(sharedRecordFits('trip', mileageRecordData(trip))).toBe(true)
    const long = { ...trip, note: 'n'.repeat(RECORD_PLAINTEXT_MAX_BYTES) }
    expect(sharedTripFits(long)).toBe(false)
    expect(sharedRecordFits('trip', mileageRecordData(long))).toBe(false)
    // Room for who logged and edited it, whatever the trip says now.
    const { loggedBy: _l, editedBy: _e, ...unattributed } = trip
    let note = ''
    while (sharedTripFits({ ...unattributed, note: `${note}n` })) note += 'n'
    expect(
      sharedRecordFits(
        'trip',
        mileageRecordData({
          ...unattributed,
          note,
          loggedBy: 'x'.repeat(22),
          editedBy: 'y'.repeat(22),
        })
      )
    ).toBe(true)
  })
})
