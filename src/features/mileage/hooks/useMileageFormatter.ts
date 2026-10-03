import { usePreferences } from '@/stores/preferences'
import {
  createMileageFormatter,
  resolveMileageUnits,
} from '@/features/mileage/lib/format'

/** Display helpers in the user's distance, fuel economy, and currency units. */
export default function useMileageFormatter() {
  const distanceUnit = usePreferences((s) => s.distanceUnit)
  const fuelEconomyUnit = usePreferences((s) => s.fuelEconomyUnit)
  return createMileageFormatter(
    resolveMileageUnits({ distanceUnit, fuelEconomyUnit })
  )
}
