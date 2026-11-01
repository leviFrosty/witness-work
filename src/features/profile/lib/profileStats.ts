import moment from 'moment'
import { TimeEntriesByYear } from '@/types/timeEntry'
import { storedDayKey } from '@/lib/normalizeDate'
import { isCountableEntry } from '@/lib/serviceReport'
import { entryMinutes } from '@/lib/entryMinutes'
import { isOwnVisit } from '@/lib/conversations'
import { Visit } from '@/types/visit'

const dayKey = (d: moment.Moment) => d.format('YYYY-MM-DD')

const pad2 = (n: number) => String(n).padStart(2, '0')

const localDateKey = (date: Date | string) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const weekdayOfKey = (key: string) =>
  new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10))
  ).getDay()

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

  level: 0 | 1 | 2 | 3 | 4

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
  column: number

  label: string
}

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

export const fittingMonthLabels = (
  labels: MonthLabel[],

  widths: Record<number, number>,
  stride: number,
  gap: number,

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
  daysWithService: number

  longestRun: number
}

export const contributionSummary = (
  grid: ContributionCell[][]
): ContributionSummary => {
  let daysWithService = 0
  let longestRun = 0
  let run = 0

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

export const totalMinutes = (daily: Map<string, number>): number => {
  let total = 0
  for (const m of daily.values()) total += m
  return total
}

export const daysLogged = (daily: Map<string, number>): number => {
  let n = 0
  for (const m of daily.values()) if (m > 0) n++
  return n
}
