import type {
  Fuel,
  FuelPrice,
  MileageCollections,
  MileageSnapshot,
  Trip,
  VehicleSetup,
} from '@/types/mileage'
import type { SharedCarSeeding } from '@/types/sharedCars'

/**
 * What sharing one of the User's own cars puts in its space
 * (docs/shared-cars-protocol.md, "Sharing a car"): the car, its fuel setups, a
 * copy of each fuel its setups name (new ids, with the setups pointed at the
 * copies) and their prices, and every trip, logged by the owner. The car,
 * setups and trips keep their ids and stamps, and move; the User's own fuels
 * stay, since other cars may use them. Pure, so a share that stopped part-way
 * builds the same records again.
 */

export type SeedRecords = {
  collections: MileageCollections
  /** The copies' ids, with any made for this build added. */
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
      // A setup naming a fuel that's gone keeps the id, as it does at home.
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
