import { usePreferences } from '@/stores/preferences'
import { resolveStartOfWeek } from '@/lib/dates'

/**
 * Resolved Start of Week (0 = Sunday … 6 = Saturday) following the ADR 0006
 * precedence chain: explicit `startOfWeek` override → Format Region → device.
 * Use this instead of reading `preferences.startOfWeek` directly — that field
 * is `undefined` when set to Auto.
 */
export default function useStartOfWeek(): number {
  const { startOfWeek, formatRegion } = usePreferences()
  return resolveStartOfWeek({ override: startOfWeek, region: formatRegion })
}
