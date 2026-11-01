import type {
  Fuel,
  FuelPrice,
  MileageCollections,
  MileageSnapshot,
  Trip,
  VehicleSetup,
} from '@/types/mileage'
import type { SharedCarSeeding } from '@/types/sharedCars'

export type SeedRecords = {
  collections: MileageCollections

  fuelCopies: Record<string, string>
  priceCopies: Record<string, string>
}

export function buildSeed(
  personal: MileageSnapshot,
  seeding: Pick<SharedCarSeeding, 'vehicleId' | 'fuelCopies' | 'priceCopies'>,
  ownerId: string,
  newId: () => string
): SeedRecords | null {
  const vehicle = personal.vehicles.find((v) => v.id === seeding.vehicleId)
  if (!vehicle) return null
  const fuelCopies = { ...seeding.fuelCopies }
  const priceCopies = { ...seeding.priceCopies }
  const ownFuels = new Map(personal.fuels.map((fuel) => [fuel.id, fuel]))

  const setups: VehicleSetup[] = personal.vehicleSetups
    .filter((setup) => setup.vehicleId === vehicle.id)
    .map((setup) => {
      if (!setup.fuelId || !ownFuels.has(setup.fuelId)) return setup
      fuelCopies[setup.fuelId] ??= newId()
      return { ...setup, fuelId: fuelCopies[setup.fuelId] }
    })

  const named = new Set(
    personal.vehicleSetups
      .filter((setup) => setup.vehicleId === vehicle.id && setup.fuelId)
      .map((setup) => setup.fuelId!)
  )
  const fuels: Fuel[] = personal.fuels
    .filter((fuel) => named.has(fuel.id))
    .map((fuel) => ({ ...fuel, id: fuelCopies[fuel.id] }))
  const fuelPrices: FuelPrice[] = personal.fuelPrices
    .filter((price) => named.has(price.fuelId))
    .map((price) => {
      priceCopies[price.id] ??= newId()
      return {
        ...price,
        id: priceCopies[price.id],
        fuelId: fuelCopies[price.fuelId],
      }
    })

  const trips: Trip[] = personal.trips
    .filter((trip) => trip.vehicleId === vehicle.id)
    .map(({ editedBy: _editedBy, ...trip }) => ({ ...trip, loggedBy: ownerId }))

  return {
    collections: {
      vehicles: [vehicle],
      vehicleSetups: setups,
      fuels,
      fuelPrices,
      trips,
    },
    fuelCopies,
    priceCopies,
  }
}
