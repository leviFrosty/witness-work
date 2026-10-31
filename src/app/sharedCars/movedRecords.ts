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

/**
 * Records that belong to a Shared Car but sit in the User's own store
 * (docs/shared-cars-protocol.md, "One view", "Moved records"): an edit an older
 * build or an offline device made after the car was shared, which personal sync
 * brought here. The view hides a personal record whose id the car holds, so
 * left there it would be lost; one that points at the car but isn't on it would
 * show on this device only. Each sync moves them in, and an ending tombstones
 * them, so they neither vanish nor come back beside the copy.
 *
 * A personal record whose id is on the car, or that points at the car, goes:
 *
 * - Newer than the car's version (or new to the car): into the car, with its
 *   stamp, pending, and a trip attributed as one saved here;
 * - Newer, but moved to another car by an older build: deleted on the car, and
 *   kept as the User's own;
 * - Otherwise: tombstoned in the User's own store, past its stamp, since the
 *   car's version is newer.
 *
 * Personal deletions never move: sharing the car tombstoned every record it
 * took, just past their stamps, and those would delete the car's history. An
 * edit an offline device made before the share is newer than its tombstone, so
 * personal sync keeps it, and it moves in here.
 */

type WithId = { id: string; updatedAt?: number; vehicleId?: string }

export type MovedRecords = {
  /** The car with what moved in (and out), or itself when nothing did. */
  car: SharedCar
  /** Tombstones for the User's own store; empty when none. */
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
      // Only a space's own records have ids like `m.<memberId>`.
      const state =
        spaceKindOf(record.id) === null
          ? sharedRecordState(car, record.id)
          : undefined
      const pointsHere =
        record.vehicleId !== undefined && carVehicles.has(record.vehicleId)
      if (!state && !pointsHere) continue
      if (state && (record.updatedAt ?? 0) <= state.stamp) {
        // The car's version is newer.
        tombstones.push({ id: record.id, deletedAt: stamp(record.updatedAt) })
        continue
      }
      if (record.vehicleId !== undefined && !pointsHere) {
        // An older build moved it to another of the User's own cars: it's
        // theirs now, and off this one.
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
    // A trip is attributed as one saved here: logged by whoever logged the
    // car's version (or, new to the car, by the User), edited by the User.
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
