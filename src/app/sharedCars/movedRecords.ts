import {
  MILEAGE_COLLECTIONS,
  type MileageCollection,
  type MileageRecord,
} from '@/lib/mileage/records'
import {
  attributedTrip,
  KIND_OF_COLLECTION,
  sharedRecordState,
  withPending,
} from '@/lib/mileage/sharedCar'
import { spaceKindOf } from '@/lib/sharedSpaces/records'
import type { MileageSnapshot, MileageTombstone, Trip } from '@/types/mileage'
import type { SharedCar, SharedCarTombstone } from '@/types/sharedCars'

type WithId = { id: string; updatedAt?: number; vehicleId?: string }

export type MovedRecords = {
  car: SharedCar

  tombstones: MileageTombstone[]
}

export function movePersonalRecords(
  car: SharedCar,
  personal: MileageSnapshot,
  stamp: (previous?: number) => number
): MovedRecords {
  const carVehicles = new Set(car.vehicles.map((vehicle) => vehicle.id))
  const tombstones: MileageTombstone[] = []
  const moved: { key: MileageCollection; record: WithId }[] = []
  const movedOff: SharedCarTombstone[] = []
  for (const key of MILEAGE_COLLECTIONS) {
    for (const record of personal[key] as WithId[]) {
      const state =
        spaceKindOf(record.id) === null
          ? sharedRecordState(car, record.id)
          : undefined
      const pointsHere =
        record.vehicleId !== undefined && carVehicles.has(record.vehicleId)
      if (!state && !pointsHere) continue
      if (state && (record.updatedAt ?? 0) <= state.stamp) {
        tombstones.push({ id: record.id, deletedAt: stamp(record.updatedAt) })
        continue
      }
      if (record.vehicleId !== undefined && !pointsHere) {
        if (state && !state.deleted)
          movedOff.push({
            id: record.id,
            deletedAt: stamp(state.stamp),
            kind: KIND_OF_COLLECTION[key],
          })
        continue
      }
      tombstones.push({ id: record.id, deletedAt: stamp(record.updatedAt) })
      moved.push({ key, record })
    }
  }
  if (moved.length === 0 && movedOff.length === 0) return { car, tombstones }

  const next: SharedCar = { ...car }
  const touched = new Set<string>()
  const byId = new Map<MileageCollection, Map<string, WithId>>()
  const collection = (key: MileageCollection) => {
    let records = byId.get(key)
    if (!records) {
      records = new Map((car[key] as WithId[]).map((r) => [r.id, r]))
      byId.set(key, records)
    }
    return records
  }
  for (const { key, record } of moved) {
    const placed =
      key === 'trips' ? attributedTrip(car, record as Trip) : record
    collection(key).set(record.id, placed)
    touched.add(record.id)
  }
  for (const tombstone of movedOff) {
    for (const key of MILEAGE_COLLECTIONS) collection(key).delete(tombstone.id)
    touched.add(tombstone.id)
  }
  for (const [key, records] of byId)
    Object.assign(next, { [key]: [...records.values()] as MileageRecord[] })
  next.deletedMileageRecords = [
    ...car.deletedMileageRecords.filter((t) => !touched.has(t.id)),
    ...movedOff,
  ]
  next.pendingPuts = withPending(car.pendingPuts, touched)
  return { car: next, tombstones }
}
