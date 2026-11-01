import { usePreferences } from '@/stores/preferences'
import { resolveStartOfWeek } from '@/lib/dates'
import { useShallow } from 'zustand/react/shallow'

export default function useStartOfWeek(): number {
  const { startOfWeek, formatRegion } = usePreferences(
    useShallow((s) => ({
      startOfWeek: s.startOfWeek,
      formatRegion: s.formatRegion,
    }))
  )
  return resolveStartOfWeek({ override: startOfWeek, region: formatRegion })
}
