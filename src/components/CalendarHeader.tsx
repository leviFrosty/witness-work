import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import Button from '@/components/ui/Button'
import XView from '@/components/ui/layout/XView'

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
    <View style={{ paddingBottom: 10, gap: 6 }}>
      <XView
        style={{
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Text
          style={{
            flexShrink: 1,
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
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('tapDayToSchedule_description')}
      </Text>
    </View>
  )
}
