import { View } from 'react-native'
import useTheme from '@/contexts/theme'

/**
 * Logged time (solid) then planned time (tinted) against a goal. Without a
 * goal, the bar splits the total between the two instead.
 */
export default function GoalSplitBar({
  goalMinutes,
  loggedMinutes,
  plannedMinutes,
  height = 6,
}: {
  goalMinutes: number
  loggedMinutes: number
  plannedMinutes: number
  height?: number
}) {
  const theme = useTheme()
  const scale = Math.max(goalMinutes, loggedMinutes + plannedMinutes, 1)
  const loggedShare = Math.min(1, Math.max(0, loggedMinutes) / scale)
  const plannedShare = Math.min(
    1 - loggedShare,
    Math.max(0, plannedMinutes) / scale
  )
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        overflow: 'hidden',
        flexDirection: 'row',
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          width: `${loggedShare * 100}%`,
          backgroundColor: theme.colors.accent,
        }}
      />
      <View
        style={{
          width: `${plannedShare * 100}%`,
          backgroundColor: theme.colors.accentAlt,
        }}
      />
    </View>
  )
}
