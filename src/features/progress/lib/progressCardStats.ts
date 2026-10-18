import moment from 'moment'
import { goalProgress } from '@/lib/goalProgress'
import { storedDayKey } from '@/lib/normalizeDate'
import type { TimeEntry } from '@/types/timeEntry'

/** Where the month being shown sits relative to today. */
export type MonthTense = 'past' | 'current' | 'future'

export const monthTense = (
  month: number,
  year: number,
  today: moment.Moment
): MonthTense => {
  const shown = moment({ year, month, day: 1 })
  if (today.isSame(shown, 'month')) return 'current'
  return today.isAfter(shown, 'month') ? 'past' : 'future'
}

/**
 * What the Daily Pace card says (issue #775): how much a day is still needed to
 * reach the Monthly Goal.
 *
 * - `current`: what's left, spread over the days left after today, the same count
 *   the month's report shows as "N days left". On the last day it all falls on
 *   today. `perWeekMinutes` is set while a week or more is left.
 * - `met`: the goal is reached (this month or a past one).
 * - `future`: the goal spread over the whole month.
 * - `past`: the month ended short; what it averaged a day and how far short.
 */
export type DailyPace =
  | {
      state: 'current'
      perDayMinutes: number
      perWeekMinutes: number | null
      remainingMinutes: number
      daysLeft: number
    }
  | { state: 'met'; overMinutes: number }
  | {
      state: 'future'
      perDayMinutes: number
      perWeekMinutes: number
      daysLeft: number
    }
  | { state: 'past'; averagePerDayMinutes: number; shortMinutes: number }

export const dailyPace = ({
  loggedMinutes,
  goalMinutes,
  month,
  year,
  today,
}: {
  /** The month's credit-capped total, as its report counts it. */
  loggedMinutes: number
  goalMinutes: number
  month: number
  year: number
  today: moment.Moment
}): DailyPace | null => {
  if (goalMinutes <= 0) return null
  const tense = monthTense(month, year, today)
  const daysInMonth = moment({ year, month, day: 1 }).daysInMonth()
  const { remaining, over } = goalProgress({
    minutes: loggedMinutes,
    goalMinutes,
  })

  if (tense === 'future') {
    const perDayMinutes = goalMinutes / daysInMonth
    return {
      state: 'future',
      perDayMinutes,
      perWeekMinutes: perDayMinutes * 7,
      daysLeft: daysInMonth,
    }
  }
  if (remaining <= 0) return { state: 'met', overMinutes: over }
  if (tense === 'past') {
    return {
      state: 'past',
      averagePerDayMinutes: Math.max(0, loggedMinutes) / daysInMonth,
      shortMinutes: remaining,
    }
  }

  const daysLeft = daysInMonth - today.date()
  const perDayMinutes = remaining / Math.max(1, daysLeft)
  return {
    state: 'current',
    perDayMinutes,
    perWeekMinutes: daysLeft >= 7 ? perDayMinutes * 7 : null,
    remainingMinutes: remaining,
    daysLeft,
  }
}

/** Minutes of service on one day, ignoring Time Rollover bookkeeping. */
const serviceMinutesByDay = (reports: TimeEntry[]) => {
  const days = new Map<string, number>()
  for (const entry of reports) {
    if (entry.rollover) continue
    const minutes = (entry.hours ?? 0) * 60 + (entry.minutes ?? 0)
    if (minutes <= 0) continue
    const key = storedDayKey(entry.date)
    days.set(key, (days.get(key) ?? 0) + minutes)
  }
  return days
}

export type ServiceDayStats = {
  /** Days with time logged. */
  days: number
  /** Logged minutes over those days. */
  averageMinutes: number
  /** The day with the most time (`YYYY-MM-DD`), the earliest on a tie. */
  bestDay: { day: string; minutes: number } | null
}

/**
 * The month's days in service: how many, the average a day out, and the longest
 * one. Raw logged time, before the credit cap, since the cap applies to a month
 * rather than any one day.
 */
export const serviceDayStats = (reports: TimeEntry[]): ServiceDayStats => {
  const days = serviceMinutesByDay(reports)
  let total = 0
  let bestDay: ServiceDayStats['bestDay'] = null
  for (const [day, minutes] of [...days].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    total += minutes
    if (!bestDay || minutes > bestDay.minutes) bestDay = { day, minutes }
  }
  return {
    days: days.size,
    averageMinutes: days.size ? total / days.size : 0,
    bestDay,
  }
}

export type MonthWeek = {
  /** First and last day of the week inside the month (`YYYY-MM-DD`). */
  start: string
  end: string
  minutes: number
  isCurrent: boolean
  isFuture: boolean
}

/**
 * The month split into weeks that start on `startOfWeek` (0 = Sunday), each cut
 * to the month's own days, with the time logged in it.
 */
export const monthWeeks = ({
  reports,
  month,
  year,
  startOfWeek,
  today,
}: {
  reports: TimeEntry[]
  month: number
  year: number
  startOfWeek: number
  today: moment.Moment
}): MonthWeek[] => {
  const days = serviceMinutesByDay(reports)
  const first = moment({ year, month, day: 1 })
  const last = first.clone().endOf('month').startOf('day')
  const todayKey = today.format('YYYY-MM-DD')
  const weeks: MonthWeek[] = []
  let cursor = first.clone()
  while (cursor.isSameOrBefore(last, 'day')) {
    const weekStart = cursor.clone()
    const untilWeekEnd = (startOfWeek + 6 - weekStart.day() + 7) % 7
    const weekEnd = moment.min(
      weekStart.clone().add(untilWeekEnd, 'days'),
      last.clone()
    )
    let minutes = 0
    for (
      const day = weekStart.clone();
      day.isSameOrBefore(weekEnd, 'day');
      day.add(1, 'day')
    ) {
      minutes += days.get(day.format('YYYY-MM-DD')) ?? 0
    }
    const start = weekStart.format('YYYY-MM-DD')
    const end = weekEnd.format('YYYY-MM-DD')
    weeks.push({
      start,
      end,
      minutes,
      isCurrent: todayKey >= start && todayKey <= end,
      isFuture: start > todayKey,
    })
    cursor = weekEnd.clone().add(1, 'day')
  }
  return weeks
}

/**
 * What the Year Pace card says: the Annual Goal's remaining time spread over
 * the Service Year's months left, this one included (#358).
 *
 * - `current`: per month for the rest of the year.
 * - `met`: the goal is reached.
 * - `future`: the goal spread over all twelve months.
 * - `past`: the year ended short by `shortMinutes`.
 */
export type YearPace =
  | { state: 'current'; perMonthMinutes: number; monthsLeft: number }
  | { state: 'met'; overMinutes: number }
  | { state: 'future'; perMonthMinutes: number }
  | { state: 'past'; shortMinutes: number }

export const yearPace = ({
  loggedMinutes,
  goalMinutes,
  serviceYear,
  today,
}: {
  loggedMinutes: number
  goalMinutes: number
  /** Start year: September of `serviceYear` to August of the next. */
  serviceYear: number
  today: moment.Moment
}): YearPace | null => {
  if (goalMinutes <= 0) return null
  const start = moment({ year: serviceYear, month: 8, day: 1 })
  const end = start.clone().add(1, 'year')
  if (today.isBefore(start, 'day'))
    return { state: 'future', perMonthMinutes: goalMinutes / 12 }
  const { remaining, over } = goalProgress({
    minutes: loggedMinutes,
    goalMinutes,
  })
  if (remaining <= 0) return { state: 'met', overMinutes: over }
  if (!today.isBefore(end, 'day'))
    return { state: 'past', shortMinutes: remaining }
  const monthsLeft = end.diff(today.clone().startOf('month'), 'months')
  return {
    state: 'current',
    perMonthMinutes: remaining / Math.max(1, monthsLeft),
    monthsLeft,
  }
}
