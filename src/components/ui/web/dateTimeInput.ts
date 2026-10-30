import { withDay, withTime } from '@/components/ui/dateTimePickerValue'

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

/** A date's calendar day as an `<input type="date">` value: `2026-10-30`. */
export const toDateInputValue = (date: Date) =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/**
 * `base` moved to the day an `<input type="date">` holds, keeping its clock
 * time, or `null` while the field is empty or half typed.
 */
export function fromDateInputValue(base: Date, value: string): Date | null {
  const match = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, date] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ]
  const next = withDay(base, { year, month: month - 1, date })
  // 02-30 rolls into March: not a day.
  if (next.getMonth() !== month - 1) return null
  return next
}

/** `base` at a clock time, keeping its day. */
export const withClockTime = (base: Date, hours: number, minutes: number) =>
  withTime(base, new Date(2000, 0, 1, hours, minutes))

export type ClockParts = {
  /** 0-23. */
  hours: number
  minutes: number
}

/** The 12-hour clock's hour (1-12) and whether it's the afternoon. */
export const to12Hour = (hours: number) => ({
  hour: hours % 12 === 0 ? 12 : hours % 12,
  pm: hours >= 12,
})

/** The 24-hour hour of a 12-hour clock's `hour` (1-12) and period. */
export const from12Hour = (hour: number, pm: boolean) =>
  (hour % 12) + (pm ? 12 : 0)

/** Whether `hours`:`minutes` on `value`'s day falls outside the limits. */
export function clockTimeOutOfRange(
  value: Date,
  hours: number,
  minutes: number,
  minimum?: Date,
  maximum?: Date
) {
  const at = withClockTime(value, hours, minutes).getTime()
  return (
    (minimum !== undefined && at < minimum.getTime()) ||
    (maximum !== undefined && at > maximum.getTime())
  )
}

/** Whether no minute of `hours` on `value`'s day is within the limits. */
export const hourOutOfRange = (
  value: Date,
  hours: number,
  minimum?: Date,
  maximum?: Date
) =>
  clockTimeOutOfRange(value, hours, 59, minimum, undefined) ||
  clockTimeOutOfRange(value, hours, 0, undefined, maximum)
