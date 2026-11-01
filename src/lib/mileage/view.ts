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

type WithId = { id: string }

const sameItems = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((item, i) => item === b[i])

export function lastResult<R>() {
  let last: { inputs: readonly unknown[]; result: R } | undefined
  return (inputs: readonly unknown[], build: () => R): R => {
    if (last && sameItems(last.inputs, inputs)) return last.result
    const result = build()
    last = { inputs, result }
    return result
  }
}

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

function combined<T extends WithId>(
  cache: (inputs: readonly unknown[], build: () => T[]) => T[],
  own: T[],
  shared: T[][]
): T[] {
  return cache([own, ...shared], () => combine(own, shared))
}

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
