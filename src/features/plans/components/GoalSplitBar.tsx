import { View } from 'react-native'
import StripedFill from '@/components/ui/StripedFill'
import useTheme from '@/contexts/theme'

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
      {plannedShare > 0 && (
        <View style={{ width: `${plannedShare * 100}%`, height: '100%' }}>
          <StripedFill
            key={plannedShare}
            color={theme.colors.accent}
            size={4}
            strokeWidth={1.5}
          />
        </View>
      )}
    </View>
  )
}
