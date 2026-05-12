import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/logger', () => import('./mocks/logger'))

import { computeProjectedTotal } from '../lib/projectedTotal'
import { normalizeDateForStorage } from '../lib/normalizeDate'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
} from '../types/serviceReport'

const dayPlan = (isoDay: string, minutes: number): DayPlan => ({
  id: isoDay,
  date: normalizeDateForStorage(isoDay),
  minutes,
})

const weeklyRecurring = (
  id: string,
  startIsoDay: string,
  minutes: number,
  endIsoDay?: string
): RecurringPlan => ({
  id,
  startDate: normalizeDateForStorage(startIsoDay),
  minutes,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: endIsoDay ? normalizeDateForStorage(endIsoDay) : null,
  },
})

describe('computeProjectedTotal', () => {
  it('returns logged_over_goal when logged minutes already exceed the goal', () => {
    const result = computeProjectedTotal({
      scope: { kind: 'month', year: 2026, month: 4 },
      today: new Date('2026-05-15T12:00:00Z'),
      goalMinutes: 50 * 60,
      loggedAdjustedMinutes: 60 * 60,
      dayPlans: [],
      recurringPlans: [],
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
      loggedAdjustedMinutes: 10 * 60,
      dayPlans: [
        dayPlan('2026-05-10', 90), // past day in scope month — already accounted for in loggedAdjustedMinutes
        dayPlan('2026-05-20', 120), // future, in month
        dayPlan('2026-05-25', 180), // future, in month
        dayPlan('2026-06-05', 240), // next month, out of scope
      ],
      recurringPlans: [],
      creditCapMinutes: 55 * 60,
    })

    expect(result.plannedMinutes).toBe(300)
    expect(result.projectedMinutes).toBe(10 * 60 + 300)
  })

  it('sums recurring plan instances on future days within scope', () => {
    // Weekly recurring starting Wed 2026-05-06, 90 min.
    // May 2026 Wednesdays: 6, 13, 20, 27.
    // From today=2026-05-15, future instances are 20 and 27 → 180 min.
    const result = computeProjectedTotal({
      scope: { kind: 'month', year: 2026, month: 4 },
      today: normalizeDateForStorage('2026-05-15'),
      goalMinutes: 50 * 60,
      loggedAdjustedMinutes: 0,
      dayPlans: [],
      recurringPlans: [weeklyRecurring('rec-1', '2026-05-06', 90)],
      creditCapMinutes: 55 * 60,
    })

    expect(result.plannedMinutes).toBe(180)
  })

  it('truncates projected at the credit cap when cap is non-null', () => {
    // Logged 40h + 20h planned would project to 60h, but cap is 55h.
    // Planned should be truncated so projected = cap.
    const result = computeProjectedTotal({
      scope: { kind: 'month', year: 2026, month: 4 },
      today: normalizeDateForStorage('2026-05-15'),
      goalMinutes: 50 * 60,
      loggedAdjustedMinutes: 40 * 60,
      dayPlans: [
        dayPlan('2026-05-20', 10 * 60),
        dayPlan('2026-05-25', 10 * 60),
      ],
      recurringPlans: [],
      creditCapMinutes: 55 * 60,
    })

    expect(result.projectedMinutes).toBe(55 * 60)
    expect(result.plannedMinutes).toBe(15 * 60)
  })

  it('day plan supersedes a recurring instance on the same day', () => {
    // Recurring weekly Wed at 90 min, day plan 120 min on 2026-05-20 (a Wed).
    // Future Wednesdays from 2026-05-15: 20 (day plan wins → 120), 27 (recurring → 90).
    const result = computeProjectedTotal({
      scope: { kind: 'month', year: 2026, month: 4 },
      today: normalizeDateForStorage('2026-05-15'),
      goalMinutes: 50 * 60,
      loggedAdjustedMinutes: 0,
      dayPlans: [dayPlan('2026-05-20', 120)],
      recurringPlans: [weeklyRecurring('rec-1', '2026-05-06', 90)],
      creditCapMinutes: null,
    })

    expect(result.plannedMinutes).toBe(120 + 90)
  })

  it('does not truncate projected when creditCapMinutes is null (unlimited)', () => {
    const result = computeProjectedTotal({
      scope: { kind: 'month', year: 2026, month: 4 },
      today: normalizeDateForStorage('2026-05-15'),
      goalMinutes: 100 * 60,
      loggedAdjustedMinutes: 40 * 60,
      dayPlans: [
        dayPlan('2026-05-20', 10 * 60),
        dayPlan('2026-05-25', 10 * 60),
      ],
      recurringPlans: [],
      creditCapMinutes: null,
    })

    expect(result.projectedMinutes).toBe(60 * 60)
    expect(result.plannedMinutes).toBe(20 * 60)
  })

  describe('state classification', () => {
    const base = {
      scope: { kind: 'month' as const, year: 2026, month: 4 },
      goalMinutes: 50 * 60,
      dayPlans: [],
      recurringPlans: [],
      creditCapMinutes: 55 * 60,
    }

    it("'empty' when logged and planned are both 0", () => {
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-01'),
        loggedAdjustedMinutes: 0,
      })
      expect(r.state).toBe('empty')
    })

    it("'logged_over_goal' when logged ≥ goal (takes precedence over plans)", () => {
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-15'),
        loggedAdjustedMinutes: 51 * 60,
      })
      expect(r.state).toBe('logged_over_goal')
    })

    it("'projected_over_goal' when logged < goal but projected ≥ goal", () => {
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-15'),
        loggedAdjustedMinutes: 30 * 60,
        dayPlans: [
          dayPlan('2026-05-20', 12 * 60),
          dayPlan('2026-05-25', 13 * 60),
        ],
      })
      expect(r.state).toBe('projected_over_goal')
    })

    it("'reachable_gap' when there is some progress and the remaining gap is fillable", () => {
      // May 1 → 31 days remain, gap 40h ⇒ 1.3h/day, well under stretch cap.
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-01'),
        loggedAdjustedMinutes: 10 * 60,
      })
      expect(r.state).toBe('reachable_gap')
    })

    it("'unreachable_gap' when filling the gap would require more than the stretch cap per remaining day", () => {
      // May 27 → 5 days remain (27–31). Gap 45h ⇒ 9h/day > 6h stretch cap.
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-27'),
        loggedAdjustedMinutes: 5 * 60,
      })
      expect(r.state).toBe('unreachable_gap')
    })
  })
})
