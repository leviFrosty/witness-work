import useTheme from '../contexts/theme'
import { MarkerColors, usePreferences } from '../stores/preferences'

export function useMarkerColors() {
  const { mapKeyColors } = usePreferences()
  const theme = useTheme()

  const colors: MarkerColors = {
    noConversations: mapKeyColors?.noConversations ?? theme.colors.textAlt,
    longerThanAMonthAgo:
      mapKeyColors?.longerThanAMonthAgo ?? theme.colors.error,
    longerThanAWeekAgo: mapKeyColors?.longerThanAWeekAgo ?? theme.colors.warn,
    withinThePastWeek: mapKeyColors?.withinThePastWeek ?? theme.colors.accent,
  }

  return colors
}
