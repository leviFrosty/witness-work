import moment from 'moment'
import type { CalendarMonth } from '@/lib/monthlyGoals'

export const NEXT_MONTH_THRESHOLD_DAYS = 7

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

export const planTargetMonth = (today: Date): CalendarMonth => {
  const day = moment(today)
  const daysLeft = day.daysInMonth() - day.date() + 1
  const target =
    daysLeft < NEXT_MONTH_THRESHOLD_DAYS ? day.clone().add(1, 'month') : day
  return { year: target.year(), month: target.month() }
}

export const otherWeekdays = (days: readonly number[]): number[] =>
  WEEKDAYS.filter((day) => !days.includes(day))

export const orderedWeekdays = (startOfWeek: number): number[] =>
  WEEKDAYS.map((offset) => (startOfWeek + offset) % 7)

export type PlanMonthCell = {
  day: number
  weekday: number
}

export const monthWeeks = (
  target: CalendarMonth,
  startOfWeek: number
): (PlanMonthCell | null)[][] => {
  const first = moment({ year: target.year, month: target.month, day: 1 })
  const leading = (first.day() - startOfWeek + 7) % 7
  const cells: (PlanMonthCell | null)[] = Array(leading).fill(null)
  for (let day = 1; day <= first.daysInMonth(); day++) {
    cells.push({ day, weekday: first.clone().date(day).day() })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (PlanMonthCell | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export const PLAN_DAY_STEP_MINUTES = 30

export const PLAN_DAY_DEFAULT_MINUTES = 120

export const planDayMaxMinutes = (minutes: number): number =>
  Math.max(8 * 60, Math.ceil(minutes / 60) * 60)

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
