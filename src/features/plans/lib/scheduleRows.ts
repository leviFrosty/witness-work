import type { CalendarMonth } from '@/lib/monthlyGoals'
import { serviceYearBounds } from '@/lib/serviceYear'

export type ScheduleDay = {
  key: string
  year: number

  month: number
  day: number
}

export type ScheduleWeekRow = {
  kind: 'week'
  key: string

  days: (ScheduleDay | null)[]

  month: CalendarMonth

  firstOfMonth: boolean
}

export type ScheduleMonthRow = {
  kind: 'month'
  key: string
  month: CalendarMonth

  column: number
}

export type ScheduleServiceYearRow = {
  kind: 'serviceYear'
  key: string

  serviceYear: number

  month: CalendarMonth
}

export type ScheduleRow =
  | ScheduleWeekRow
  | ScheduleMonthRow
  | ScheduleServiceYearRow

export type ScheduleRows = {
  rows: ScheduleRow[]

  monthHeader: Map<string, number>

  monthStart: Map<string, number>

  monthEnd: Map<string, number>

  dayRow: Map<string, number>
}

export type ScheduleRowsInput = {
  firstServiceYear: number

  lastServiceYear: number

  startOfWeek: number
}

export const calendarMonthKey = ({ year, month }: CalendarMonth) =>
  `${year}-${String(month + 1).padStart(2, '0')}`

export const dayKeyOf = (year: number, month: number, day: number) =>
  `${calendarMonthKey({ year, month })}-${String(day).padStart(2, '0')}`

export const monthOrdinal = ({ year, month }: CalendarMonth) =>
  year * 12 + month

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

  const cursor = serviceYearBounds(firstServiceYear).start.hour(12).toDate()
  const end = serviceYearBounds(lastServiceYear).end.toDate()
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
