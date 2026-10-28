import moment from 'moment'
import { TimeEntriesByYear } from '@/types/timeEntry'
import { storedDayKey } from '@/lib/normalizeDate'
import { isCountableEntry } from '@/lib/serviceReport'
import { entryMinutes } from '@/lib/entryMinutes'
import { isOwnVisit } from '@/lib/conversations'
import { Visit } from '@/types/visit'

const dayKey = (d: moment.Moment) => d.format('YYYY-MM-DD')

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * `dayKey(moment(date))` without a moment: the local calendar day. Parsing a
 * moment per Visit made the Profile stats, which stay mounted on Home, cost a
 * few hundred milliseconds at launch on an account with thousands of Visits.
 */
const localDateKey = (date: Date | string) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** The weekday (0 = Sunday) of a `YYYY-MM-DD` key. */
const weekdayOfKey = (key: string) =>
  new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10))
  ).getDay()

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
        const minutes = entryMinutes(r)
        out.set(key, (out.get(key) || 0) + minutes)
      }
    }
  }
  return out
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
 * publishers who only check off the month; ones that came with a shared Contact
 * are the sender's and don't count. Ties go to the weekday with more logged
 * minutes, then to the one gone out on most recently. `null` when there was no
 * activity.
 */
export const busiestWeekday = (
  daily: Map<string, number>,
  visits: Pick<Visit, 'date' | 'receivedAt'>[],
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
    if (!isOwnVisit(visit)) continue
    const key = localDateKey(visit.date)
    if (inPastYear(key) && !activeDays.has(key)) activeDays.set(key, 0)
  }

  const days = Array<number>(7).fill(0)
  const minutes = Array<number>(7).fill(0)
  const latest = Array<string>(7).fill('')
  for (const [key, dayMinutes] of activeDays) {
    const weekday = weekdayOfKey(key)
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

export type MonthLabel = {
  /** The grid column (week) the label sits over. */
  column: number
  /** Short month name, e.g. "May". */
  label: string
}

/** One label per month, over the first week that starts in it. */
export const contributionMonthLabels = (
  grid: ContributionCell[][]
): MonthLabel[] =>
  grid.flatMap((col, column) => {
    const month = col[0].date.getMonth()
    const previous = grid[column - 1]?.[0].date.getMonth()
    return month === previous
      ? []
      : [{ column, label: moment(col[0].date).format('MMM') }]
  })

/**
 * The month labels that fit above the grid without running into each other.
 * Labels start at their column and may be wider than the gap to the next month:
 * the window's first month can have a single week, and large text or narrow
 * cells widen every label. Working from the right, a label that would reach the
 * next shown one, or run past the end of the row, is left out. The window's
 * first month, which it usually clips, shows only if its label fits over its
 * own weeks, so a label never names the month after it.
 */
export const fittingMonthLabels = (
  labels: MonthLabel[],
  /** The rendered width of each label, by column. */
  widths: Record<number, number>,
  stride: number,
  gap: number,
  /** The width of the row the labels sit in. */
  rowWidth = Infinity
): MonthLabel[] => {
  const kept: MonthLabel[] = []
  let nextLeft = rowWidth + gap
  for (let i = labels.length - 1; i >= 0; i--) {
    const left = labels[i].column * stride
    const right = left + (widths[labels[i].column] ?? 0) + gap
    const limit = i === 0 && labels[1] ? labels[1].column * stride : Infinity
    if (right > Math.min(nextLeft, limit)) continue
    kept.unshift(labels[i])
    nextLeft = left
  }
  return kept
}

/**
 * The week column under a touch at physical `x` in a grid `gridWidth` wide.
 * Columns run from the reading start, the right edge in a right-to-left layout.
 * May fall outside the grid; the caller checks.
 */
export const contributionColumnAt = (
  x: number,
  stride: number,
  gridWidth: number,
  rtl: boolean
): number => {
  'worklet'
  return Math.floor((rtl ? gridWidth - x : x) / stride)
}

export type ContributionSummary = {
  /** Days in the window with any logged service. */
  daysWithService: number
  /** Longest stretch of consecutive days with service in the window. */
  longestRun: number
}

/** What a contribution grid shows, for its screen-reader summary. */
export const contributionSummary = (
  grid: ContributionCell[][]
): ContributionSummary => {
  let daysWithService = 0
  let longestRun = 0
  let run = 0
  // Columns are consecutive weeks and rows Mon..Sun, so this walks the days in
  // order.
  for (const col of grid) {
    for (const cell of col) {
      if (cell.future) continue
      if (cell.minutes > 0) {
        daysWithService++
        run++
        if (run > longestRun) longestRun = run
      } else {
        run = 0
      }
    }
  }
  return { daysWithService, longestRun }
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
