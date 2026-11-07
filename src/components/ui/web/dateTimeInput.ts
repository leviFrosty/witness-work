import { withDay, withTime } from '@/components/ui/dateTimePickerValue'

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

export const toDateInputValue = (date: Date) =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export function fromDateInputValue(base: Date, value: string): Date | null {
  const match = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, date] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ]
  const next = withDay(base, { year, month: month - 1, date })

  if (next.getMonth() !== month - 1) return null
  return next
}

export const withClockTime = (base: Date, hours: number, minutes: number) =>
  withTime(base, new Date(2000, 0, 1, hours, minutes))

export type ClockParts = {
  hours: number
  minutes: number
}

export const to12Hour = (hours: number) => ({
  hour: hours % 12 === 0 ? 12 : hours % 12,
  pm: hours >= 12,
})

export const from12Hour = (hour: number, pm: boolean) =>
  (hour % 12) + (pm ? 12 : 0)

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

export const hourOutOfRange = (
  value: Date,
  hours: number,
  minimum?: Date,
  maximum?: Date
) =>
  clockTimeOutOfRange(value, hours, 59, minimum, undefined) ||
  clockTimeOutOfRange(value, hours, 0, undefined, maximum)
