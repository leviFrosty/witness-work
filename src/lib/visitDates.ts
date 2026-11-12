import moment from 'moment'
import i18n from '@/lib/locales'
import { formatDisplay, formatWeekdayMonthDayCompact } from '@/lib/dates'

export const visitDayLabel = (
  date: Date | string,
  now: Date = new Date()
): string => {
  const m = moment(date)
  return m.isSame(now, 'year')
    ? formatWeekdayMonthDayCompact(m)
    : formatDisplay(m, 'ddd, ll')
}

export const relativeDayLabel = (
  date: Date | string,
  now: Date = new Date()
): string => {
  const m = moment(date)
  if (m.isSame(now, 'day')) return i18n.t('today')
  if (m.isSame(moment(now).add(1, 'day'), 'day')) return i18n.t('tomorrow')
  return visitDayLabel(date, now)
}
