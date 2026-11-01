import moment from 'moment'

export type NotificationOffset = {
  amount: number
  unit: moment.unitOfTime.DurationConstructor
}

const UNITS: {
  unit: moment.unitOfTime.DurationConstructor
  minutes: number
}[] = [
  { unit: 'weeks', minutes: 60 * 24 * 7 },
  { unit: 'days', minutes: 60 * 24 },
  { unit: 'hours', minutes: 60 },
  { unit: 'minutes', minutes: 1 },
]

const DAY_MINUTES = 60 * 24

export const reminderFireDate = (anchor: Date, minutes: number): Date =>
  moment(anchor)
    .subtract(Math.floor(minutes / DAY_MINUTES), 'days')
    .subtract(minutes % DAY_MINUTES, 'minutes')
    .toDate()

export const reminderOffsetMinutesBetween = (
  anchor: Date,
  fireAt: Date
): number => {
  const elapsedMinutes = Math.round(
    (anchor.getTime() - fireAt.getTime()) / 60_000
  )
  if (elapsedMinutes > 0 && elapsedMinutes % DAY_MINUTES === 0)
    return elapsedMinutes
  const wallClockMinutes = Math.round(
    (anchor.getTime() - fireAt.getTime()) / 60_000 -
      (anchor.getTimezoneOffset() - fireAt.getTimezoneOffset())
  )
  const days = Math.max(0, Math.floor(wallClockMinutes / DAY_MINUTES))
  const daysBefore = moment(anchor).subtract(days, 'days').valueOf()
  return (
    days * DAY_MINUTES + Math.round((daysBefore - fireAt.getTime()) / 60_000)
  )
}

export const deriveOffsetFromDates = (
  anchorDate: Date,
  notificationDate: Date
): NotificationOffset | null =>
  offsetFromMinutes(reminderOffsetMinutesBetween(anchorDate, notificationDate))

export const offsetFromMinutes = (
  minutes: number
): NotificationOffset | null => {
  const whole = Math.round(minutes)
  if (!(whole > 0)) return null
  for (const { unit, minutes: divisor } of UNITS) {
    if (whole % divisor === 0) {
      return { amount: whole / divisor, unit }
    }
  }
  return { amount: whole, unit: 'minutes' }
}

export const offsetToMinutes = (offset: {
  amount?: number
  unit?: moment.unitOfTime.DurationConstructor
}): number | null =>
  offset.amount === undefined || !offset.unit
    ? null
    : Math.max(
        0,
        Math.round(moment.duration(offset.amount, offset.unit).asMinutes())
      )
