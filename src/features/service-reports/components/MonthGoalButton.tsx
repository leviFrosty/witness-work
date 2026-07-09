import { ViewStyle } from 'react-native'

import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'

type Props = {
  goalHours: number
  isOverridden?: boolean
  onPress: () => void
  style?: ViewStyle
}

const MonthGoalButton = ({
  goalHours,
  isOverridden = false,
  onPress,
  style,
}: Props) => {
  const theme = useTheme()
  const goalDisplay = useFormattedMinutes(Math.round(goalHours * 60))
  const label = i18n.t('projectedTotal.legend.goal', {
    value: goalDisplay.formatted,
  })

  return (
    <Button
      noTransform
      accessibilityRole='button'
      accessibilityLabel={i18n.t('monthGoalEditor.editAccessibility', {
        goal: goalDisplay.formatted,
      })}
      onPress={onPress}
      style={{
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: isOverridden ? theme.colors.accent : theme.colors.border,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: isOverridden
          ? theme.colors.accentTranslucent
          : 'transparent',
        paddingHorizontal: 8,
        paddingVertical: 4,
        ...style,
      }}
    >
      <Text
        style={{
          color: isOverridden ? theme.colors.accent : theme.colors.textAlt,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {label} ›
      </Text>
    </Button>
  )
}

export default MonthGoalButton
