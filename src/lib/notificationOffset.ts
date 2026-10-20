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

/**
 * When a reminder `minutes` ahead of `anchor` fires. Whole days count back on
 * the wall clock, so "1 day before" a 10:00 start fires at 10:00 the day before
 * even across a daylight saving change; the rest counts back in minutes.
 */
export const reminderFireDate = (anchor: Date, minutes: number): Date =>
  moment(anchor)
    .subtract(Math.floor(minutes / DAY_MINUTES), 'days')
    .subtract(minutes % DAY_MINUTES, 'minutes')
    .toDate()

/**
 * How many minutes ahead of `anchor` a reminder at `fireAt` is, the inverse of
 * `reminderFireDate`: whole days on the wall clock, the rest in minutes. A gap
 * of whole elapsed days reads as those days, since older app versions saved day
 * offsets in elapsed time. Rounds sub-minute drift.
 */
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

/**
 * Derives the cleanest `{ amount, unit }` representation of the gap between an
 * anchor (e.g., a plan's start time) and the moment a notification was
 * scheduled to fire. Snaps to the largest unit that divides evenly so an offset
 * of 1440 minutes shows as `{ 1, 'days' }` rather than `{ 1440, 'minutes' }`.
 *
 * Returns `null` when the notification fires at or after the anchor (negative
 * or zero gap) — callers should fall back to the preference default.
 */
export const deriveOffsetFromDates = (
  anchorDate: Date,
  notificationDate: Date
): NotificationOffset | null =>
  offsetFromMinutes(reminderOffsetMinutesBetween(anchorDate, notificationDate))

/** The cleanest `{ amount, unit }` for a positive number of minutes. */
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

/** Whole minutes in an offset; null when it is incomplete. */
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
