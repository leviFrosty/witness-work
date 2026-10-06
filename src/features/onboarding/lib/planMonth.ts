import moment from 'moment'
import type { CalendarMonth } from '@/lib/monthlyGoals'

/**
 * With fewer days than this left in the month, the onboarding plan covers next
 * month instead — a plan for the last few days can't show what a month of
 * planning looks like.
 */
export const NEXT_MONTH_THRESHOLD_DAYS = 7

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

/** The month the onboarding plan covers, counting today as a day left. */
export const planTargetMonth = (today: Date): CalendarMonth => {
  const day = moment(today)
  const daysLeft = day.daysInMonth() - day.date() + 1
  const target =
    daysLeft < NEXT_MONTH_THRESHOLD_DAYS ? day.clone().add(1, 'month') : day
  return { year: target.year(), month: target.month() }
}

/**
 * Every weekday not in `days`. The publisher picks the weekdays they usually go
 * out; the rest become Off Days, which the Assistant never plans on — and the
 * saved Off Days give back the picked days.
 */
export const otherWeekdays = (days: readonly number[]): number[] =>
  WEEKDAYS.filter((day) => !days.includes(day))

/** Weekdays 0–6 in display order for the given Start of Week. */
export const orderedWeekdays = (startOfWeek: number): number[] =>
  WEEKDAYS.map((offset) => (startOfWeek + offset) % 7)

export type PlanMonthCell = {
  /** Day of the month, 1-based. */
  day: number
  weekday: number
  /** Before today, so the plan can't use it. */
  isPast: boolean
}

/**
 * Calendar weeks for `target`, padded with `null` so each row has seven cells
 * starting on `startOfWeek`.
 */
export const monthWeeks = (
  target: CalendarMonth,
  startOfWeek: number,
  today: Date
): (PlanMonthCell | null)[][] => {
  const first = moment({ year: target.year, month: target.month, day: 1 })
  const todayDay = moment(today).startOf('day')
  const leading = (first.day() - startOfWeek + 7) % 7
  const cells: (PlanMonthCell | null)[] = Array(leading).fill(null)
  for (let day = 1; day <= first.daysInMonth(); day++) {
    const date = first.clone().date(day)
    cells.push({
      day,
      weekday: date.day(),
      isPast: date.isBefore(todayDay, 'day'),
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (PlanMonthCell | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
