import { describe, expect, it } from 'vitest'
import type { DayPlan, TimeEntry, TimeEntriesByYear } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import {
  buildSignData,
  nextPlannedDay,
  serviceYearMonths,
  visitCountsForMonth,
} from '@/features/pet/lib/signData'

const noon = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d, 12))
const entry = (
  id: string,
  date: Date,
  hours: number,
  minutes = 0
): TimeEntry => ({ id, date, hours, minutes })

const byMonth = (entries: TimeEntry[]): TimeEntriesByYear => {
  const out: TimeEntriesByYear = {}
  for (const e of entries) {
    const y = e.date.getUTCFullYear()
    const m = e.date.getUTCMonth()
    out[y] ??= {}
    out[y][m] = [...(out[y][m] ?? []), e]
  }
  return out
}

const visit = (
  id: string,
  contact: string,
  date: Date,
  extra: Partial<Visit> = {}
): Visit => ({
  id,
  contact: { id: contact },
  date,
  isBibleStudy: false,
  ...extra,
})

const today = new Date(2026, 9, 18, 10)

describe('pet sign data', () => {
  it('lists the Service Year from September', () => {
    const months = serviceYearMonths(today)
    expect(months[0]).toEqual({ month: 8, year: 2026 })
    expect(months[4]).toEqual({ month: 0, year: 2027 })
    expect(months[11]).toEqual({ month: 7, year: 2027 })
  })

  it('totals this month, the year by month, and shared months', () => {
    const serviceReports = byMonth([
      entry('a', noon(2026, 8, 3), 10),
      entry('b', noon(2026, 9, 2), 2, 30),
      entry('c', noon(2026, 9, 9), 1),

      entry('d', noon(2026, 9, 10), 0),
    ])
    const sign = buildSignData({
      today,
      serviceReports,
      dayPlans: [],
      recurringPlans: [],
      visits: [],
      publisher: 'regularPioneer',
      creditLimit: { enabled: false, customLimitHours: 55 },
      monthGoalHours: 50,
      digits: 'latn',
    })
    expect(sign.monthMinutes).toBe(210)
    expect(sign.monthGoal).toBe(50)
    expect(sign.currentMonthIndex).toBe(1)
    expect(sign.yearBars.slice(0, 3)).toEqual([10, 3.5, 0])
    expect(sign.yearMinutes).toBe(810)
    expect(sign.sharedMonths.slice(0, 3)).toEqual([true, true, false])
    expect(sign.planDay).toBeNull()
    expect(sign.planMinutes).toBeNull()
    expect(sign.digits).toBe('latn')
  })

  it('finds the next planned day from today on', () => {
    const plan = (id: string, date: Date, minutes: number): DayPlan => ({
      id,
      date,
      minutes,
    })
    expect(
      nextPlannedDay(
        today,
        [
          plan('old', noon(2026, 9, 10), 60),
          plan('next', noon(2026, 9, 21), 150),
        ],
        []
      )
    ).toEqual({ day: 21, minutes: 150 })
    expect(
      nextPlannedDay(today, [plan('zero', noon(2026, 9, 19), 0)], [])
    ).toBeNull()
  })

  it('counts conversations and return visits this month', () => {
    const visits = [
      visit('1', 'ann', noon(2026, 8, 20)),
      visit('2', 'ann', noon(2026, 9, 5)),
      visit('3', 'bo', noon(2026, 9, 6)),
      visit('4', 'bo', noon(2026, 9, 6), { notAtHome: true }),
      visit('5', 'cy', noon(2026, 9, 1), { notAtHome: true }),
      visit('6', 'cy', noon(2026, 9, 8)),
    ]

    expect(visitCountsForMonth(visits, today)).toEqual({
      conversations: 3,
      returnVisits: 2,
    })
  })

  it("skips a shared Contact's visits but counts the User's next one", () => {
    const visits = [
      visit('1', 'ann', noon(2026, 9, 2), { receivedAt: 1 }),
      visit('2', 'ann', noon(2026, 9, 3), { receivedAt: 1 }),
      visit('3', 'ann', noon(2026, 9, 9)),
    ]
    expect(visitCountsForMonth(visits, today)).toEqual({
      conversations: 1,
      returnVisits: 1,
    })
  })
})
