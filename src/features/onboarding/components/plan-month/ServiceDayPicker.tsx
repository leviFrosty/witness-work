import { Pressable, View } from 'react-native'
import Text from '@/components/ui/MyText'
import PointerHover from '@/components/ui/PointerHover'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { orderedWeekdays } from '@/features/onboarding/lib/planMonth'

const WEEKDAY_KEYS: readonly TranslationKey[] = [
  'availability.weekday.sun',
  'availability.weekday.mon',
  'availability.weekday.tue',
  'availability.weekday.wed',
  'availability.weekday.thu',
  'availability.weekday.fri',
  'availability.weekday.sat',
]

type Props = {
  selected: readonly number[]
  startOfWeek: number
  onToggle: (weekday: number) => void
}

/** One chip per weekday, in Start of Week order. */
const ServiceDayPicker = ({ selected, startOfWeek, onToggle }: Props) => {
  const theme = useTheme()

  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {orderedWeekdays(startOfWeek).map((weekday) => {
        const isSelected = selected.includes(weekday)
        return (
          <PointerHover key={weekday} effect='highlight'>
            <Pressable
              onPress={() => onToggle(weekday)}
              accessibilityRole='checkbox'
              accessibilityState={{ checked: isSelected }}
              style={{
                flex: 1,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.numbers.borderRadiusSm,
                borderWidth: 1,
                borderColor: isSelected
                  ? theme.colors.accent
                  : theme.colors.border,
                backgroundColor: isSelected
                  ? theme.colors.accent
                  : theme.colors.card,
              }}
            >
              <Text
                adjustsFontSizeToFit
                numberOfLines={1}
                style={{
                  fontSize: theme.fontSize('sm'),
                  fontFamily: theme.fonts.semiBold,
                  color: isSelected
                    ? theme.colors.textInverse
                    : theme.colors.text,
                }}
              >
                {i18n.t(WEEKDAY_KEYS[weekday])}
              </Text>
            </Pressable>
          </PointerHover>
        )
      })}
    </View>
  )
}

export default ServiceDayPicker
