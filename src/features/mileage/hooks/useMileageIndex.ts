import useMileage from '@/stores/mileage'
import { buildMileageIndex } from '@/lib/mileage/calc'

/** Sorted fuel price and car setup histories, cached per store write. */
export default function useMileageIndex() {
  const vehicleSetups = useMileage((s) => s.vehicleSetups)
  const fuelPrices = useMileage((s) => s.fuelPrices)
  return buildMileageIndex(vehicleSetups, fuelPrices)
}
