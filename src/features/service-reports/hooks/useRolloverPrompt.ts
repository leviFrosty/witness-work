import { useEffect } from 'react'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import type { RootStackNavigation } from '@/types/rootStack'
import { useRollover } from '@/features/service-reports/hooks/useRollover'
import useICloudPullSettled from '@/hooks/useICloudPullSettled'

const prompted = new Set<string>()

export function forgetRolloverPrompts() {
  prompted.clear()
}

export default function useRolloverPrompt(forMonth?: {
  month: number
  year: number
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const focused = useIsFocused()
  const { pending, markerKey, apply, autoEnabled } = useRollover()

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
