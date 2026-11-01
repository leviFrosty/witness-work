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

type Home = string | null

const spaceOf = (id: string): Home =>
  sharedRecordSpaces(useSharedCars.getState().cars).get(id) ?? null

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

export function saveVehicle(vehicle: Vehicle): void {
  const { spaceId: _spaceId, ...record } = vehicle as MileageVehicle
  const home = spaceOf(record.id)
  if (home === null) useMileage.getState().saveVehicle(record)
  else useSharedCars.getState().saveVehicle(home, record)
}

export function deleteVehicle(id: string): void {
  removeWherever(matchVehicle(id), {
    own: () => useMileage.getState().deleteVehicle(id),
    shared: (spaceId) => useSharedCars.getState().deleteVehicle(spaceId, id),
  })
}

export function saveVehicleSetup(setup: VehicleSetup): void {
  const home = spaceOf(setup.vehicleId)
  if (home === null) useMileage.getState().saveVehicleSetup(setup)
  else useSharedCars.getState().saveVehicleSetup(home, setup)
  removeVehicleSetup(setup.id, home)
}

export function deleteVehicleSetup(id: string): void {
  removeVehicleSetup(id)
}

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

export function deleteFuel(id: string): void {
  removeWherever(matchFuel(id), {
    own: () => useMileage.getState().deleteFuel(id),
    shared: (spaceId) => useSharedCars.getState().deleteFuel(spaceId, id),
  })
}

export function saveFuelPrice(price: FuelPrice): void {
  const home = spaceOf(price.fuelId)
  if (home === null) useMileage.getState().saveFuelPrice(price)
  else useSharedCars.getState().saveFuelPrice(home, price)
  removeFuelPrice(price.id, home)
}

export function deleteFuelPrice(id: string): void {
  removeFuelPrice(id)
}

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

export function deleteAllMileageData(): void {
  useMileage.getState().deleteAllMileageData()
}
