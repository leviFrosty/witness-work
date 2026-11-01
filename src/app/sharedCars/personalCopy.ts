import { copyRecordId } from '@/lib/sharedSpaces/crypto'
import type { MileageSnapshot } from '@/types/mileage'
import type { SharedCar } from '@/types/sharedCars'

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

export const hasRecords = (copy: MileageSnapshot) =>
  Object.values(copy).some((records) => records.length > 0)
