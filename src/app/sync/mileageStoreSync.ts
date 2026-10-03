import useMileage from '@/stores/mileage'
import type { MileageSnapshot } from '@/types/mileage'

/** The local mileage store's synced fields. */
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

/** Writes a merged or restored snapshot back, preserving its stamps verbatim. */
export function applyMileageSnapshot(snapshot: MileageSnapshot): void {
  useMileage.setState({
    vehicles: snapshot.vehicles,
    fuels: snapshot.fuels,
    fuelPrices: snapshot.fuelPrices,
    vehicleSetups: snapshot.vehicleSetups,
    trips: snapshot.trips,
    deletedMileageRecords: snapshot.deletedMileageRecords,
  })
}

export function hasMileageData(): boolean {
  return Object.values(localMileageSnapshot()).some((list) => list.length > 0)
}
