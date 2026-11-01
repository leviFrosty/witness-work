import { afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  computeProjectedTotal,
  projectStandardAddition,
} from '@/lib/projectedTotal'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
} from '@/types/timeEntry'
import type { Category } from '@/types/category'

const dayPlan = (
  isoDay: string,
  minutes: number,
  categoryId?: string
): DayPlan => ({
  id: isoDay,
  date: normalizeDateForStorage(isoDay),
  minutes,
  categoryId,
})

const weeklyRecurring = (
  id: string,
  startIsoDay: string,
  minutes: number,
  endIsoDay?: string,
  categoryId?: string
): RecurringPlan => ({
  id,
  startDate: normalizeDateForStorage(startIsoDay),
  minutes,
  categoryId,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: endIsoDay ? normalizeDateForStorage(endIsoDay) : null,
  },
})

const CREDIT_CATEGORY: Category = {
  id: 'cat-credit',
  name: 'Bethel',
  isCredit: true,
}
const STANDARD_CATEGORY: Category = {
  id: 'cat-standard',
  name: 'Morning territory',
  isCredit: false,
}
const categories = [CREDIT_CATEGORY, STANDARD_CATEGORY]

const logged = (year: number, month: number, standard: number, credit = 0) => ({
  year,
  month,
  standard,
  credit,
})

describe('computeProjectedTotal', () => {
  it('returns logged_over_goal when logged minutes already exceed the goal', () => {
    const result = computeProjectedTotal({
      scope: { kind: 'month', year: 2026, month: 4 },
      today: new Date('2026-05-15T12:00:00Z'),
      goalMinutes: 50 * 60,
      loggedMonths: [logged(2026, 4, 60 * 60)],
      dayPlans: [],
      recurringPlans: [],
      categories: [],
      creditCapMinutes: 55 * 60,
    })

    expect(result.state).toBe('logged_over_goal')
    expect(result.loggedMinutes).toBe(60 * 60)
    expect(result.plannedMinutes).toBe(0)
    expect(result.projectedMinutes).toBe(60 * 60)
    expect(result.overMinutes).toBe(10 * 60)
    expect(result.gapMinutes).toBe(0)
  })

  it('sums future day plans into plannedMinutes; ignores past and out-of-scope plans', () => {
    const result = computeProjectedTotal({
      scope: { kind: 'month', year: 2026, month: 4 },
      today: normalizeDateForStorage('2026-05-15'),
      goalMinutes: 50 * 60,
      loggedMonths: [logged(2026, 4, 10 * 60)],
      dayPlans: [
        dayPlan('2026-05-10', 90),
        dayPlan('2026-05-20', 120),
        dayPlan('2026-05-25', 180),
        dayPlan('2026-06-05', 240),
      ],
      recurringPlans: [],
      categories: [],
      creditCapMinutes: 55 * 60,
    })

    expect(result.plannedMinutes).toBe(300)
    expect(result.projectedMinutes).toBe(10 * 60 + 300)
  })

  describe('drops plans for days that already have logged time (issue #366)', () => {
    it("ignores the current day's plan when actual time is logged for today", () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 5 },
        today: normalizeDateForStorage('2026-06-07'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 5, 5 * 60)],
        loggedDayKeys: new Set(['2026-06-07']),
        dayPlans: [dayPlan('2026-06-07', 5 * 60)],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.plannedMinutes).toBe(0)
      expect(result.projectedMinutes).toBe(5 * 60)
    })

    it('still counts the current day plan when no actual time is logged for it', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 5 },
        today: normalizeDateForStorage('2026-06-07'),
        goalMinutes: 50 * 60,
        loggedMonths: [],
        loggedDayKeys: new Set(),
        dayPlans: [dayPlan('2026-06-07', 5 * 60)],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.plannedMinutes).toBe(5 * 60)
      expect(result.projectedMinutes).toBe(5 * 60)
    })

    it('drops a recurring instance on a logged day but keeps later instances', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 5 },
        today: normalizeDateForStorage('2026-06-07'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 5, 2 * 60)],
        loggedDayKeys: new Set(['2026-06-07']),
        dayPlans: [],
        recurringPlans: [weeklyRecurring('rec-1', '2026-06-07', 90)],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.plannedMinutes).toBe(270)
      expect(result.projectedMinutes).toBe(2 * 60 + 270)
    })
  })

  it('sums recurring plan instances on future days within scope', () => {
    const result = computeProjectedTotal({
      scope: { kind: 'month', year: 2026, month: 4 },
      today: normalizeDateForStorage('2026-05-15'),
      goalMinutes: 50 * 60,
      loggedMonths: [],
      dayPlans: [],
      recurringPlans: [weeklyRecurring('rec-1', '2026-05-06', 90)],
      categories: [],
      creditCapMinutes: 55 * 60,
    })

    expect(result.plannedMinutes).toBe(180)
  })

  it('day plan adds to a recurring instance on the same day', () => {
    const result = computeProjectedTotal({
      scope: { kind: 'month', year: 2026, month: 4 },
      today: normalizeDateForStorage('2026-05-15'),
      goalMinutes: 50 * 60,
      loggedMonths: [],
      dayPlans: [dayPlan('2026-05-20', 120)],
      recurringPlans: [weeklyRecurring('rec-1', '2026-05-06', 90)],
      categories: [],
      creditCapMinutes: null,
    })

    expect(result.plannedMinutes).toBe(120 + 90 + 90)
  })

  describe('mirror cap semantics (ADR 0005)', () => {
    it('does not cap planned standard time — a pure-standard month projects past the credit cap', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 40 * 60)],
        dayPlans: [
          dayPlan('2026-05-20', 10 * 60),
          dayPlan('2026-05-25', 10 * 60),
        ],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe(40 * 60)
      expect(result.plannedMinutes).toBe(20 * 60)
      expect(result.projectedMinutes).toBe(60 * 60)
    })

    it('caps combined credit when standard stays under the cap', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 30 * 60, 10 * 60)],
        dayPlans: [dayPlan('2026-05-20', 20 * 60)],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe(40 * 60)
      expect(result.plannedMinutes).toBe(15 * 60)
      expect(result.projectedMinutes).toBe(55 * 60)
    })

    it('planned standard pushing combined standard past the cap squeezes out logged credit', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 30 * 60, 20 * 60)],
        dayPlans: [dayPlan('2026-05-20', 30 * 60)],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe(50 * 60)
      expect(result.plannedMinutes).toBe(10 * 60)
      expect(result.projectedMinutes).toBe(60 * 60)
    })

    it('does not cap anything when creditCapMinutes is null (unlimited)', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 100 * 60,
        loggedMonths: [logged(2026, 4, 40 * 60, 30 * 60)],
        dayPlans: [
          dayPlan('2026-05-20', 10 * 60),
          dayPlan('2026-05-25', 10 * 60),
        ],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: null,
      })

      expect(result.loggedMinutes).toBe(70 * 60)
      expect(result.plannedMinutes).toBe(20 * 60)
      expect(result.projectedMinutes).toBe(90 * 60)
    })
  })

  describe('planned credit derived from Category (Plan Type)', () => {
    it('planned credit only fills the headroom under the cap', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 50 * 60)],
        dayPlans: [dayPlan('2026-05-20', 10 * 60, CREDIT_CATEGORY.id)],
        recurringPlans: [],
        categories,
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe(50 * 60)
      expect(result.plannedMinutes).toBe(5 * 60)
      expect(result.projectedMinutes).toBe(55 * 60)
    })

    it('planned credit counts in full when the cap is unlimited', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 100 * 60,
        loggedMonths: [logged(2026, 4, 50 * 60)],
        dayPlans: [dayPlan('2026-05-20', 10 * 60, CREDIT_CATEGORY.id)],
        recurringPlans: [],
        categories,
        creditCapMinutes: null,
      })

      expect(result.plannedMinutes).toBe(10 * 60)
      expect(result.projectedMinutes).toBe(60 * 60)
    })

    it('a dangling categoryId forecasts Standard', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 50 * 60)],
        dayPlans: [dayPlan('2026-05-20', 10 * 60, 'cat-deleted')],
        recurringPlans: [],
        categories,
        creditCapMinutes: 55 * 60,
      })

      expect(result.plannedMinutes).toBe(10 * 60)
      expect(result.projectedMinutes).toBe(60 * 60)
    })

    it('a Day Plan and a recurring instance on one day each keep their own Type', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 55 * 60)],
        dayPlans: [dayPlan('2026-05-20', 2 * 60, STANDARD_CATEGORY.id)],
        recurringPlans: [
          weeklyRecurring(
            'rec-credit',
            '2026-05-06',
            3 * 60,
            undefined,
            CREDIT_CATEGORY.id
          ),
        ],
        categories,
        creditCapMinutes: 55 * 60,
      })

      expect(result.plannedMinutes).toBe(2 * 60)
      expect(result.projectedMinutes).toBe(57 * 60)
    })

    it('stacks Day Plans and a recurring instance on one day additively, each with its own Type', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 45 * 60)],
        dayPlans: [
          {
            ...dayPlan('2026-05-20', 1 * 60, STANDARD_CATEGORY.id),
            id: 'dp-standard',
          },
          {
            ...dayPlan('2026-05-20', 3 * 60, CREDIT_CATEGORY.id),
            id: 'dp-credit',
          },
        ],
        recurringPlans: [
          weeklyRecurring(
            'rec-credit',
            '2026-05-20',
            3 * 60,
            '2026-05-20',
            CREDIT_CATEGORY.id
          ),
        ],
        categories,
        creditCapMinutes: 55 * 60,
      })

      expect(result.plannedMinutes).toBe(7 * 60)
      expect(result.projectedMinutes).toBe(52 * 60)
    })

    it('projects the same total regardless of recurring Plan order', () => {
      const credit = weeklyRecurring(
        'rec-credit',
        '2026-05-20',
        2 * 60,
        '2026-05-20',
        CREDIT_CATEGORY.id
      )
      const standard = weeklyRecurring(
        'rec-standard',
        '2026-05-20',
        2 * 60,
        '2026-05-20',
        STANDARD_CATEGORY.id
      )
      const run = (recurringPlans: RecurringPlan[]) =>
        computeProjectedTotal({
          scope: { kind: 'month', year: 2026, month: 4 },
          today: normalizeDateForStorage('2026-05-15'),
          goalMinutes: 50 * 60,
          loggedMonths: [logged(2026, 4, 55 * 60)],
          dayPlans: [],
          recurringPlans,
          categories,
          creditCapMinutes: 55 * 60,
        })

      const a = run([credit, standard])
      const b = run([standard, credit])

      expect(a.projectedMinutes).toBe(57 * 60)
      expect(b.projectedMinutes).toBe(a.projectedMinutes)
      expect(b.plannedMinutes).toBe(a.plannedMinutes)
    })

    it('every recurring instance on a day counts under its own Type', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 54 * 60)],
        dayPlans: [],
        recurringPlans: [
          weeklyRecurring(
            'rec-credit',
            '2026-05-20',
            3 * 60,
            '2026-05-20',
            CREDIT_CATEGORY.id
          ),
          weeklyRecurring(
            'rec-standard',
            '2026-05-20',
            2 * 60,
            '2026-05-20',
            STANDARD_CATEGORY.id
          ),
        ],
        categories,
        creditCapMinutes: 55 * 60,
      })

      expect(result.plannedMinutes).toBe(2 * 60)
      expect(result.projectedMinutes).toBe(56 * 60)
    })
  })

  describe('service-year scope', () => {
    it('applies the cap month by month and sums — there is no annual cap', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'serviceYear', serviceYear: 2025 },
        today: normalizeDateForStorage('2026-08-01'),
        goalMinutes: 600 * 60,
        loggedMonths: [
          logged(2025, 8, 50 * 60, 10 * 60),
          logged(2025, 9, 60 * 60),
        ],
        dayPlans: [dayPlan('2026-08-10', 10 * 60)],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe((55 + 60) * 60)
      expect(result.plannedMinutes).toBe(10 * 60)
      expect(result.projectedMinutes).toBe((55 + 60 + 10) * 60)
    })

    it("planned standard re-runs its own month's cap against logged credit", () => {
      const result = computeProjectedTotal({
        scope: { kind: 'serviceYear', serviceYear: 2025 },
        today: normalizeDateForStorage('2026-08-01'),
        goalMinutes: 600 * 60,
        loggedMonths: [logged(2026, 7, 50 * 60, 5 * 60)],
        dayPlans: [dayPlan('2026-08-10', 10 * 60)],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe(55 * 60)
      expect(result.plannedMinutes).toBe(5 * 60)
      expect(result.projectedMinutes).toBe(60 * 60)
    })

    it('reports every month of the service year, September first', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'serviceYear', serviceYear: 2025 },
        today: normalizeDateForStorage('2025-10-10'),
        goalMinutes: 600 * 60,
        loggedMonths: [
          logged(2025, 8, 50 * 60, 10 * 60),
          logged(2025, 9, 20 * 60),
        ],
        dayPlans: [
          dayPlan('2025-10-20', 4 * 60),
          dayPlan('2025-11-03', 3 * 60),
        ],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.months).toHaveLength(12)
      expect(result.months[0]).toEqual({
        year: 2025,
        month: 8,
        loggedMinutes: 55 * 60,
        projectedMinutes: 55 * 60,
      })
      expect(result.months[1]).toEqual({
        year: 2025,
        month: 9,
        loggedMinutes: 20 * 60,
        projectedMinutes: 24 * 60,
      })
      expect(result.months[2].projectedMinutes).toBe(3 * 60)
      expect(result.months[11]).toEqual({
        year: 2026,
        month: 7,
        loggedMinutes: 0,
        projectedMinutes: 0,
      })
      expect(
        result.months.reduce((sum, m) => sum + m.projectedMinutes, 0)
      ).toBe(result.projectedMinutes)
    })

    it('caps each month by the cap the resolver gives that month', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'serviceYear', serviceYear: 2025 },
        today: normalizeDateForStorage('2026-09-01'),
        goalMinutes: 600 * 60,
        loggedMonths: [
          logged(2025, 8, 40 * 60, 30 * 60),
          logged(2025, 9, 40 * 60, 30 * 60),
        ],
        dayPlans: [],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: ({ month }) => (month === 8 ? null : 55 * 60),
      })

      expect(result.months[0].loggedMinutes).toBe(70 * 60)
      expect(result.months[1].loggedMinutes).toBe(55 * 60)
      expect(result.loggedMinutes).toBe((70 + 55) * 60)
    })

    it('buckets planned minutes into their own months', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'serviceYear', serviceYear: 2025 },
        today: normalizeDateForStorage('2025-09-10'),
        goalMinutes: 600 * 60,
        loggedMonths: [logged(2025, 8, 53 * 60)],
        dayPlans: [
          dayPlan('2025-09-15', 4 * 60),
          dayPlan('2025-10-10', 3 * 60),
        ],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe(53 * 60)
      expect(result.plannedMinutes).toBe(7 * 60)
      expect(result.projectedMinutes).toBe(60 * 60)
    })
  })

  describe('standardGapMinutes + projectStandardAddition', () => {
    it('equals the display gap while the goal sits at or under the cap', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 30 * 60)],
        dayPlans: [],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.gapMinutes).toBe(20 * 60)
      expect(result.standardGapMinutes).toBe(20 * 60)

      expect(projectStandardAddition(result, result.standardGapMinutes)).toBe(
        50 * 60
      )
    })

    it('exceeds the display gap when the goal is above the cap — added standard first displaces capped credit', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 60 * 60,
        loggedMonths: [logged(2026, 4, 50 * 60, 10 * 60)],
        dayPlans: [],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.projectedMinutes).toBe(55 * 60)
      expect(result.gapMinutes).toBe(5 * 60)
      expect(result.standardGapMinutes).toBe(10 * 60)

      expect(projectStandardAddition(result, 5 * 60)).toBe(55 * 60)

      expect(projectStandardAddition(result, result.standardGapMinutes)).toBe(
        60 * 60
      )
    })

    it('is zero when the projection already reaches the goal', () => {
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 50 * 60)],
        dayPlans: [],
        recurringPlans: [],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.standardGapMinutes).toBe(0)
    })
  })

  describe('state classification', () => {
    const base = {
      scope: { kind: 'month' as const, year: 2026, month: 4 },
      goalMinutes: 50 * 60,
      dayPlans: [],
      recurringPlans: [],
      categories: [],
      creditCapMinutes: 55 * 60,
    }

    it("'empty' when logged and planned are both 0", () => {
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-01'),
        loggedMonths: [],
      })
      expect(r.state).toBe('empty')
    })

    it("'logged_over_goal' when logged ≥ goal (takes precedence over plans)", () => {
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-15'),
        loggedMonths: [logged(2026, 4, 51 * 60)],
      })
      expect(r.state).toBe('logged_over_goal')
    })

    it("'projected_over_goal' when logged < goal but projected ≥ goal", () => {
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-15'),
        loggedMonths: [logged(2026, 4, 30 * 60)],
        dayPlans: [
          dayPlan('2026-05-20', 12 * 60),
          dayPlan('2026-05-25', 13 * 60),
        ],
      })
      expect(r.state).toBe('projected_over_goal')
    })

    it("'reachable_gap' when there is some progress and the remaining gap is fillable", () => {
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-01'),
        loggedMonths: [logged(2026, 4, 10 * 60)],
      })
      expect(r.state).toBe('reachable_gap')
    })

    it("'unreachable_gap' when filling the gap would require more than the stretch cap per remaining day", () => {
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-27'),
        loggedMonths: [logged(2026, 4, 5 * 60)],
      })
      expect(r.state).toBe('unreachable_gap')
    })
  })

  describe('day-walk TZ stability', () => {
    const originalTZ = process.env.TZ
    afterEach(() => {
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    })

    it('a fully future month counts every recurring instance and none from the prior month (US TZ)', () => {
      process.env.TZ = 'America/Los_Angeles'
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 6 },
        today: normalizeDateForStorage('2026-06-10'),
        goalMinutes: 50 * 60,
        loggedMonths: [],
        dayPlans: [],
        recurringPlans: [
          weeklyRecurring('rec-friday', '2026-01-02', 8 * 60),
          weeklyRecurring('rec-tuesday', '2026-01-06', 4 * 60, '2026-06-30'),
        ],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.plannedMinutes).toBe(5 * 8 * 60)
    })

    it("counts today's recurring instance in the current month (UTC+12)", () => {
      process.env.TZ = 'Pacific/Auckland'
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 5 },

        today: new Date(2026, 5, 10, 9, 0, 0),
        goalMinutes: 50 * 60,
        loggedMonths: [],
        dayPlans: [],
        recurringPlans: [
          weeklyRecurring('rec-wednesday', '2026-06-10', 60, '2026-06-24'),
        ],
        categories: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.plannedMinutes).toBe(3 * 60)
    })
  })
})
