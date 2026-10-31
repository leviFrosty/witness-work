import type {
  Fuel,
  FuelPrice,
  MileageSnapshot,
  MileageTombstone,
  MileageVehicle,
  MileageView,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'
import type { SharedCar } from '@/types/sharedCars'

/**
 * The one view of mileage (protocol "Client behaviour"): the User's own records
 * and every Shared Car's, merged into the collections the app already reads.
 * Live in `@/stores/mileageView`; pure here for tests.
 *
 * Ids are UUIDs, so a Shared Car's setups, fuels, and prices resolve against
 * each other in the combined collections (`buildMileageIndex`, `estimateTrip`)
 * as the User's own do, and only a record of the same kind can share an id.
 */

type WithId = { id: string }

/** Two lists with the same items, by identity, in the same order. */
const sameItems = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((item, i) => item === b[i])

/**
 * A cache of one result: asked again with the same inputs (by identity), it
 * returns the last result instead of building a new one. So an unchanged
 * collection keeps its array, and with it whatever is cached on that array
 * (`buildMileageIndex`) or compared by it (React's renders).
 */
export function lastResult<R>() {
  let last: { inputs: readonly unknown[]; result: R } | undefined
  return (inputs: readonly unknown[], build: () => R): R => {
    if (last && sameItems(last.inputs, inputs)) return last.result
    const result = build()
    last = { inputs, result }
    return result
  }
}

/**
 * `own` plus every space's records, leaving out a record of the User's own
 * whose id a space also holds (an older build's edit after the car was shared),
 * and any id a later space repeats. `own` itself when no space has records.
 */
function combine<T extends WithId>(own: T[], shared: readonly T[][]): T[] {
  if (shared.every((records) => records.length === 0)) return own
  const sharedIds = new Set<string>()
  const sharedRecords: T[] = []
  for (const records of shared) {
    for (const record of records) {
      if (sharedIds.has(record.id)) continue
      sharedIds.add(record.id)
      sharedRecords.push(record)
    }
  }
  return [
    ...own.filter((record) => !sharedIds.has(record.id)),
    ...sharedRecords,
  ]
}

const sharedVehicleLists = new WeakMap<
  readonly Vehicle[],
  { spaceId: string; vehicles: MileageVehicle[] }
>()

/** A space's car, marked with the space, cached by the space's array. */
function spaceVehicles(car: SharedCar): MileageVehicle[] {
  const cached = sharedVehicleLists.get(car.vehicles)
  if (cached?.spaceId === car.spaceId) return cached.vehicles
  const vehicles = car.vehicles.map((vehicle) => ({
    ...vehicle,
    spaceId: car.spaceId,
  }))
  sharedVehicleLists.set(car.vehicles, { spaceId: car.spaceId, vehicles })
  return vehicles
}

const recordSpacesCache = lastResult<ReadonlyMap<string, string>>()

/**
 * The space of every live record on a Shared Car, by id; the first space
 * holding an id wins, as in the view. Cached by the spaces' collections, so
 * neither sync bookkeeping nor a write to the User's own store rebuilds it.
 */
export function sharedRecordSpaces(
  cars: Readonly<Record<string, SharedCar>>
): ReadonlyMap<string, string> {
  const spaces = Object.values(cars)
  return recordSpacesCache(
    spaces.flatMap((car) => [
      car.spaceId,
      car.vehicles,
      car.fuels,
      car.fuelPrices,
      car.vehicleSetups,
      car.trips,
    ]),
    () => {
      const index = new Map<string, string>()
      for (const car of spaces) {
        for (const records of [
          car.vehicles,
          car.fuels,
          car.fuelPrices,
          car.vehicleSetups,
          car.trips,
        ] as WithId[][]) {
          for (const { id } of records)
            if (!index.has(id)) index.set(id, car.spaceId)
        }
      }
      return index
    }
  )
}

const vehiclesCache = lastResult<MileageVehicle[]>()
const fuelsCache = lastResult<Fuel[]>()
const fuelPricesCache = lastResult<FuelPrice[]>()
const vehicleSetupsCache = lastResult<VehicleSetup[]>()
const tripsCache = lastResult<Trip[]>()
const tombstonesCache = lastResult<MileageTombstone[]>()
const viewCache = lastResult<MileageView>()

/** Combines one collection, keeping the last result while its inputs hold. */
function combined<T extends WithId>(
  cache: (inputs: readonly unknown[], build: () => T[]) => T[],
  own: T[],
  shared: T[][]
): T[] {
  return cache([own, ...shared], () => combine(own, shared))
}

/**
 * Cars in the order they were added, so a car keeps its place, and its color in
 * charts, when it's shared. The User's own array when nothing was shared.
 */
function inAddedOrder(
  vehicles: MileageVehicle[],
  own: MileageVehicle[]
): MileageVehicle[] {
  if (vehicles === own) return own
  return vehicles
    .map((vehicle, position) => ({ vehicle, position }))
    .sort(
      (a, b) =>
        a.vehicle.createdAt - b.vehicle.createdAt || a.position - b.position
    )
    .map(({ vehicle }) => vehicle)
}

/**
 * The User's own mileage and every Shared Car's as one set of collections. Cars
 * are in the order they were added, shared or not. With no Shared Cars, each
 * collection is the User's own array. Cached by the collections' arrays, so
 * callers can build it on every render.
 */
export function buildMileageView(
  own: MileageSnapshot,
  cars: Readonly<Record<string, SharedCar>>
): MileageView {
  const spaces = Object.values(cars)
  const sharedVehicles = spaces.map(spaceVehicles)
  const vehicles = vehiclesCache([own.vehicles, ...sharedVehicles], () =>
    inAddedOrder(combine(own.vehicles, sharedVehicles), own.vehicles)
  )
  const fuels = combined(
    fuelsCache,
    own.fuels,
    spaces.map((car) => car.fuels)
  )
  const fuelPrices = combined(
    fuelPricesCache,
    own.fuelPrices,
    spaces.map((car) => car.fuelPrices)
  )
  const vehicleSetups = combined(
    vehicleSetupsCache,
    own.vehicleSetups,
    spaces.map((car) => car.vehicleSetups)
  )
  const trips = combined(
    tripsCache,
    own.trips,
    spaces.map((car) => car.trips)
  )
  const sharedTombstones = spaces
    .map((car) => car.deletedMileageRecords)
    .filter((tombstones) => tombstones.length > 0)
  const deletedMileageRecords = tombstonesCache(
    [own.deletedMileageRecords, ...sharedTombstones],
    () =>
      sharedTombstones.length === 0
        ? own.deletedMileageRecords
        : [own.deletedMileageRecords, ...sharedTombstones].flat()
  )
  const recordSpaces = sharedRecordSpaces(cars)
  return viewCache(
    [
      vehicles,
      fuels,
      fuelPrices,
      vehicleSetups,
      trips,
      deletedMileageRecords,
      recordSpaces,
    ],
    () => ({
      vehicles,
      fuels,
      fuelPrices,
      vehicleSetups,
      trips,
      deletedMileageRecords,
      sharedRecordSpaces: recordSpaces,
    })
  )
}

/**
 * The fuels a car's setups can name: a Shared Car's own fuels, or for one of
 * the User's own cars (or a car not saved yet) the User's own fuels.
 */
export function fuelsForVehicle(
  view: Pick<MileageView, 'fuels' | 'sharedRecordSpaces'>,
  vehicleId?: string
): Fuel[] {
  if (view.sharedRecordSpaces.size === 0) return view.fuels
  const spaceId =
    vehicleId === undefined ? undefined : view.sharedRecordSpaces.get(vehicleId)
  return view.fuels.filter(
    (fuel) => view.sharedRecordSpaces.get(fuel.id) === spaceId
  )
}
