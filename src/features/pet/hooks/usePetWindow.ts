import { getLocales } from 'expo-localization'
import useNow from '@/hooks/useNow'
import { usePreferences } from '@/stores/preferences'
import type { RoomWindow } from '@/types/pet'
import {
  resolveWindow,
  type ResolvedWindow,
} from '@/features/pet/lib/liveWindow'
import { petRegionCode } from '@/features/pet/lib/region'

const deviceRegion = (): string | null => {
  try {
    return getLocales()[0]?.regionCode ?? null
  } catch {
    return null
  }
}

/**
 * The room window's time and season right now: the clock for a Live window, and
 * the Format Region's hemisphere for a Live season. Moves on every minute.
 */
export default function usePetWindow(window: RoomWindow): ResolvedWindow {
  const { now } = useNow()
  const formatRegion = usePreferences((s) => s.formatRegion)
  return resolveWindow(
    window,
    new Date(now),
    petRegionCode(formatRegion, deviceRegion())
  )
}
