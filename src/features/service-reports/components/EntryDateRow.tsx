import { useState } from 'react'
import { Keyboard, Platform, View } from 'react-native'
import moment from 'moment'
import DateTimePicker, { DateTimeDialog } from '@/components/ui/DateTimePicker'
import PickerSheet from '@/components/ui/PickerSheet'
import { formatDate, formatWeekdayMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import DetailRow from '@/features/service-reports/components/DetailRow'

const dayLabel = (date: Date) => {
  const day = moment(date).startOf('day')
  const today = moment().startOf('day')
  if (day.isSame(today)) {
    return `${i18n.t('today')} · ${formatWeekdayMonthDayCompact(day)}`
  }
  if (day.isSame(today.clone().add(1, 'day'), 'day')) {
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

const EntryDateRow = (props: {
  date: Date
  setDate: (date: Date) => void
  paddingX: number
}) => {
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState(props.date)
  const open = () => {
    Keyboard.dismiss()
    setDraft(props.date)
    setPicking(true)
  }
  return (
    <>
      <DetailRow
        label={i18n.t('date')}
        value={dayLabel(props.date)}
        onPress={open}
        paddingX={props.paddingX}
        testID='time-entry-date-row'
      />
      {Platform.select({ android: true, ios: false, web: false }) ? (
        picking && (
          <DateTimeDialog
            part='date'
            value={props.date}
            onPick={(picked) => {
              setPicking(false)
              props.setDate(onDay(props.date, picked))
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
            props.setDate(onDay(props.date, draft))
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
    </>
  )
}

export default EntryDateRow
