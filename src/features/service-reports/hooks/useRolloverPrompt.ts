import { useEffect } from 'react'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import type { RootStackNavigation } from '@/types/rootStack'
import { useRollover } from '@/features/service-reports/hooks/useRollover'

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
  const due = pending.some(
    (source) =>
      !forMonth ||
      (source.sourceMonth === forMonth.month &&
        source.sourceYear === forMonth.year)
  )

  useEffect(() => {
    if (!focused || !due || prompted.has(markerKey)) return
    prompted.add(markerKey)
    if (autoEnabled) apply()
    else navigation.navigate('Rollover')
  }, [focused, due, markerKey, autoEnabled, apply, navigation])
}
