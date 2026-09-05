import { useLocales } from 'expo-localization'
import { resolveMileageDistanceUnit } from '@/lib/mileage'
import { usePreferences } from '@/stores/preferences'

/**
 * Distance follows device measurement settings independently of date Format
 * Region.
 */
const useMileageUnit = () => {
  const preference = usePreferences((s) => s.mileageDistanceUnit)
  const locales = useLocales()
  return resolveMileageDistanceUnit(preference, locales[0]?.measurementSystem)
}

export default useMileageUnit
