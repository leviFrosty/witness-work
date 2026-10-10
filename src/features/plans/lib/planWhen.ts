import moment from 'moment'
import {
  formatDate,
  formatStartTime,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import i18n from '@/lib/locales'

const MINUTES_PER_DAY = 24 * 60

/** "Tue, Oct 14" this year, "Oct 14, 2025" in another. */
const formatPlanDay = (day: moment.Moment): string =>
  day.isSame(moment(), 'year')
    ? formatWeekdayMonthDayCompact(day)
    : formatDate(day, { style: 'medium' })

/**
 * When a Plan happens, on the user's clock, as Plan Details shows it: "Tue, Oct
 * 14 · 9:00 AM – 11:00 AM". One that runs past midnight names the day it ends
 * on too: "Tue, Oct 14 · 11:00 PM – Wed, Oct 15 · 1:00 AM". An anytime Plan is
 * "Tue, Oct 14 · Anytime". Without a start time it's only the day, and without
 * a length only the start.
 */
export function formatPlanWhen({
  date,
  startTimeInMinutes,
  anytime,
  minutes,
}: {
  /** Local day. */
  date: Date
  startTimeInMinutes?: number
  /** Just hours, with no set time. */
  anytime?: boolean
  minutes?: number
}): string {
  const day = moment(date)
  const dayLabel = formatPlanDay(day)
  if (anytime) return `${dayLabel} · ${i18n.t('planAnytime')}`
  if (startTimeInMinutes === undefined) return dayLabel

  const start = `${dayLabel} · ${formatStartTime(startTimeInMinutes)}`
  if (!minutes) return start

  // Wall-clock minutes, like the start time, so a DST change doesn't move it.
  const endInMinutes = startTimeInMinutes + minutes
  const daysLater = Math.floor(endInMinutes / MINUTES_PER_DAY)
  const endTime = formatStartTime(endInMinutes % MINUTES_PER_DAY)
  const end = daysLater
    ? `${formatPlanDay(day.clone().add(daysLater, 'days'))} · ${endTime}`
    : endTime
  // Non-breaking spaces inside each end, so a range too long for one line
  // wraps at the dash instead of splitting a date or time.
  return i18n.t('planDetails_timeRange', {
    start: start.replace(/ /g, '\u00A0'),
    end: end.replace(/ /g, '\u00A0'),
  })
}
