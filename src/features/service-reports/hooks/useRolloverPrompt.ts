import { useEffect } from 'react'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import type { RootStackNavigation } from '@/types/rootStack'
import { useRollover } from '@/features/service-reports/hooks/useRollover'
import useICloudPullSettled from '@/hooks/useICloudPullSettled'

/** Markers already brought up this session, so an undecided exit can't loop. */
const prompted = new Set<string>()

/**
 * Brings up a pending rollover where the User is looking at their numbers,
 * since it isn't shown at launch: on Progress, and before a Service Report for
 * the month it changes (pass that month). Once per month per session; the tray
 * item covers the rest.
 */
export default function useRolloverPrompt(forMonth?: {
  month: number
  year: number
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const focused = useIsFocused()
  const { pending, markerKey, apply, autoEnabled } = useRollover()
  // Opened right after launch, the screen holds off until iCloud has caught up
  // (see `HomeTabStack`), so it never offers what another device already did.
  const iCloudSettled = useICloudPullSettled()
  const due = pending.some(
    (source) =>
      !forMonth ||
      (source.sourceMonth === forMonth.month &&
        source.sourceYear === forMonth.year)
  )

  useEffect(() => {
    if (!focused || !iCloudSettled || !due || prompted.has(markerKey)) return
    prompted.add(markerKey)
    if (autoEnabled) apply()
    else navigation.navigate('Rollover')
  }, [focused, iCloudSettled, due, markerKey, autoEnabled, apply, navigation])
}
