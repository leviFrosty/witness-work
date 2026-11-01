import { activeDateConventions, type TimeFormat } from '@/lib/dates'
import type { DateTimePickerEvent } from '@/components/ui/DateTimePicker.types'

export const clampDate = (date: Date, minimum?: Date, maximum?: Date) =>
  new Date(
    Math.max(
      minimum?.getTime() ?? -Infinity,
      Math.min(maximum?.getTime() ?? Infinity, date.getTime())
    )
  )

export const withDay = (
  base: Date,
  day: { year: number; month: number; date: number }
) => {
  const next = new Date(base)
  next.setFullYear(day.year, day.month, day.date)
  return next
}

export const withTime = (base: Date, picked: Date) => {
  const next = new Date(base)
  next.setHours(picked.getHours(), picked.getMinutes())
  return next
}

export const changeEvent = (date: Date): DateTimePickerEvent => ({
  type: 'set',
  nativeEvent: {
    timestamp: date.getTime(),
    utcOffset: -date.getTimezoneOffset(),
  },
})

export const uses24HourClock = (timeFormat: TimeFormat | undefined) =>
  timeFormat ? timeFormat === '24' : activeDateConventions().clock24
