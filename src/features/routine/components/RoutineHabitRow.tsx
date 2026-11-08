import { View } from 'react-native'
import {
  Circle as CircleIcon,
  CircleCheck as CircleCheckIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RoutineHabit } from '@/types/routine'
import HabitIcon from '@/features/routine/components/HabitIcon'

export default function RoutineHabitRow({
  habit,
  label,
  detail,
  done,
  onToggle,
  testID,
}: {
  habit: RoutineHabit
  label: string
  detail?: string
  done: boolean
  onToggle: () => void
  testID?: string
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onToggle}
      testID={testID}
      accessibilityRole='checkbox'
      accessibilityState={{ checked: done }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityHint={i18n.t(
        done ? 'routine.home.uncheckHint' : 'routine.home.checkHint'
      )}
      style={{
        minHeight: MIN_TOUCH_TARGET + 8,
        paddingHorizontal: 20,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <HabitIcon habit={habit} muted={done} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: done ? theme.colors.textAlt : theme.colors.text,
          }}
        >
          {label}
        </Text>
        {detail ? (
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      <LucideIcon
        icon={done ? CircleCheckIcon : CircleIcon}
        size={26}
        color={done ? theme.colors.accent : theme.colors.textAlt}
      />
    </Button>
  )
}
