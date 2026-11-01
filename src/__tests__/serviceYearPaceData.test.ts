import { describe, expect, it } from 'vitest'
import {
  computeServiceYearPace,
  sharedServiceYearPace,
  type ServiceYearPaceInput,
} from '@/features/progress/lib/serviceYearPaceData'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { DayPlan, TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'

const H = 60

const entry = (
  id: string,
  year: number,
  month: number,
  day: number,
  hours: number
): TimeEntry => ({
  id,
  hours,
  minutes: 0,
  date: normalizeDateForStorage(new Date(year, month, day)),
})

const byYear = (entries: TimeEntry[]): TimeEntriesByYear => {
  const result: TimeEntriesByYear = {}
  for (const e of entries) {
    const year = e.date.getUTCFullYear()
    const month = e.date.getUTCMonth()
    result[year] ??= {}
    result[year][month] ??= []
    result[year][month].push(e)
  }
  return result
}

const plan = (
  id: string,
  year: number,
  month: number,
  day: number,
  hours: number
): DayPlan => ({
  id,
  date: normalizeDateForStorage(new Date(year, month, day)),
  minutes: hours * H,
})

const input = (overrides: Partial<ServiceYearPaceInput> = {}) =>
  ({
    serviceYear: 2025,
    today: new Date(2025, 10, 16, 9, 30),
    serviceReports: byYear([
      entry('sep', 2025, 8, 10, 52),
      entry('oct', 2025, 9, 12, 48),
      entry('nov', 2025, 10, 3, 20),
      entry('last-sep', 2024, 8, 5, 40),
      entry('last-oct', 2024, 9, 5, 45),
      entry('last-nov', 2024, 10, 10, 30),
      entry('last-dec', 2024, 11, 10, 50),
    ]),
    dayPlans: [plan('p1', 2025, 10, 20, 5), plan('p2', 2025, 11, 5, 3)],
    recurringPlans: [],
    categories: [],
    monthlyGoalOverrides: { '2025-12': 30 },
    role: 'regularPioneer',
    roleHistory: null,
    publisherHours: {
      publisher: 0,
      regularAuxiliary: 30,
      regularPioneer: 50,
      circuitOverseer: 50,
      specialPioneer: 100,
      custom: 50,
    },
    userSpecifiedHasAnnualGoal: 'default',
    milestoneOverrides: null,
    overrideCreditLimit: false,
    customCreditLimitHours: 55,
    logsHours: false,
    ...overrides,
  }) satisfies ServiceYearPaceInput

describe('computeServiceYearPace', () => {
  it('pins the Year tab figures for a pioneer partway through the year', () => {
    const { pace, projection, monthBars, monthGoalMinutes } =
      computeServiceYearPace(input())

    expect(pace.tense).toBe('present')
    expect(pace.loggedMinutes).toBe(120 * H)
    expect(pace.projectedMinutes).toBe(128 * H)

    expect(pace.lastYearToDateMinutes).toBe(100.5 * H)
    expect(projection.months.map((m) => m.loggedMinutes / H)).toEqual([
      52, 48, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ])
    expect(pace.months.map((m) => m.plannedMinutes / H)).toEqual([
      0, 0, 5, 3, 0, 0, 0, 0, 0, 0, 0, 0,
    ])
    expect(monthGoalMinutes.map((m) => m / H)).toEqual([
      50, 50, 50, 30, 50, 50, 50, 50, 50, 50, 50, 50,
    ])
    expect(monthBars).toEqual({
      scaleMinutes: 52 * H,
      hasCredit: false,
      hasPlanned: true,
      hasGoal: true,
    })
  })
})

describe('sharedServiceYearPace', () => {
  it('computes once for callers with the same stores on the same day', () => {
    const shared = input()
    const first = sharedServiceYearPace(shared)

    const second = sharedServiceYearPace({
      ...shared,
      today: new Date(2025, 10, 16, 21, 5),
    })
    expect(second).toBe(first)
    expect(first).toEqual(computeServiceYearPace(shared))
  })

  it('recomputes when a store value or the day changes', () => {
    const shared = input()
    const first = sharedServiceYearPace(shared)

    const logged = sharedServiceYearPace({
      ...shared,
      serviceReports: byYear([entry('only', 2025, 8, 10, 10)]),
    })
    expect(logged).not.toBe(first)
    expect(logged.pace.loggedMinutes).toBe(10 * H)

    const nextDay = sharedServiceYearPace({
      ...shared,
      today: new Date(2025, 10, 17, 9, 30),
    })
    expect(nextDay).not.toBe(first)
    expect(nextDay).toEqual(
      computeServiceYearPace({
        ...shared,
        today: new Date(2025, 10, 17, 9, 30),
      })
    )

    const goal = sharedServiceYearPace({
      ...shared,
      monthlyGoalOverrides: {},
    })
    expect(goal.monthGoalMinutes[3]).toBe(50 * H)
  })

  it('keeps each Service Year apart', () => {
    const shared = input()
    const thisYear = sharedServiceYearPace(shared)
    const lastYear = sharedServiceYearPace({ ...shared, serviceYear: 2024 })
    expect(lastYear).not.toBe(thisYear)
    expect(lastYear.pace.tense).toBe('past')
    expect(lastYear.pace.loggedMinutes).toBe(165 * H)
    expect(sharedServiceYearPace(shared)).toBe(thisYear)
  })
})
