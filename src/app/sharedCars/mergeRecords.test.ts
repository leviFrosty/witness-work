import { describe, expect, it } from 'vitest'
import { emptySharedCar } from '@/lib/mileage/sharedCar'
import {
  createCarMerge,
  incomingWins,
  type OpenedRecord,
} from '@/app/sharedCars/mergeRecords'
import type { SharedCar } from '@/types/sharedCars'

/** `record` merged into `car` on its own: `car` itself when it didn't apply. */
function mergeRecord(car: SharedCar, record: OpenedRecord): SharedCar {
  const merge = createCarMerge(car)
  merge.apply(record)
  return merge.finish()
}

const spaceId = 'A'.repeat(22)
const memberId = 'B'.repeat(22)

const trip = (stamp: number, note = 'n') => ({
  recordId: 'trip-1',
  stamp,
  deleted: false,
  kind: 'trip',
  data: {
    vehicleId: 'car-1',
    date: '2026-02-03',
    distanceMiles: 3,
    note,
    createdAt: 1,
  },
})

const withTrip = (stamp: number, note = 'local', pending = false): SharedCar =>
  emptySharedCar(spaceId, {
    trips: [
      {
        id: 'trip-1',
        vehicleId: 'car-1',
        date: '2026-02-03',
        distanceMiles: 3,
        note,
        createdAt: 1,
        updatedAt: stamp,
      },
    ],
    pendingPuts: pending ? ['trip-1'] : [],
  })

describe('incomingWins', () => {
  it('takes the newer stamp, a deletion on a tie, then the server’s version', () => {
    expect(incomingWins(undefined, { stamp: 1, deleted: false })).toBe(true)
    expect(
      incomingWins({ stamp: 2, deleted: false }, { stamp: 1, deleted: true })
    ).toBe(false)
    expect(
      incomingWins({ stamp: 1, deleted: false }, { stamp: 2, deleted: false })
    ).toBe(true)
    expect(
      incomingWins({ stamp: 2, deleted: false }, { stamp: 2, deleted: true })
    ).toBe(true)
    expect(
      incomingWins({ stamp: 2, deleted: true }, { stamp: 2, deleted: false })
    ).toBe(false)
    expect(
      incomingWins({ stamp: 2, deleted: false }, { stamp: 2, deleted: false })
    ).toBe(true)
  })
})

describe('mergeRecord', () => {
  it('applies a newer version and drops the change it supersedes', () => {
    const merged = mergeRecord(withTrip(5, 'local', true), trip(6, 'theirs'))
    expect(merged.trips[0]).toMatchObject({ note: 'theirs', updatedAt: 6 })
    expect(merged.pendingPuts).toEqual([])
  })

  it('keeps a newer change made here, still pending', () => {
    const car = withTrip(7, 'local', true)
    expect(mergeRecord(car, trip(6, 'theirs'))).toBe(car)
  })

  it('lets a deletion win an equal stamp', () => {
    const merged = mergeRecord(withTrip(6), {
      recordId: 'trip-1',
      stamp: 6,
      deleted: true,
      kind: 'trip',
    })
    expect(merged.trips).toEqual([])
    expect(merged.deletedMileageRecords).toEqual([
      { id: 'trip-1', deletedAt: 6, kind: 'trip' },
    ])
  })

  it('brings a record back when its new version is newer than the deletion', () => {
    const deleted = emptySharedCar(spaceId, {
      deletedMileageRecords: [{ id: 'trip-1', deletedAt: 6, kind: 'trip' }],
    })
    const merged = mergeRecord(deleted, trip(7))
    expect(merged.trips).toHaveLength(1)
    expect(merged.deletedMileageRecords).toEqual([])
  })

  it('drops kinds it does not know, kinds that disagree with the id, and a second car', () => {
    const car = emptySharedCar(spaceId, {
      vehicles: [{ id: 'car-1', name: 'Mazda', createdAt: 1, updatedAt: 1 }],
    })
    expect(mergeRecord(car, { ...trip(2), kind: 'boat' })).toBe(car)
    expect(mergeRecord(car, { ...trip(2), recordId: `m.${memberId}` })).toBe(
      car
    )
    expect(
      mergeRecord(car, {
        recordId: 'car-2',
        stamp: 2,
        deleted: false,
        kind: 'car',
        data: { name: 'Other', createdAt: 1 },
      })
    ).toBe(car)
  })

  it('keeps member, invite and key chain records', () => {
    let car = emptySharedCar(spaceId)
    car = mergeRecord(car, {
      recordId: `m.${memberId}`,
      stamp: 3,
      deleted: false,
      kind: 'member',
      data: {
        name: 'Anna',
        dhPub: 'C'.repeat(43),
        tag: 'D'.repeat(22),
        joinedAt: 2,
      },
    })
    car = mergeRecord(car, {
      recordId: 'k.2',
      stamp: 4,
      deleted: false,
      kind: 'keys',
      data: { prev: 'E'.repeat(43) },
    })
    expect(car.memberRecords).toEqual([
      {
        memberId,
        name: 'Anna',
        tag: 'D'.repeat(22),
        joinedAt: 2,
        updatedAt: 3,
      },
    ])
    // An older build's key in the record is kept, to go back out with it.
    expect(car.extraFields).toEqual({
      [`m.${memberId}`]: { dhPub: 'C'.repeat(43) },
    })
    expect(car.keyRecords).toEqual([{ epoch: 2, stamp: 4 }])
    car = mergeRecord(car, {
      recordId: `m.${memberId}`,
      stamp: 5,
      deleted: true,
      kind: 'member',
    })
    expect(car.memberRecords).toEqual([])
    expect(car.deletedSpaceRecords).toEqual([
      { id: `m.${memberId}`, deletedAt: 5 },
    ])
    expect(car.extraFields).toEqual({})
  })
})

describe('createCarMerge', () => {
  it('says which records a newer version could use, and keeps their unknown fields', () => {
    const merge = createCarMerge(emptySharedCar(spaceId))
    expect(merge.apply({ ...trip(2), kind: 'boat' })).toBe('unusable')
    expect(merge.apply({ ...trip(2), data: { date: 'soon' } })).toBe('unusable')
    expect(
      merge.apply({ ...trip(3), data: { ...trip(3).data, mood: 'sunny' } })
    ).toBe('applied')
    expect(merge.apply(trip(1))).toBe('kept')
    const car = merge.finish()
    expect(car.trips).toHaveLength(1)
    expect(car.extraFields).toEqual({ 'trip-1': { mood: 'sunny' } })
  })

  it('merges thousands of records in one pass', () => {
    const merge = createCarMerge(emptySharedCar(spaceId))
    const started = performance.now()
    for (let n = 0; n < 20_000; n++)
      merge.apply({ ...trip(n + 1), recordId: `trip-${n}` })
    const car = merge.finish()
    expect(car.trips).toHaveLength(20_000)
    // Linear: well under a second, where a list search per record takes many.
    expect(performance.now() - started).toBeLessThan(1500)
  })
})
