import moment from 'moment'
import { activeDateConventions, formatDisplay } from '@/lib/dates'
import i18n from '@/lib/locales'
import type {
  InsightBucket,
  InsightSlot,
} from '@/features/territories/lib/insights'

export const percentOf = (rate: number) => Math.round(rate * 100)

export const weekOrder = (): number[] => {
  const first = moment.localeData().firstDayOfWeek()
  return Array.from({ length: 7 }, (_, index) => (first + index) % 7)
}

export const dayName = (day: number) => moment.weekdays()[day] ?? ''

export const dayShort = (day: number) => moment.weekdaysShort()[day] ?? ''

const atHour = (hour: number) => moment().startOf('day').hour(hour)

export const hourLabel = (hour: number) =>
  formatDisplay(atHour(hour), activeDateConventions().clock24 ? 'H:mm' : 'h A')

const TICK_EVERY = 2

export function hourTicks(first: number, last: number): Map<number, string> {
  const clock24 = activeDateConventions().clock24
  const ticks = new Map<number, string>()
  let half: boolean | undefined
  for (let hour = first; hour <= last; hour += TICK_EVERY) {
    const afternoon = hour >= 12
    const full = !clock24 && afternoon !== half
    half = afternoon
    ticks.set(
      hour,
      formatDisplay(atHour(hour), clock24 ? 'H' : full ? 'h A' : 'h')
    )
  }
  return ticks
}

export const hourRange = (hour: number) =>
  i18n.t('territories.insights.hourRange', {
    from: hourLabel(hour),
    to: hourLabel((hour + 1) % 24),
  })

export const slotText = ({ day, hour }: InsightSlot) =>
  i18n.t('territories.insights.slot', {
    day: dayName(day),
    time: hourRange(hour),
  })

export const bucketText = (bucket: InsightBucket) =>
  bucket.total === 0
    ? i18n.t('territories.insights.noDoors')
    : i18n.t('territories.insights.answeredOf', {
        percent: percentOf(bucket.rate),
        spoke: bucket.spoke,
        total: bucket.total,
      })

export const compareText = (bucket: InsightBucket, average: number) =>
  i18n.t('territories.insights.compare', {
    percent: percentOf(bucket.rate),
    average: percentOf(average),
  })

export const pointsText = (lift: number) => {
  const points = Math.round(lift * 100)
  if (points === 0) return '0'
  return `${points > 0 ? '+' : '−'}${Math.abs(points)}`
}

export const liftText = (lift: number | undefined) =>
  lift === undefined
    ? undefined
    : i18n.t('territories.insights.vsAverage', { points: pointsText(lift) })
