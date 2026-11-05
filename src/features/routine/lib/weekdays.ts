import moment from 'moment'
import i18n from '@/lib/locales'

export const NO_DAY = -1

export const weekdayName = (day: number): string => moment.weekdays()[day]

export const weekdayShort = (day: number): string => moment.weekdaysMin()[day]

export function weekOrder(): number[] {
  const first = moment.localeData().firstDayOfWeek()
  return Array.from({ length: 7 }, (_, index) => (first + index) % 7)
}

export const MIDWEEK_DAYS = [1, 2, 3, 4, 5]
export const WEEKEND_DAYS = [6, 0]

export const dayOptions = (days: readonly number[], none: string) => [
  { label: none, value: NO_DAY },
  ...days.map((day) => ({ label: weekdayName(day), value: day })),
]

export const anyDayOptions = () =>
  dayOptions(weekOrder(), i18n.t('routine.settings.anyDay'))

export const fromOption = (value: number): number | null =>
  value === NO_DAY ? null : value
