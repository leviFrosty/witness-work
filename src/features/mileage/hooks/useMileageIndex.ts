import { useMileageView } from '@/stores/mileageView'
import { buildMileageIndex } from '@/lib/mileage/calc'

/** Sorted fuel price and car setup histories, cached per store write. */
export default function useMileageIndex() {
  const vehicleSetups = useMileageView((view) => view.vehicleSetups)
  const fuelPrices = useMileageView((view) => view.fuelPrices)
  return buildMileageIndex(vehicleSetups, fuelPrices)
}
