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

export default function usePetWindow(window: RoomWindow): ResolvedWindow {
  const { now } = useNow()
  const formatRegion = usePreferences((s) => s.formatRegion)
  return resolveWindow(
    window,
    new Date(now),
    petRegionCode(formatRegion, deviceRegion())
  )
}
