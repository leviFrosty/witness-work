import { copyRecordId } from '@/lib/sharedSpaces/crypto'
import type { MileageSnapshot } from '@/types/mileage'
import type { SharedCar } from '@/types/sharedCars'

/**
 * The personal copy a person keeps of a Shared Car when they leave, are
 * removed, or it stops being shared (docs/shared-cars-protocol.md, "Personal
 * copy"): the car, its setups, fuels, prices, every trip (others' too) and its
 * deletions, as of the last sync, under new ids `uuid(SHA-256(
 * "ww-spaces/v1/copy|" + spaceId + "|" + joinedAt + "|" + id))`. References
 * between them follow the new ids, and every record and tombstone keeps its
 * stamp, so each of the person's devices makes identical records, which
 * personal sync merges into one copy. A deletion one device synced and another
 * didn't still wins there, because the copies carry it.
 */

/** When this User joined the car, as the server listed it. */
export function myJoinedAt(car: SharedCar): number {
  return (
    car.spaceMembers.find((m) => m.memberId === car.myMemberId)?.joinedAt ??
    car.memberRecords.find((m) => m.memberId === car.myMemberId)?.joinedAt ??
    0
  )
}

export function personalCopy(
  car: SharedCar,
  joinedAt: number
): MileageSnapshot {
  const copied = (id: string) => copyRecordId(car.spaceId, joinedAt, id)
  const carIds = new Set(car.vehicles.map((vehicle) => vehicle.id))
  const fuelIds = new Set(car.fuels.map((fuel) => fuel.id))
  // A fuel deleted on the car is still the car's: its prices and setups
  // follow it under the copy's id.
  for (const tombstone of car.deletedMileageRecords)
    if (tombstone.kind === 'fuel') fuelIds.add(tombstone.id)
  const vehicleRef = (id: string) => (carIds.has(id) ? copied(id) : id)
  const fuelRef = (id: string) => (fuelIds.has(id) ? copied(id) : id)
  return {
    vehicles: car.vehicles.map((vehicle) => ({
      ...vehicle,
      id: copied(vehicle.id),
    })),
    fuels: car.fuels.map((fuel) => ({ ...fuel, id: copied(fuel.id) })),
    fuelPrices: car.fuelPrices.map((price) => ({
      ...price,
      id: copied(price.id),
      fuelId: fuelRef(price.fuelId),
    })),
    vehicleSetups: car.vehicleSetups.map((setup) => ({
      ...setup,
      id: copied(setup.id),
      vehicleId: vehicleRef(setup.vehicleId),
      ...(setup.fuelId !== undefined && { fuelId: fuelRef(setup.fuelId) }),
    })),
    // The User's own trips carry no one's member id.
    trips: car.trips.map(
      ({ loggedBy: _loggedBy, editedBy: _editedBy, ...trip }) => ({
        ...trip,
        id: copied(trip.id),
        vehicleId: vehicleRef(trip.vehicleId),
      })
    ),
    deletedMileageRecords: car.deletedMileageRecords.map((tombstone) => ({
      id: copied(tombstone.id),
      deletedAt: tombstone.deletedAt,
    })),
  }
}

/** Whether a copy holds anything worth adding: a record or a deletion. */
export const hasRecords = (copy: MileageSnapshot) =>
  Object.values(copy).some((records) => records.length > 0)
