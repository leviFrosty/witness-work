import type { CalendarMonth } from '@/lib/monthlyGoals'

/** One day in the Schedule's week grid, in local calendar terms. */
export type ScheduleDay = {
  /** Local `YYYY-MM-DD`. */
  key: string
  year: number
  /** 0 = January. */
  month: number
  day: number
}

export type ScheduleWeekRow = {
  kind: 'week'
  key: string
  /** Seven columns from the Start of Week; `null` outside the month. */
  days: (ScheduleDay | null)[]
  /** Every day in the row is in this month. */
  month: CalendarMonth
  /** The month's first week, right under its name. */
  firstOfMonth: boolean
}

export type ScheduleMonthRow = {
  kind: 'month'
  key: string
  month: CalendarMonth
  /** The column of the month's 1st, where its name and rule start. */
  column: number
}

export type ScheduleServiceYearRow = {
  kind: 'serviceYear'
  key: string
  /** Start year: the Service Year runs September `serviceYear` → August. */
  serviceYear: number
  /** September of `serviceYear`, the month the divider opens. */
  month: CalendarMonth
}

export type ScheduleRow =
  | ScheduleWeekRow
  | ScheduleMonthRow
  | ScheduleServiceYearRow

export type ScheduleRows = {
  rows: ScheduleRow[]
  /** `YYYY-MM` → index of the month's name row. */
  monthHeader: Map<string, number>
  /** `YYYY-MM` → index of the month's first week row. */
  monthStart: Map<string, number>
  /** `YYYY-MM` → index of the month's last week row. */
  monthEnd: Map<string, number>
  /** `YYYY-MM-DD` → index of the week row holding the day. */
  dayRow: Map<string, number>
}

export type ScheduleRowsInput = {
  /** First Service Year (start year) in the list. */
  firstServiceYear: number
  /** Last Service Year (start year) in the list. */
  lastServiceYear: number
  /** 0 = Sunday … 6 = Saturday. */
  startOfWeek: number
}

export const calendarMonthKey = ({ year, month }: CalendarMonth) =>
  `${year}-${String(month + 1).padStart(2, '0')}`

export const dayKeyOf = (year: number, month: number, day: number) =>
  `${calendarMonthKey({ year, month })}-${String(day).padStart(2, '0')}`

/**
 * The Schedule's continuous week grid, the way Apple's Calendar scrolls months:
 * each month opens with a row naming it, set over the column of its 1st, and a
 * week that straddles two months splits there, so every week row belongs to one
 * month. September also opens a Service Year with a divider.
 */
export function buildScheduleRows({
  firstServiceYear,
  lastServiceYear,
  startOfWeek,
}: ScheduleRowsInput): ScheduleRows {
  const rows: ScheduleRow[] = []
  const monthHeader = new Map<string, number>()
  const monthStart = new Map<string, number>()
  const monthEnd = new Map<string, number>()
  const dayRow = new Map<string, number>()
  let week: (ScheduleDay | null)[] = Array(7).fill(null)
  let weekMonth: CalendarMonth | null = null
  let firstOfMonth = false

  const flushWeek = () => {
    if (!weekMonth) return
    const key = calendarMonthKey(weekMonth)
    const index = rows.length
    if (firstOfMonth) monthStart.set(key, index)
    monthEnd.set(key, index)
    for (const day of week) if (day) dayRow.set(day.key, index)
    rows.push({
      kind: 'week',
      key: `w-${week.find((day) => day !== null)!.key}`,
      days: week,
      month: weekMonth,
      firstOfMonth,
    })
    week = Array(7).fill(null)
    weekMonth = null
    firstOfMonth = false
  }

  // Noon keeps DST shifts from skipping or repeating a day.
  const cursor = new Date(firstServiceYear, 8, 1, 12)
  const end = new Date(lastServiceYear + 1, 7, 31, 12)
  while (cursor <= end) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const day = cursor.getDate()
    const column = (cursor.getDay() - startOfWeek + 7) % 7

    if (day === 1) {
      flushWeek()
      if (month === 8)
        rows.push({
          kind: 'serviceYear',
          key: `sy-${year}`,
          serviceYear: year,
          month: { year, month },
        })
      monthHeader.set(calendarMonthKey({ year, month }), rows.length)
      rows.push({
        kind: 'month',
        key: `m-${calendarMonthKey({ year, month })}`,
        month: { year, month },
        column,
      })
      firstOfMonth = true
    } else if (column === 0) {
      flushWeek()
    }

    week[column] = { key: dayKeyOf(year, month, day), year, month, day }
    weekMonth = { year, month }
    cursor.setDate(day + 1)
  }
  flushWeek()

  return { rows, monthHeader, monthStart, monthEnd, dayRow }
}

/** A month's rows: its name, then its first and last weeks. */
export function monthRows(
  schedule: ScheduleRows,
  target: CalendarMonth
): { header: number; first: number; last: number } | undefined {
  const key = calendarMonthKey(target)
  const header = schedule.monthHeader.get(key)
  const first = schedule.monthStart.get(key)
  const last = schedule.monthEnd.get(key)
  if (header === undefined || first === undefined || last === undefined)
    return undefined
  return { header, first, last }
}

export const sameCalendarMonth = (
  a: CalendarMonth | undefined,
  b: CalendarMonth | undefined
) => !!a && !!b && a.year === b.year && a.month === b.month
