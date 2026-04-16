import moment from 'moment'
import { ServiceReportsByYears } from '../types/serviceReport'

const dayKey = (d: moment.Moment) => d.format('YYYY-MM-DD')

/** Flattens nested service reports into a day→minutes map. */
export const flattenDailyMinutes = (
  reports: ServiceReportsByYears
): Map<string, number> => {
  const out = new Map<string, number>()
  for (const year of Object.values(reports)) {
    for (const month of Object.values(year)) {
      for (const r of month) {
        const key = dayKey(moment(r.date))
        const minutes = (r.hours || 0) * 60 + (r.minutes || 0)
        out.set(key, (out.get(key) || 0) + minutes)
      }
    }
  }
  return out
}

/**
 * Counts trailing weeks with at least one day of logged service, ending with
 * the current ISO week. Stops counting at the first empty week.
 */
export const consecutiveWeeksStreak = (
  daily: Map<string, number>,
  now: Date = new Date()
): number => {
  let streak = 0
  const cursor = moment(now).startOf('isoWeek')
  // Cap iterations to avoid infinite loops on bad data.
  for (let i = 0; i < 520; i++) {
    let hasDay = false
    for (let d = 0; d < 7; d++) {
      const key = dayKey(cursor.clone().add(d, 'days'))
      if ((daily.get(key) || 0) > 0) {
        hasDay = true
        break
      }
    }
    if (!hasDay) {
      // Allow the current week to be empty without breaking the streak —
      // a user mid-week hasn't "lost" their streak yet.
      if (i === 0) {
        cursor.subtract(1, 'week')
        continue
      }
      break
    }
    streak++
    cursor.subtract(1, 'week')
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
