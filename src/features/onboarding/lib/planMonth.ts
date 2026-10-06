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

/** Plan-length steps for a day the publisher changes by hand. */
export const PLAN_DAY_STEP_MINUTES = 30

/** A day the publisher hasn't planned yet starts here when they tap it. */
export const PLAN_DAY_DEFAULT_MINUTES = 120

/**
 * The slider's top end: a long day, stretched to fit a longer plan the
 * Assistant proposed.
 */
export const planDayMaxMinutes = (minutes: number): number =>
  Math.max(8 * 60, Math.ceil(minutes / 60) * 60)

/**
 * The Assistant's proposal with the publisher's own changes on top. An edited
 * day keeps its minutes even when the picked weekdays change, and 0 clears it.
 * `fromAssistant` is false for days only the publisher planned. Sorted by day
 * of the month.
 */
export const applyDayEdits = (
  proposed: readonly { day: number; minutes: number }[],
  edits: ReadonlyMap<number, number>
): { day: number; minutes: number; fromAssistant: boolean }[] => {
  const byDay = new Map<number, number>()
  for (const { day, minutes } of proposed) {
    byDay.set(day, (byDay.get(day) ?? 0) + minutes)
  }
  const assistantDays = new Set(byDay.keys())
  for (const [day, minutes] of edits) byDay.set(day, minutes)
  return [...byDay]
    .filter(([, minutes]) => minutes > 0)
    .sort(([a], [b]) => a - b)
    .map(([day, minutes]) => ({
      day,
      minutes,
      fromAssistant: assistantDays.has(day),
    }))
}
