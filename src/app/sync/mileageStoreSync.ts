import useMileage from '@/stores/mileage'
import { addPremadeFuels } from '@/app/sync/premadeFuels'
import { hasOwnMileageRecords } from '@/lib/mileage/premadeFuels'
import type { MileageSnapshot } from '@/types/mileage'

export function localMileageSnapshot(): MileageSnapshot {
  const {
    vehicles,
    fuels,
    fuelPrices,
    vehicleSetups,
    trips,
    deletedMileageRecords,
  } = useMileage.getState()
  return {
    vehicles,
    fuels,
    fuelPrices,
    vehicleSetups,
    trips,
    deletedMileageRecords,
  }
}

export function applyMileageSnapshot(snapshot: MileageSnapshot): void {
  useMileage.setState({
    vehicles: snapshot.vehicles,
    fuels: snapshot.fuels,
    fuelPrices: snapshot.fuelPrices,
    vehicleSetups: snapshot.vehicleSetups,
    trips: snapshot.trips,
    deletedMileageRecords: snapshot.deletedMileageRecords,
  })
  addPremadeFuels()
}

export function hasMileageData(): boolean {
  return hasOwnMileageRecords(localMileageSnapshot())
}
