import moment from 'moment'
import { TimeEntriesByYear } from '@/types/timeEntry'
import { storedDayKey } from '@/lib/normalizeDate'
import { isCountableEntry } from '@/lib/serviceReport'

const dayKey = (d: moment.Moment) => d.format('YYYY-MM-DD')

/**
 * Flattens nested service reports into a day→minutes map. Time Rollovers are
 * left out: they move minutes between months, not onto a day of service, and
 * each pair nets to zero, so all-time totals don't change.
 */
export const flattenDailyMinutes = (
  reports: TimeEntriesByYear
): Map<string, number> => {
  const out = new Map<string, number>()
  for (const year of Object.values(reports)) {
    for (const month of Object.values(year)) {
      for (const r of month) {
        if (!isCountableEntry(r)) continue
        const key = storedDayKey(r.date)
        const minutes = (r.hours || 0) * 60 + (r.minutes || 0)
        out.set(key, (out.get(key) || 0) + minutes)
      }
    }
  }
  return out
}

/**
 * Counts trailing days of logged service, ending today. An empty today doesn't
 * break the streak — the day isn't over yet.
 */
export const consecutiveDaysStreak = (
  daily: Map<string, number>,
  now: Date = new Date()
): number => {
  const cursor = moment(now).startOf('day')
  if (!((daily.get(dayKey(cursor)) || 0) > 0)) cursor.subtract(1, 'day')
  let streak = 0
  // Cap iterations to avoid infinite loops on bad data.
  while (streak < 3650 && (daily.get(dayKey(cursor)) || 0) > 0) {
    streak++
    cursor.subtract(1, 'day')
  }
  return streak
}

/** Total minutes logged in the trailing N days (inclusive of today). */
export const minutesInTrailingDays = (
  daily: Map<string, number>,
  days: number,
  now: Date = new Date()
): number => {
  let total = 0
  const cursor = moment(now).startOf('day')
  for (let i = 0; i < days; i++) {
    total += daily.get(dayKey(cursor.clone().subtract(i, 'days'))) || 0
  }
  return total
}

/**
 * The weekday (0 = Sunday) the User went out on most often in the past year:
 * the one with the most days that have logged time or a Visit. Visits cover
 * publishers who only check off the month. Ties go to the weekday with more
 * logged minutes, then to the one gone out on most recently. `null` when there
 * was no activity.
 */
export const busiestWeekday = (
  daily: Map<string, number>,
  visits: { date: Date }[],
  now: Date = new Date()
): number | null => {
  const today = dayKey(moment(now))
  const yearAgo = dayKey(moment(now).subtract(1, 'year'))
  const inPastYear = (key: string) => key > yearAgo && key <= today

  const activeDays = new Map<string, number>()
  for (const [key, minutes] of daily) {
    if (minutes > 0 && inPastYear(key)) activeDays.set(key, minutes)
  }
  for (const visit of visits) {
    const key = dayKey(moment(visit.date))
    if (inPastYear(key) && !activeDays.has(key)) activeDays.set(key, 0)
  }

  const days = Array<number>(7).fill(0)
  const minutes = Array<number>(7).fill(0)
  const latest = Array<string>(7).fill('')
  for (const [key, dayMinutes] of activeDays) {
    const weekday = moment(key, 'YYYY-MM-DD').day()
    days[weekday]++
    minutes[weekday] += dayMinutes
    if (key > latest[weekday]) latest[weekday] = key
  }

  let busiest: number | null = null
  for (let weekday = 0; weekday < 7; weekday++) {
    if (days[weekday] === 0) continue
    if (
      busiest === null ||
      days[weekday] > days[busiest] ||
      (days[weekday] === days[busiest] &&
        (minutes[weekday] > minutes[busiest] ||
          (minutes[weekday] === minutes[busiest] &&
            latest[weekday] > latest[busiest])))
    ) {
      busiest = weekday
    }
  }
  return busiest
}

export type ContributionCell = {
  date: Date
  minutes: number
  /** 0-4 intensity bucket. 0 = no activity. */
  level: 0 | 1 | 2 | 3 | 4
  /** True when the date is after today (placeholder, empty cell). */
  future: boolean
}

const levelFor = (minutes: number, max: number): ContributionCell['level'] => {
  if (minutes <= 0) return 0
  if (max <= 0) return 0
  const ratio = minutes / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

/**
 * Builds a GitHub-style contribution grid ending at today. Columns are ISO
 * weeks; rows are Mon..Sun. Grid is padded with `future: true` cells so each
 * column is always 7 tall. Intensity levels are bucketed relative to the
 * maximum minutes observed in the visible window.
 */
export const contributionGrid = (
  daily: Map<string, number>,
  weeks: number,
  now: Date = new Date()
): ContributionCell[][] => {
  const todayStart = moment(now).startOf('day')
  const end = moment(now).startOf('isoWeek').add(6, 'days')
  const start = end
    .clone()
    .subtract(weeks * 7 - 1, 'days')
    .startOf('isoWeek')

  type Raw = { date: Date; minutes: number; future: boolean }
  const rawCols: Raw[][] = []
  const cursor = start.clone()
  let max = 0
  for (let w = 0; w < weeks; w++) {
    const col: Raw[] = []
    for (let d = 0; d < 7; d++) {
      const day = cursor.clone()
      const minutes = daily.get(dayKey(day)) || 0
      const future = day.isAfter(todayStart, 'day')
      if (!future && minutes > max) max = minutes
      col.push({ date: day.toDate(), minutes, future })
      cursor.add(1, 'day')
    }
    rawCols.push(col)
  }

  return rawCols.map((col) =>
    col.map((c) => ({ ...c, level: levelFor(c.minutes, max) }))
  )
}

/** Total minutes across all reports. */
export const totalMinutes = (daily: Map<string, number>): number => {
  let total = 0
  for (const m of daily.values()) total += m
  return total
}

/** Distinct days with any logged service. */
export const daysLogged = (daily: Map<string, number>): number => {
  let n = 0
  for (const m of daily.values()) if (m > 0) n++
  return n
}
