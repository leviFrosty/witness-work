import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import { generateRecommendation } from '@/lib/assistantRecommendation'
import { momentStoredDate, normalizeDateForStorage } from '@/lib/normalizeDate'
import type { Conversation } from '@/types/conversation'
import type { DayPlan, RecurringPlan } from '@/types/serviceReport'

const baseInput = {
  year: 2026,
  month: 4, // May
  today: normalizeDateForStorage('2026-05-01'),
  monthlyGoalHours: 50,
  loggedAdjustedMinutes: 0,
  dayPlans: [] as DayPlan[],
  recurringPlans: [] as RecurringPlan[],
  conversations: [] as Conversation[],
  excludedWeekdays: [] as number[],
  assistantHistory: [],
}

describe('generateRecommendation', () => {
  it('returns null when the monthly goal is 0', () => {
    expect(
      generateRecommendation({ ...baseInput, monthlyGoalHours: 0 })
    ).toBeNull()
  })

  it('returns null when logged already meets or exceeds the goal', () => {
    expect(
      generateRecommendation({
        ...baseInput,
        loggedAdjustedMinutes: 50 * 60,
      })
    ).toBeNull()
  })

  it('returns null when projected (logged + planned) already meets the goal', () => {
    expect(
      generateRecommendation({
        ...baseInput,
        loggedAdjustedMinutes: 30 * 60,
        dayPlans: [
          {
            id: 'p1',
            date: normalizeDateForStorage('2026-05-10'),
            minutes: 20 * 60,
          },
        ],
      })
    ).toBeNull()
  })

  describe('shape selection', () => {
    it("emits 'distributed' at softCap when the gap fits within remaining days at the sustainable pace", () => {
      // Today=May 22, 10 eligible days. Gap = 20h. 20/4 = 5 slots × 4h.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        loggedAdjustedMinutes: 30 * 60,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('distributed')
      expect(rec!.headline.code).toBe('shape.distributed')
      expect(rec!.rationale.code).toBe('spread_to_sustainable_pace')
      expect(rec!.plans).toHaveLength(5)
      expect(rec!.plans.every((p) => p.minutes === 4 * 60)).toBe(true)
      const totalProposed = rec!.plans.reduce((s, p) => s + p.minutes, 0)
      expect(totalProposed).toBe(20 * 60)
      expect(rec!.headline.values.hours).toBe(4)
      expect(rec!.headline.values.days).toBe(5)
    })

    it("emits 'recurring' when the gap exceeds sustainable pace but fits within stretch over a 14+ day horizon", () => {
      // Today=May 18 (Mon) → 14 days remain. Goal 60h, logged 0 → gap 60h.
      // 14×softCap=56 < 60 ≤ 84=14×stretchCap, days ≥ 14 ⇒ recurring.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-18'),
        monthlyGoalHours: 60,
        loggedAdjustedMinutes: 0,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('recurring')
      expect(rec!.headline.code).toBe('shape.recurring')
      expect(rec!.rationale.code).toBe('pattern_fits_over_horizon')
      expect(rec!.headline.values.weekdayList).toBeDefined()
      expect(rec!.headline.values.weeks).toBeDefined()
      const total = rec!.plans.reduce((s, p) => s + p.minutes, 0)
      expect(total).toBeGreaterThanOrEqual(60 * 60)
      const stretchMin = 6 * 60
      expect(rec!.plans.every((p) => p.minutes <= stretchMin)).toBe(true)
      expect(rec!.plans.every((p) => p.minutes % 60 === 0)).toBe(true)
    })

    it('excludes weekdays in excludedWeekdays from the eligible pool', () => {
      // May 22, 2026 is a Friday. Excluding Fridays means the first eligible
      // day must not be a Friday.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        loggedAdjustedMinutes: 44 * 60,
        excludedWeekdays: [5],
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('concentrated')
      expect(rec!.plans).toHaveLength(1)
      expect(momentStoredDate(rec!.plans[0].date).day()).not.toBe(5)
    })

    it('prefers conversation days first and emits the layered_on_conversation_days rationale', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        loggedAdjustedMinutes: 30 * 60,
        conversations: [
          {
            id: 'c1',
            contact: { id: 'cn1' },
            date: normalizeDateForStorage('2026-05-23'),
            isBibleStudy: false,
          },
        ],
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('distributed')
      expect(rec!.rationale.code).toBe('layered_on_conversation_days')
      expect(
        rec!.plans.some(
          (p) => momentStoredDate(p.date).format('YYYY-MM-DD') === '2026-05-23'
        )
      ).toBe(true)
    })

    it('pushes the first proposed day back when the tiredness signal triggers', () => {
      // 13h logged in the prior 3 days exceeds the default 12h threshold.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        loggedAdjustedMinutes: 44 * 60,
        minutesLoggedInPriorDays: 13 * 60,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('concentrated')
      expect(rec!.rationale.code).toBe('rest_recommended_then_resume')
      expect(
        momentStoredDate(rec!.plans[0].date).isSameOrAfter(
          momentStoredDate(normalizeDateForStorage('2026-05-23'))
        )
      ).toBe(true)
    })

    it('falls back to another viable shape when the primary has negative history', () => {
      // Same inputs as the recurring/distributed boundary, but distributed
      // has been dismissed ≥3 times. Engine should switch off distributed.
      const now = Date.now()
      const dismissed = (i: number) => ({
        shape: 'distributed' as const,
        action: 'dismissed' as const,
        at: now - i,
      })
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-18'),
        monthlyGoalHours: 50,
        loggedAdjustedMinutes: 30 * 60,
        assistantHistory: [dismissed(1), dismissed(2), dismissed(3)],
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).not.toBe('distributed')
    })

    it('falls through to best-effort distributed at stretch cap when the goal is unreachable', () => {
      // May 27 → 5 days remain. Gap 40h > 5*6h=30h ⇒ unreachable. Best-effort
      // proposal: 5 days at stretch cap (6h).
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-27'),
        monthlyGoalHours: 50,
        loggedAdjustedMinutes: 10 * 60,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('distributed')
      expect(rec!.rationale.code).toBe('best_effort_unreachable_goal')
      expect(rec!.plans).toHaveLength(5)
      expect(rec!.plans.every((p) => p.minutes === 6 * 60)).toBe(true)
    })

    it('skips days that already have a DayPlan', () => {
      // May 15 has an existing 1h plan. Engine must propose on a different day.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-15'),
        loggedAdjustedMinutes: 44 * 60,
        dayPlans: [
          {
            id: 'existing',
            date: normalizeDateForStorage('2026-05-15'),
            minutes: 60,
          },
        ],
      })

      expect(rec).not.toBeNull()
      expect(rec!.plans).toHaveLength(1)
      expect(
        momentStoredDate(rec!.plans[0].date).format('YYYY-MM-DD')
      ).not.toBe('2026-05-15')
    })

    it("emits 'concentrated' (single plan) when the gap is at or below 2× softCap", () => {
      // Gap = 6h ≤ softCap*2 (8h). Today=May 15, no exclusions, no plans.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-15'),
        loggedAdjustedMinutes: 44 * 60,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('concentrated')
      expect(rec!.headline.code).toBe('shape.concentrated')
      expect(rec!.rationale.code).toBe('small_gap_one_focused_plan')
      expect(rec!.plans).toHaveLength(1)
      expect(rec!.plans[0].minutes).toBe(6 * 60)
      expect(rec!.headline.values.hours).toBe(6)
    })
  })
})
