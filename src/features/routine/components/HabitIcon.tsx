import { View } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import type { RoutineHabit } from '@/types/routine'
import { HABIT_ICONS } from '@/features/routine/lib/habitIcons'

export default function HabitIcon({
  habit,
  size = 36,
  muted = false,
}: {
  habit: RoutineHabit
  size?: number
  muted?: boolean
}) {
  const theme = useTheme()
  return (
    <View
      accessible={false}
      importantForAccessibility='no-hide-descendants'
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: muted
          ? theme.colors.backgroundLighter
          : theme.colors.accentTranslucent,
      }}
    >
      <LucideIcon
        icon={HABIT_ICONS[habit]}
        size={Math.round(size / 2)}
        color={muted ? theme.colors.textAlt : theme.colors.accent}
      />
    </View>
  )
}
