import { ViewStyle } from 'react-native'

import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

type Props = {
  label: string
  /** Highlights a month whose status differs from the User's standing role. */
  isDifferent?: boolean
  onPress: () => void
  style?: ViewStyle
}

/** Chip showing a month's Publisher status; opens `MonthStatusSheet`. */
const MonthStatusButton = ({
  label,
  isDifferent = false,
  onPress,
  style,
}: Props) => {
  const theme = useTheme()

  return (
    <Button
      noTransform
      accessibilityRole='button'
      accessibilityLabel={i18n.t('monthStatus.editAccessibility', {
        status: label,
      })}
      onPress={onPress}
      style={{
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: isDifferent ? theme.colors.accent : theme.colors.border,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: isDifferent
          ? theme.colors.accentTranslucent
          : 'transparent',
        paddingHorizontal: 8,
        paddingVertical: 4,
        ...style,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: isDifferent ? theme.colors.accent : theme.colors.textAlt,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {label} ›
      </Text>
    </Button>
  )
}

export default MonthStatusButton
