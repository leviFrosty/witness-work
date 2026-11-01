import moment from 'moment'
import {
  formatDate,
  formatStartTime,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import i18n from '@/lib/locales'

const MINUTES_PER_DAY = 24 * 60

const formatPlanDay = (day: moment.Moment): string =>
  day.isSame(moment(), 'year')
    ? formatWeekdayMonthDayCompact(day)
    : formatDate(day, { style: 'medium' })

export function formatPlanWhen({
  date,
  startTimeInMinutes,
  anytime,
  minutes,
}: {
  date: Date
  startTimeInMinutes?: number

  anytime?: boolean
  minutes?: number
}): string {
  const day = moment(date)
  const dayLabel = formatPlanDay(day)
  if (anytime) return i18n.t('planDayAnytime', { day: dayLabel })
  if (startTimeInMinutes === undefined) return dayLabel

  const start = `${dayLabel} · ${formatStartTime(startTimeInMinutes)}`
  if (!minutes) return start

  const endInMinutes = startTimeInMinutes + minutes
  const daysLater = Math.floor(endInMinutes / MINUTES_PER_DAY)
  const endTime = formatStartTime(endInMinutes % MINUTES_PER_DAY)
  const end = daysLater
    ? `${formatPlanDay(day.clone().add(daysLater, 'days'))} · ${endTime}`
    : endTime

  return i18n.t('planDetails_timeRange', {
    start: start.replace(/ /g, '\u00A0'),
    end: end.replace(/ /g, '\u00A0'),
  })
}
