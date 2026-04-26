import { useMemo } from 'react'
import useTheme from '../contexts/theme'
import { MarkerColors, usePreferences } from '../stores/preferences'

export function useMarkerColors(): MarkerColors {
  const { mapKeyColors } = usePreferences()
  const theme = useTheme()

  // Stable identity so consumers that key memoisation off the returned object
  // (e.g. MapScreen's contactMarkers useMemo) don't recompute every render.
  return useMemo(
    () => ({
      noConversations: mapKeyColors?.noConversations ?? theme.colors.textAlt,
      longerThanAMonthAgo:
        mapKeyColors?.longerThanAMonthAgo ?? theme.colors.error,
      longerThanAWeekAgo: mapKeyColors?.longerThanAWeekAgo ?? theme.colors.warn,
      withinThePastWeek: mapKeyColors?.withinThePastWeek ?? theme.colors.accent,
    }),
    [
      mapKeyColors?.noConversations,
      mapKeyColors?.longerThanAMonthAgo,
      mapKeyColors?.longerThanAWeekAgo,
      mapKeyColors?.withinThePastWeek,
      theme.colors.textAlt,
      theme.colors.error,
      theme.colors.warn,
      theme.colors.accent,
    ]
  )
}
