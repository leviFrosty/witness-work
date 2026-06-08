import { describe, it, expect, vi } from 'vitest'

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

/**
 * Terse builder for a `MonthlyLoggedBreakdown` — the per-month `{ year, month,
 * standard, credit }` shape `computeProjectedTotal` consumes as `loggedMonths`
 * (raw standard/credit minutes, before any cap). Pure data, no logic; it exists
 * only so each test reads as a scenario instead of a wall of object literals.
 * Positional args trim the boilerplate at ~15 call sites, and the `credit = 0`
 * default lets the common standard-only cases omit it — the few that exercise
 * credit pass the 4th arg, e.g. `logged(2026, 4, 30 * 60, 10 * 60)`.
 */
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
        dayPlan('2026-05-10', 90), // past day in scope month — already accounted for in loggedMonths
        dayPlan('2026-05-20', 120), // future, in month
        dayPlan('2026-05-25', 180), // future, in month
        dayPlan('2026-06-05', 240), // next month, out of scope
      ],
      recurringPlans: [],
      categories: [],
      creditCapMinutes: 55 * 60,
    })

    expect(result.plannedMinutes).toBe(300)
    expect(result.projectedMinutes).toBe(10 * 60 + 300)
  })

  describe('drops plans for days that already have logged time (issue #366)', () => {
    // Issue #366: with a 5h entry AND a 5h plan on the *current* day, the
    // projection showed 10h — the plan stacked on top of the logged time, then
    // dropped to 5h the next day once the day fell behind the walk. A day with
    // actual time is fully represented by `loggedMonths`; its plan must not
    // count again.
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
      // Same shape, but the day has no logged entry — the plan is the only
      // signal for the day, so it counts (control for the skip not over-firing).
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
      // Weekly recurring 90 min starting 2026-06-07. From today=2026-06-07 the
      // June instances are 7, 14, 21, 28. June 7 has a logged entry, so its
      // instance is dropped; 14/21/28 still count → 270 min on top of 2h logged.
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
      categories: [],
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
      categories: [],
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
        categories: [],
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
        categories: [],
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
      // Logged 50h standard. A 10h plan typed with a credit Category can only
      // contribute the 5h of headroom left under the 55h cap.
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
      // Category was deleted — the plan falls back to Standard, so it pushes
      // the projection past the cap instead of being squeezed by it.
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

    it("a Day Plan's Type wins the day over a recurring instance", () => {
      // Wed 2026-05-20: recurring 3h credit vs Day Plan 2h standard — the Day
      // Plan wins the day, so its 2h count as standard on top of 55h logged
      // standard (57h). The recurring instance on the 27th still forecasts
      // credit, which the cap squeezes to nothing.
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

    it('breaks recurring minute-ties deterministically — credit beats standard regardless of array order', () => {
      // Two recurring instances tie at 2h on Wed 2026-05-20. The conservative
      // forecast (credit, which the cap can squeeze) must win on BOTH array
      // orders, so two devices holding the plans in different orders after a
      // sync merge project the same number.
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
      // 55h logged standard is already at the cap, so a credit-typed day adds
      // nothing — the tie must NOT let the standard instance through.
      expect(a.projectedMinutes).toBe(55 * 60)
      expect(b.projectedMinutes).toBe(a.projectedMinutes)
      expect(b.plannedMinutes).toBe(a.plannedMinutes)
    })

    it("the highest-minutes recurring instance's Type tags the whole day", () => {
      // Two recurring instances on Wed 2026-05-20 only: 3h credit beats 2h
      // standard, so the day forecasts 3h credit — of which 1h fits under the
      // cap on top of 54h logged standard.
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

      expect(result.plannedMinutes).toBe(1 * 60)
      expect(result.projectedMinutes).toBe(55 * 60)
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
        categories: [],
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
        categories: [],
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
      // Adding exactly the standard gap reaches the goal.
      expect(projectStandardAddition(result, result.standardGapMinutes)).toBe(
        50 * 60
      )
    })

    it('exceeds the display gap when the goal is above the cap — added standard first displaces capped credit', () => {
      // Goal 60h > cap 55h. Logged 50h standard + 10h credit → projected 55h,
      // display gap 5h. But 5h more standard only displaces 5h of credit
      // (still 55h); reaching 60h requires combined standard ≥ 60h → 10h.
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
      // The display gap alone does NOT reach the goal…
      expect(projectStandardAddition(result, 5 * 60)).toBe(55 * 60)
      // …the standard gap does.
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
