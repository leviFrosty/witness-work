import { usePreferences } from '@/stores/preferences'
import { resolveStartOfWeek } from '@/lib/dates'
import { useShallow } from 'zustand/react/shallow'

/**
 * Resolved Start of Week (0 = Sunday … 6 = Saturday) following the ADR 0006
 * precedence chain: explicit `startOfWeek` override → Format Region → device.
 * Use this instead of reading `preferences.startOfWeek` directly — that field
 * is `undefined` when set to Auto.
 */
export default function useStartOfWeek(): number {
  const { startOfWeek, formatRegion } = usePreferences(
    useShallow((s) => ({
      startOfWeek: s.startOfWeek,
      formatRegion: s.formatRegion,
    }))
  )
  return resolveStartOfWeek({ override: startOfWeek, region: formatRegion })
}
