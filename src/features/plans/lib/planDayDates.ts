import moment from 'moment'
import {
  localDayFromUtcCursor,
  momentStoredDate,
  normalizeDateForStorage,
  splitDateAndStartTime,
  storedDateToLocalDate,
} from '@/lib/normalizeDate'

export const planDayFromRouteDate = (routeDate?: string): Date => {
  const m = moment(routeDate)
  return new Date(m.year(), m.month(), m.date(), 12)
}

export const splitPlanDate = (
  pickerValue: Date
): { date: Date; startTimeInMinutes: number } => {
  const { date, startTimeInMinutes } = splitDateAndStartTime(pickerValue)
  return { date: storedDateToLocalDate(date), startTimeInMinutes }
}

export const allEventsStartDate = (
  seriesStart: Date | string,
  editedDay: Date,
  pickedDay: Date
): Date => {
  const shift = momentStoredDate(normalizeDateForStorage(pickedDay)).diff(
    momentStoredDate(normalizeDateForStorage(editedDay)),
    'days'
  )
  return localDayFromUtcCursor(momentStoredDate(seriesStart).add(shift, 'days'))
}
