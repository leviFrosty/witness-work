import { useState } from 'react'
import { Keyboard, Platform, View } from 'react-native'
import moment from 'moment'
import { CalendarDays as CalendarDaysIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import DateTimePicker, { DateTimeDialog } from '@/components/ui/DateTimePicker'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PickerSheet from '@/components/ui/PickerSheet'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import { formatDate, formatWeekdayMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { calendarDaysBetween } from '@/lib/normalizeDate'

const dayLabel = (date: Date) => {
  const day = moment(date)
  const today = new Date()
  const fromToday = calendarDaysBetween(today, date)
  if (fromToday === 0) {
    return `${i18n.t('today')} · ${formatWeekdayMonthDayCompact(day)}`
  }
  if (fromToday === 1) {
    return `${i18n.t('tomorrow')} · ${formatWeekdayMonthDayCompact(day)}`
  }
  if (day.isSame(today, 'year')) return formatWeekdayMonthDayCompact(day)
  return formatDate(day, { style: 'medium' })
}

const onDay = (base: Date, picked: Date) => {
  const next = new Date(base)
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
  return next
}

const PlanDateButton = (props: {
  date: Date
  setDate: (date: Date) => void
}) => {
  const theme = useTheme()
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState(props.date)
  const label = dayLabel(props.date)

  const open = () => {
    Keyboard.dismiss()
    setDraft(props.date)
    setPicking(true)
  }
  const commit = () => {
    setPicking(false)
    props.setDate(onDay(props.date, draft))
  }

  return (
    <View>
      <Button
        noTransform
        onPress={open}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('date')}
        accessibilityValue={{ text: label }}
        testID='plan-date-pill'
        style={{
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: theme.fonts.medium,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {label}
        </Text>
        <LucideIcon
          icon={CalendarDaysIcon}
          size={18}
          color={theme.colors.textAlt}
        />
      </Button>
      {Platform.select({ android: true, ios: false, web: false }) ? (
        picking && (
          <DateTimeDialog
            part='date'
            value={props.date}
            onPick={(picked) => {
              setPicking(false)
              props.setDate(picked)
            }}
            onDismiss={() => setPicking(false)}
          />
        )
      ) : (
        <PickerSheet
          open={picking}
          onCancel={() => setPicking(false)}
          onDone={commit}
          doneTestID='plan-date-done'
          title={i18n.t('date')}
        >
          <View style={{ alignItems: 'center', paddingHorizontal: 8 }}>
            <DateTimePicker
              value={draft}
              display='inline'
              onChange={(_, picked) => picked && setDraft(picked)}
              onSubmit={commit}
            />
          </View>
        </PickerSheet>
      )}
    </View>
  )
}

export default PlanDateButton
