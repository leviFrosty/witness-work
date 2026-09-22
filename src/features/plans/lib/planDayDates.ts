import moment from 'moment'
import {
  splitDateAndStartTime,
  storedDateToLocalDate,
} from '@/lib/normalizeDate'

/**
 * The calendar day a PlanDay route param names, as a local-noon Date. Callers
 * pass a local-mode instant (a tapped cell's local midnight, `toISOString`'d).
 * Local midnight at UTC+12 is coincidentally noon UTC of the _prior_ day, so
 * `preserveOrNormalizeStoredDate` would misread it as an already-stored anchor
 * and seed the form one day early; local noon is never ambiguous.
 */
export const planDayFromRouteDate = (routeDate?: string): Date => {
  const m = moment(routeDate)
  return new Date(m.year(), m.month(), m.date(), 12)
}

/**
 * Splits the PlanDay picker value into what the store's plan actions take: a
 * local-mode day and the wall-clock start time. The store anchors the day to
 * noon UTC itself — handing it an already-stored anchor re-anchors it, which
 * lands on the next day at UTC+12 and beyond.
 */
export const splitPlanDate = (
  pickerValue: Date
): { date: Date; startTimeInMinutes: number } => {
  const { date, startTimeInMinutes } = splitDateAndStartTime(pickerValue)
  return { date: storedDateToLocalDate(date), startTimeInMinutes }
}
