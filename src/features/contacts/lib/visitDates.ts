import moment from 'moment'
import i18n from '@/lib/locales'
import { formatDate, formatWeekdayMonthDayCompact } from '@/lib/dates'

/**
 * Day heading for a visit card or follow-up: `Fri, Jun 5` within the current
 * year, `Fri, Jun 5, 2025` otherwise.
 */
export const visitDayLabel = (
  date: Date | string,
  now: Date = new Date()
): string => {
  const m = moment(date)
  return m.isSame(now, 'year')
    ? formatWeekdayMonthDayCompact(m)
    : `${m.format('ddd')}, ${formatDate(m, { style: 'medium' })}`
}

/** `Today` / `Tomorrow`, otherwise the visit day label. */
export const relativeDayLabel = (
  date: Date | string,
  now: Date = new Date()
): string => {
  const m = moment(date)
  if (m.isSame(now, 'day')) return i18n.t('today')
  if (m.isSame(moment(now).add(1, 'day'), 'day')) return i18n.t('tomorrow')
  return visitDayLabel(date, now)
}
