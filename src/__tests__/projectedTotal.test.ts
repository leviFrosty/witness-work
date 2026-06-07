import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import { computeProjectedTotal } from '@/lib/projectedTotal'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
} from '@/types/timeEntry'

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

/** Raw per-month logged breakdown — standard/credit minutes before any cap. */
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
        dayPlan('2026-05-10', 90), // past day in scope month — already accounted for in loggedMonths
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
      loggedMonths: [],
      dayPlans: [],
      recurringPlans: [weeklyRecurring('rec-1', '2026-05-06', 90)],
      creditCapMinutes: 55 * 60,
    })

    expect(result.plannedMinutes).toBe(180)
  })

  it('day plan supersedes a recurring instance on the same day', () => {
    // Recurring weekly Wed at 90 min, day plan 120 min on 2026-05-20 (a Wed).
    // Future Wednesdays from 2026-05-15: 20 (day plan wins → 120), 27 (recurring → 90).
    const result = computeProjectedTotal({
      scope: { kind: 'month', year: 2026, month: 4 },
      today: normalizeDateForStorage('2026-05-15'),
      goalMinutes: 50 * 60,
      loggedMonths: [],
      dayPlans: [dayPlan('2026-05-20', 120)],
      recurringPlans: [weeklyRecurring('rec-1', '2026-05-06', 90)],
      creditCapMinutes: null,
    })

    expect(result.plannedMinutes).toBe(120 + 90)
  })

  describe('mirror cap semantics (ADR 0005)', () => {
    it('does not cap planned standard time — a pure-standard month projects past the credit cap', () => {
      // Logged 40h standard + 20h planned standard projects to 60h. The 55h
      // credit cap never touches standard time, so nothing is truncated.
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
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe(40 * 60)
      expect(result.plannedMinutes).toBe(20 * 60)
      expect(result.projectedMinutes).toBe(60 * 60)
    })

    it('caps combined credit when standard stays under the cap', () => {
      // Logged 30h standard + 10h credit (adjusted 40h). Planned 20h standard
      // brings combined standard to 50h; only 5h of the credit still fits
      // under the 55h cap → projected 55h, planned effective 15h.
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 30 * 60, 10 * 60)],
        dayPlans: [dayPlan('2026-05-20', 20 * 60)],
        recurringPlans: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe(40 * 60)
      expect(result.plannedMinutes).toBe(15 * 60)
      expect(result.projectedMinutes).toBe(55 * 60)
    })

    it('planned standard pushing combined standard past the cap squeezes out logged credit', () => {
      // Logged 30h standard + 20h credit (adjusted 50h). Planned 30h standard
      // makes combined standard 60h > 55h cap, so the report would drop all
      // logged credit → projected 60h, not naive 50h + 30h = 80h. The 30h of
      // plans therefore only move the projection by 10h.
      const result = computeProjectedTotal({
        scope: { kind: 'month', year: 2026, month: 4 },
        today: normalizeDateForStorage('2026-05-15'),
        goalMinutes: 50 * 60,
        loggedMonths: [logged(2026, 4, 30 * 60, 20 * 60)],
        dayPlans: [dayPlan('2026-05-20', 30 * 60)],
        recurringPlans: [],
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
        creditCapMinutes: null,
      })

      expect(result.loggedMinutes).toBe(70 * 60)
      expect(result.plannedMinutes).toBe(20 * 60)
      expect(result.projectedMinutes).toBe(90 * 60)
    })
  })

  describe('service-year scope', () => {
    it('applies the cap month by month and sums — there is no annual cap', () => {
      // Service year 2025 = Sep 2025 → Aug 2026.
      // Sep 2025: 50h standard + 10h credit → capped at 55h.
      // Oct 2025: 60h standard → 60h (standard is never capped).
      // Aug 2026: 10h planned standard → 10h.
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
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe((55 + 60) * 60)
      expect(result.plannedMinutes).toBe(10 * 60)
      expect(result.projectedMinutes).toBe((55 + 60 + 10) * 60)
    })

    it("planned standard re-runs its own month's cap against logged credit", () => {
      // Aug 2026: logged 50h standard + 5h credit (adjusted 55h). Planned 10h
      // standard → combined standard 60h > 55h cap squeezes out the credit:
      // the month projects 60h, so 10h of plans only contribute 5h.
      const result = computeProjectedTotal({
        scope: { kind: 'serviceYear', serviceYear: 2025 },
        today: normalizeDateForStorage('2026-08-01'),
        goalMinutes: 600 * 60,
        loggedMonths: [logged(2026, 7, 50 * 60, 5 * 60)],
        dayPlans: [dayPlan('2026-08-10', 10 * 60)],
        recurringPlans: [],
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe(55 * 60)
      expect(result.plannedMinutes).toBe(5 * 60)
      expect(result.projectedMinutes).toBe(60 * 60)
    })

    it('buckets planned minutes into their own months', () => {
      // Sep plans cannot eat into October's cap headroom (and vice versa).
      // Sep 2025: logged 53h standard + planned 4h → 57h (pure standard,
      // uncapped). Oct 2025: planned 3h → 3h.
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
        creditCapMinutes: 55 * 60,
      })

      expect(result.loggedMinutes).toBe(53 * 60)
      expect(result.plannedMinutes).toBe(7 * 60)
      expect(result.projectedMinutes).toBe(60 * 60)
    })
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
      // May 1 → 31 days remain, gap 40h ⇒ 1.3h/day, well under stretch cap.
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-01'),
        loggedMonths: [logged(2026, 4, 10 * 60)],
      })
      expect(r.state).toBe('reachable_gap')
    })

    it("'unreachable_gap' when filling the gap would require more than the stretch cap per remaining day", () => {
      // May 27 → 5 days remain (27–31). Gap 45h ⇒ 9h/day > 6h stretch cap.
      const r = computeProjectedTotal({
        ...base,
        today: normalizeDateForStorage('2026-05-27'),
        loggedMonths: [logged(2026, 4, 5 * 60)],
      })
      expect(r.state).toBe('unreachable_gap')
    })
  })
})
