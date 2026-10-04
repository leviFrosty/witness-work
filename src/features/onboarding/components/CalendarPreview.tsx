import moment from 'moment'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const HOURS = [9, 10, 11]
const ROW_HEIGHT = 44
/** Half the hour label's height: where its rule line sits in the row. */
const LINE_OFFSET = 8

/**
 * A mock day view: a follow-up sits beside a placeholder for the user's other
 * appointments. Purely presentational; nothing is written to the calendar.
 */
const CalendarPreview = () => {
  const theme = useTheme()
  const at = (hour: number) => moment().hour(hour).minute(0).format('LT')
  const block = {
    position: 'absolute' as const,
    left: 64,
    right: 0,
    borderRadius: theme.numbers.borderRadiusSm,
    paddingHorizontal: 10,
    justifyContent: 'center' as const,
  }

  return (
    <View
      accessibilityLabel={i18n.t('calendarFollowUpTitle')}
      style={{
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.backgroundLighter,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 14,
        gap: 10,
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 4,
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {moment().format('dddd, LL')}
      </Text>
      <View
        style={{ height: ROW_HEIGHT * (HOURS.length - 1) + LINE_OFFSET * 2 }}
      >
        {HOURS.map((hour, index) => (
          <View
            key={hour}
            style={{
              position: 'absolute',
              top: index * ROW_HEIGHT,
              left: 0,
              right: 0,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Text
              style={{
                width: 56,
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              }}
            >
              {at(hour)}
            </Text>
            <View
              style={{
                flex: 1,
                height: 1,
                backgroundColor: theme.colors.border,
              }}
            />
          </View>
        ))}
        <View
          style={{
            ...block,
            top: LINE_OFFSET + 2,
            height: ROW_HEIGHT - 4,
            backgroundColor: theme.colors.border,
            opacity: 0.6,
          }}
        />
        <View
          style={{
            ...block,
            top: ROW_HEIGHT + LINE_OFFSET + 2,
            height: ROW_HEIGHT - 4,
            backgroundColor: theme.colors.accentTranslucent,
            borderLeftWidth: 4,
            borderLeftColor: theme.colors.accent,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
            }}
          >
            {i18n.t('calendarFollowUpTitle')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {`${at(10)} – ${at(11)}`}
          </Text>
        </View>
      </View>
    </View>
  )
}

export default CalendarPreview
