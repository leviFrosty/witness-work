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
): NotificationOffset | null => {
  const minutes = Math.round(
    (anchorDate.getTime() - notificationDate.getTime()) / 60000
  )
  if (minutes <= 0) return null
  for (const { unit, minutes: divisor } of UNITS) {
    if (minutes % divisor === 0) {
      return { amount: minutes / divisor, unit }
    }
  }
  return { amount: minutes, unit: 'minutes' }
}
