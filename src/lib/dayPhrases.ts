import moment from 'moment'
import {
  formatDate,
  formatTime,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import i18n from '@/lib/locales'

/**
 * A day mid-sentence: "today", "tomorrow", or "yesterday", the weekday within a
 * week either way, else "Fri, Oct 30" (with the year when it isn't this
 * year's).
 */
export function dayPhrase(date: Date, now: number): string {
  const day = moment(date)
  const days = day
    .clone()
    .startOf('day')
    .diff(moment(now).startOf('day'), 'days')
  if (days === 0) return i18n.t('dayPhrase_today')
  if (days === 1) return i18n.t('dayPhrase_tomorrow')
  if (days === -1) return i18n.t('dayPhrase_yesterday')
  if (Math.abs(days) < 7) return day.format('dddd')
  return day.isSame(moment(now), 'year')
    ? formatWeekdayMonthDayCompact(day)
    : formatDate(day, { style: 'medium' })
}

/** "Saturday at 7:30 PM", for a day and time mid-sentence. */
export const whenPhrase = (date: Date, now: number): string =>
  i18n.t('dayPhrase_atTime', {
    day: dayPhrase(date, now),
    time: formatTime(date),
  })

/**
 * How far off a date is: "in 3 hours" or "2 hours ago" on the same day, and by
 * calendar days otherwise ("in 2 days" for the day after tomorrow, even at
 * midnight), so it agrees with the day a sentence names.
 */
export function distancePhrase(date: Date, now: number): string {
  const day = moment(date).startOf('day')
  const today = moment(now).startOf('day')
  return day.isSame(today) ? moment(date).from(moment(now)) : day.from(today)
}
