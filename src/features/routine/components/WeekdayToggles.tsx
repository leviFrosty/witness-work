import { Pressable, View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import {
  weekdayName,
  weekdayShort,
  weekOrder,
} from '@/features/routine/lib/weekdays'

export default function WeekdayToggles({
  days,
  onChange,
}: {
  days: readonly number[]
  onChange: (days: number[]) => void
}) {
  const theme = useTheme()
  const toggle = (day: number) =>
    onChange(
      days.includes(day)
        ? days.filter((other) => other !== day)
        : [...days, day].sort((a, b) => a - b)
    )
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 }}>
      {weekOrder().map((day) => {
        const on = days.includes(day)
        return (
          <Pressable
            key={day}
            onPress={() => toggle(day)}
            accessibilityRole='checkbox'
            accessibilityLabel={weekdayName(day)}
            accessibilityState={{ checked: on }}
            style={{
              flexGrow: 1,
              flexBasis: 44,
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.numbers.borderRadiusSm,
              borderWidth: 1,
              borderColor: on ? theme.colors.accent : theme.colors.border,
              backgroundColor: on
                ? theme.colors.accentTranslucent
                : 'transparent',
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
                color: on ? theme.colors.accent : theme.colors.text,
              }}
            >
              {weekdayShort(day)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
