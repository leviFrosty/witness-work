import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'

export const DAY_MINUTES = 24 * 60

export const minutesOfDay = (date: Date) =>
  date.getHours() * 60 + date.getMinutes()

export const clockLabel = (minutes: number) => {
  const label = formatStartTime(minutes % DAY_MINUTES)
  return minutes >= DAY_MINUTES
    ? i18n.t('planForm_nextDayTime', { time: label })
    : label
}

export const planTimeLabel = (date: Date, minutes: number) => {
  const start = minutesOfDay(date)
  return minutes
    ? i18n.t('planForm_timeRange', {
        start: clockLabel(start),
        end: clockLabel(start + minutes),
      })
    : clockLabel(start)
}
