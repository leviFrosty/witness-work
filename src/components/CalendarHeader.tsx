import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/MyText'
import i18n from '@/lib/locales'
import Button from '@/components/Button'
import XView from '@/components/layout/XView'

export type CalendarViewMode = 'planned' | 'actual'

type CalendarHeaderProps = {
  viewMode?: CalendarViewMode
  onChangeViewMode?: (mode: CalendarViewMode) => void
}

export default function CalendarHeader({
  viewMode,
  onChangeViewMode,
}: CalendarHeaderProps) {
  const theme = useTheme()
  const showToggle = !!viewMode && !!onChangeViewMode

  return (
    <XView
      style={{
        justifyContent: 'space-between',
        paddingBottom: 10,
        gap: 10,
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('xl'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {i18n.t('schedule')}
      </Text>
      {showToggle && (
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.colors.background,
            borderRadius: theme.numbers.borderRadiusSm,
            padding: 2,
          }}
        >
          {(['planned', 'actual'] as const).map((mode) => {
            const selected = viewMode === mode
            return (
              <Button
                key={mode}
                noTransform
                onPress={() => onChangeViewMode(mode)}
                style={{
                  backgroundColor: selected
                    ? theme.colors.accent
                    : 'transparent',
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: theme.numbers.borderRadiusSm,
                }}
              >
                <Text
                  style={{
                    color: selected
                      ? theme.colors.textInverse
                      : theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t(mode)}
                </Text>
              </Button>
            )
          })}
        </View>
      )}
    </XView>
  )
}
