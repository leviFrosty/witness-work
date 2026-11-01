import moment from 'moment'
import {
  formatDate,
  formatTime,
  formatWeekdayMonthDayCompact,
  localizeDisplayDate,
} from '@/lib/dates'
import i18n from '@/lib/locales'
import { calendarDaysBetween } from '@/lib/normalizeDate'

export function dayPhrase(date: Date, now: number): string {
  const day = moment(date)
  const days = calendarDaysBetween(now, date)
  if (days === 0) return i18n.t('dayPhrase_today')
  if (days === 1) return i18n.t('dayPhrase_tomorrow')
  if (days === -1) return i18n.t('dayPhrase_yesterday')
  if (Math.abs(days) < 7) return day.format('dddd')
  return day.isSame(moment(now), 'year')
    ? formatWeekdayMonthDayCompact(day)
    : formatDate(day, { style: 'medium' })
}

export const whenPhrase = (date: Date, now: number): string =>
  i18n.t('dayPhrase_atTime', {
    day: dayPhrase(date, now),
    time: formatTime(date),
  })

export function distancePhrase(date: Date, now: number): string {
  const day = moment(date).startOf('day')
  const today = moment(now).startOf('day')
  return localizeDisplayDate(
    day.isSame(today) ? moment(date).from(moment(now)) : day.from(today)
  )
}
