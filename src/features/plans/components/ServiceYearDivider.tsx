import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export const SERVICE_YEAR_DIVIDER_HEIGHT = 56

/**
 * Where one Service Year ends and the next begins in the Schedule's week grid.
 * It's the one place the grid breaks, so crossing September reads as crossing
 * into a new year of reports and goals. Tapping it zooms out to that year.
 */
export default function ServiceYearDivider({
  serviceYear,
  onPress,
}: {
  serviceYear: number
  onPress: () => void
}) {
  const theme = useTheme()
  const label = i18n.t('scheduleCalendar.serviceYearRange', {
    start: serviceYear,
    end: serviceYear + 1,
  })
  const line = (
    <View
      style={{
        flex: 1,
        height: 2,
        borderRadius: 1,
        backgroundColor: theme.colors.accent,
        opacity: 0.6,
      }}
    />
  )

  return (
    <View
      style={{
        height: SERVICE_YEAR_DIVIDER_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 4,
      }}
    >
      {line}
      <Button
        onPress={onPress}
        accessibilityRole='button'
        accessibilityLabel={label}
        accessibilityHint={i18n.t('scheduleCalendar.serviceYearHint')}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 7,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentTranslucent,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('sm'),
            letterSpacing: 0.3,
          }}
        >
          {label}
        </Text>
      </Button>
      {line}
    </View>
  )
}
