import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import {
  hasMileageMatch,
  matchFuel,
  matchRecord,
  matchVehicle,
  type MileageMatch,
} from '@/lib/mileage/records'
import { sharedRecordSpaces } from '@/lib/mileage/view'
import type {
  Fuel,
  FuelPrice,
  MileageVehicle,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'

/**
 * The one way to change mileage: each write goes to the store its car lives in,
 * a Shared Car's space in `@/stores/sharedCars` or the User's own
 * `@/stores/mileage` (protocol "Client behaviour"). Reads go through
 * `@/stores/mileageView`.
 *
 * A record moved to a car in another store (a trip given another car) leaves
 * its old store with a tombstone, so each id stays live in one store. A
 * deletion removes the record wherever it's live, including a copy of the
 * User's own that a Shared Car hides, which would otherwise show again.
 */

/** The space a record lives in, or `null` for the User's own store. */
type Home = string | null

const spaceOf = (id: string): Home =>
  sharedRecordSpaces(useSharedCars.getState().cars).get(id) ?? null

/**
 * Runs `remove` on every store with a record matching `match`, except the store
 * `except` names, and only where one matches: a deletion with nothing to delete
 * still notifies the store's subscribers (and Cloud Sync).
 */
function removeWherever(
  match: MileageMatch,
  remove: { own: () => void; shared: (spaceId: string) => void },
  except?: Home
): void {
  if (except !== null && hasMileageMatch(useMileage.getState(), match))
    remove.own()
  for (const car of Object.values(useSharedCars.getState().cars)) {
    if (car.spaceId !== except && hasMileageMatch(car, match))
      remove.shared(car.spaceId)
  }
}

const removeTrip = (id: string, except?: Home) =>
  removeWherever(
    matchRecord('trips', id),
    {
      own: () => useMileage.getState().deleteTrip(id),
      shared: (spaceId) => useSharedCars.getState().deleteTrip(spaceId, id),
    },
    except
  )

const removeVehicleSetup = (id: string, except?: Home) =>
  removeWherever(
    matchRecord('vehicleSetups', id),
    {
      own: () => useMileage.getState().deleteVehicleSetup(id),
      shared: (spaceId) =>
        useSharedCars.getState().deleteVehicleSetup(spaceId, id),
    },
    except
  )

const removeFuelPrice = (id: string, except?: Home) =>
  removeWherever(
    matchRecord('fuelPrices', id),
    {
      own: () => useMileage.getState().deleteFuelPrice(id),
      shared: (spaceId) =>
        useSharedCars.getState().deleteFuelPrice(spaceId, id),
    },
    except
  )

/** Saves a car where it lives; a new car is the User's own. */
export function saveVehicle(vehicle: Vehicle): void {
  // The view marks a Shared Car with its space; that isn't part of the record.
  const { spaceId: _spaceId, ...record } = vehicle as MileageVehicle
  const home = spaceOf(record.id)
  if (home === null) useMileage.getState().saveVehicle(record)
  else useSharedCars.getState().saveVehicle(home, record)
}

/** Deletes the car with its fuel setups and trips. */
export function deleteVehicle(id: string): void {
  removeWherever(matchVehicle(id), {
    own: () => useMileage.getState().deleteVehicle(id),
    shared: (spaceId) => useSharedCars.getState().deleteVehicle(spaceId, id),
  })
}

/** Saves a fuel setup to its car's store. */
export function saveVehicleSetup(setup: VehicleSetup): void {
  const home = spaceOf(setup.vehicleId)
  if (home === null) useMileage.getState().saveVehicleSetup(setup)
  else useSharedCars.getState().saveVehicleSetup(home, setup)
  removeVehicleSetup(setup.id, home)
}

export function deleteVehicleSetup(id: string): void {
  removeVehicleSetup(id)
}

/**
 * Saves a fuel where it lives. A new fuel made for a car (`vehicleId`, from the
 * car form) goes to that car's store; any other new fuel is the User's own.
 */
export function saveFuel(
  fuel: Fuel,
  { vehicleId }: { vehicleId?: string } = {}
): void {
  let home = spaceOf(fuel.id)
  if (
    home === null &&
    vehicleId !== undefined &&
    !hasMileageMatch(useMileage.getState(), matchRecord('fuels', fuel.id))
  )
    home = spaceOf(vehicleId)
  if (home === null) useMileage.getState().saveFuel(fuel)
  else useSharedCars.getState().saveFuel(home, fuel)
}

/**
 * Deletes the fuel and its prices. Car setups keep the dangling id and simply
 * stop producing an estimated cost.
 */
export function deleteFuel(id: string): void {
  removeWherever(matchFuel(id), {
    own: () => useMileage.getState().deleteFuel(id),
    shared: (spaceId) => useSharedCars.getState().deleteFuel(spaceId, id),
  })
}

/** Saves a fuel price to its fuel's store. */
export function saveFuelPrice(price: FuelPrice): void {
  const home = spaceOf(price.fuelId)
  if (home === null) useMileage.getState().saveFuelPrice(price)
  else useSharedCars.getState().saveFuelPrice(home, price)
  removeFuelPrice(price.id, home)
}

export function deleteFuelPrice(id: string): void {
  removeFuelPrice(id)
}

/**
 * Saves a trip to its car's store. On a Shared Car it records who logged it, or
 * who last edited it (`useSharedCars`' `saveTrip`); on the User's own car it
 * carries neither. Refused, returning false, when its car is in neither store
 * (deleted, or a Shared Car that ended, whose copy has another id): saved, it
 * would be a trip on no car.
 */
export function saveTrip(trip: Trip): boolean {
  const home = spaceOf(trip.vehicleId)
  if (home === null) {
    const own = useMileage.getState()
    if (!own.vehicles.some((vehicle) => vehicle.id === trip.vehicleId))
      return false
    const { loggedBy: _loggedBy, editedBy: _editedBy, ...record } = trip
    own.saveTrip(record)
  } else {
    useSharedCars.getState().saveTrip(home, trip)
  }
  removeTrip(trip.id, home)
  return true
}

export function deleteTrip(id: string): void {
  removeTrip(id)
}

/**
 * Deletes all of the User's own mileage, on every synced device. Shared Cars
 * stay: leaving one, with a copy kept, is part of their own lifecycle.
 */
export function deleteAllMileageData(): void {
  useMileage.getState().deleteAllMileageData()
}
