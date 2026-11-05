import moment from 'moment'

const dayKey = (d: moment.Moment) => d.format('YYYY-MM-DD')

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
