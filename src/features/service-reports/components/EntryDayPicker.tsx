import { useState } from 'react'
import { Keyboard, Platform, View } from 'react-native'
import moment from 'moment'
import { CalendarDays as CalendarDaysIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { useCardStyle } from '@/components/ui/Card'
import DateTimePicker, { DateTimeDialog } from '@/components/ui/DateTimePicker'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PickerSheet from '@/components/ui/PickerSheet'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import {
  formatDate,
  formatDisplay,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'
import { calendarDaysBetween, localDayKey } from '@/lib/normalizeDate'
import { formatPlainNumber } from '@/lib/numbers'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import useReadableAccent from '@/features/service-reports/hooks/useReadableAccent'
import {
  entryDayCount,
  entryDays,
  loggedMinutesOnDays,
} from '@/features/service-reports/lib/entryDays'

export type DateInputMethod = 'day' | 'calendar'

const CELL_HEIGHT = 60
const STRIP_PADDING = 6

const dayLabel = (date: Date, today: Date) => {
  const day = moment(date)
  const fromToday = calendarDaysBetween(today, date)
  if (fromToday === 0) {
    return `${i18n.t('today')} · ${formatWeekdayMonthDayCompact(day)}`
  }
  if (fromToday === 1) {
    return `${i18n.t('tomorrow')} · ${formatWeekdayMonthDayCompact(day)}`
  }
  if (fromToday === -1) {
    return `${i18n.t('yesterday')} · ${formatWeekdayMonthDayCompact(day)}`
  }
  if (day.isSame(today, 'year')) return formatWeekdayMonthDayCompact(day)
  return formatDate(day, { style: 'medium' })
}

const onDay = (base: Date, picked: Date) => {
  const next = new Date(base)
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
  return next
}

const EntryDayPicker = (props: {
  date: Date
  setDate: (date: Date, method: DateInputMethod) => void
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const format = usePreferences((s) => s.timeDisplayFormat)
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState(props.date)
  const [width, setWidth] = useState(0)

  const today = new Date()
  const days = entryDays(
    props.date,
    today,
    entryDayCount(width, MIN_TOUCH_TARGET)
  )
  const logged = loggedMinutesOnDays(serviceReports, days)
  const selectedKey = localDayKey(props.date)
  const todayKey = localDayKey(today)
  const loggedColor = useReadableAccent()

  const open = () => {
    Keyboard.dismiss()
    setDraft(props.date)
    setPicking(true)
  }

  return (
    <View style={{ ...cardStyle, shadowOpacity: 0 }}>
      <Button
        noTransform
        onPress={open}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('date')}
        accessibilityValue={{ text: dayLabel(props.date, today) }}
        accessibilityHint={i18n.t('timeForm_otherDateHint')}
        testID='time-entry-date-row'
        style={{
          minHeight: MIN_TOUCH_TARGET,
          paddingStart: 16,
          paddingEnd: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
          }}
        >
          {dayLabel(props.date, today)}
        </Text>
        <LucideIcon
          icon={CalendarDaysIcon}
          size={20}
          color={theme.colors.textAlt}
        />
      </Button>
      <View
        accessibilityRole='radiogroup'
        onLayout={(event) =>
          setWidth(event.nativeEvent.layout.width - STRIP_PADDING * 2)
        }
        style={{
          flexDirection: 'row',
          paddingHorizontal: STRIP_PADDING,
          paddingBottom: STRIP_PADDING,
        }}
      >
        {days.map((day) => {
          const key = localDayKey(day)
          const selected = key === selectedKey
          const minutes = logged.get(key) ?? 0
          return (
            <Button
              key={key}
              noTransform
              onPress={() => props.setDate(onDay(props.date, day), 'day')}
              accessibilityRole='radio'
              accessibilityLabel={dayLabel(day, today)}
              accessibilityValue={{
                text: minutes
                  ? i18n.t('timeForm_dayLogged', {
                      value: formatMinutes(minutes, format).formatted,
                    })
                  : i18n.t('timeForm_noTimeLogged'),
              }}
              accessibilityState={{ selected, checked: selected }}
              testID={`time-entry-day-${key}`}
              style={{
                flex: 1,
                height: CELL_HEIGHT,
                borderRadius: theme.numbers.borderRadiusMd,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                backgroundColor: selected
                  ? theme.colors.accentTranslucent
                  : 'transparent',
                borderWidth: 1.5,
                borderColor: selected ? theme.colors.accent : 'transparent',
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontFamily:
                    key === todayKey ? theme.fonts.bold : theme.fonts.medium,
                  color:
                    selected || key === todayKey
                      ? theme.colors.text
                      : theme.colors.textAlt,
                }}
              >
                {formatDisplay(day, 'ddd')}
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  lineHeight: 22,
                  fontFamily: selected
                    ? theme.fonts.bold
                    : theme.fonts.semiBold,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatPlainNumber(day.getDate())}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  lineHeight: 14,
                  minHeight: 14,
                  fontFamily: theme.fonts.semiBold,
                  color: loggedColor,
                }}
              >
                {formatMinutesCompact(minutes)}
              </Text>
            </Button>
          )
        })}
      </View>
      {Platform.select({ android: true, ios: false, web: false }) ? (
        picking && (
          <DateTimeDialog
            part='date'
            value={props.date}
            onPick={(picked) => {
              setPicking(false)
              props.setDate(onDay(props.date, picked), 'calendar')
            }}
            onDismiss={() => setPicking(false)}
          />
        )
      ) : (
        <PickerSheet
          open={picking}
          onCancel={() => setPicking(false)}
          onDone={() => {
            setPicking(false)
            props.setDate(onDay(props.date, draft), 'calendar')
          }}
          doneTestID='time-entry-date-done'
        >
          <View style={{ alignItems: 'center', paddingHorizontal: 8 }}>
            <DateTimePicker
              value={draft}
              display='inline'
              onChange={(_, picked) => picked && setDraft(picked)}
            />
          </View>
        </PickerSheet>
      )}
    </View>
  )
}

export default EntryDayPicker
