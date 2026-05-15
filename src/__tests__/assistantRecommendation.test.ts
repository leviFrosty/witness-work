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
  offDays: [] as number[],
  meetingDays: [] as number[],
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
    it("emits 'distributed' with the fewest days needed at stretchCap and totals the gap exactly", () => {
      // Today=May 22, 10 eligible days. Gap = 20h.
      // Fewest days at stretchCap (6h) = ceil(20/6) = 4. 4 × 5h = 20h.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        loggedAdjustedMinutes: 30 * 60,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('distributed')
      expect(rec!.headline.code).toBe('shape.distributed')
      expect(rec!.rationale.code).toBe('spread_to_sustainable_pace')
      expect(rec!.plans).toHaveLength(4)
      expect(rec!.plans.every((p) => p.minutes === 5 * 60)).toBe(true)
      const totalProposed = rec!.plans.reduce((s, p) => s + p.minutes, 0)
      expect(totalProposed).toBe(20 * 60)
      expect(rec!.headline.values.hours).toBe(5)
      expect(rec!.headline.values.days).toBe(4)
    })

    it('biases distributed picks toward the end of the month when there is slack', () => {
      // The user-reported bug: today=May 14 with 8h gap and 18 eligible days
      // used to suggest a single 8h plan TODAY. New behavior: 2x4h spaced
      // toward the end of the month so the user gets breathing room.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-14'),
        loggedAdjustedMinutes: 42 * 60,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('distributed')
      expect(rec!.plans).toHaveLength(2)
      expect(rec!.plans.every((p) => p.minutes === 4 * 60)).toBe(true)
      // Both proposed days must sit comfortably in the back half of the month,
      // and never on today.
      for (const p of rec!.plans) {
        const d = momentStoredDate(p.date)
        expect(d.isAfter(momentStoredDate('2026-05-14'), 'day')).toBe(true)
        expect(d.isSameOrAfter(momentStoredDate('2026-05-22'), 'day')).toBe(
          true
        )
      }
      // And the very last proposed day should hug the end of the month.
      const last = rec!.plans[rec!.plans.length - 1]
      expect(momentStoredDate(last.date).format('YYYY-MM-DD')).toBe(
        '2026-05-31'
      )
    })

    it('proposes 2x5h for a 10h gap mid-month (fewer medium days, spread out)', () => {
      // Frontloaded user: 40h logged, 10h to go, plenty of month left.
      // ceil(10/6) = 2 days at 10/2 = 5h each.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-10'),
        loggedAdjustedMinutes: 40 * 60,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('distributed')
      expect(rec!.plans).toHaveLength(2)
      expect(rec!.plans.every((p) => p.minutes === 5 * 60)).toBe(true)
      // Both days should sit in the back half of the month.
      for (const p of rec!.plans) {
        expect(
          momentStoredDate(p.date).isSameOrAfter(
            momentStoredDate('2026-05-15'),
            'day'
          )
        ).toBe(true)
      }
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

    it('excludes weekdays in offDays from the eligible pool', () => {
      // May 22, 2026 is a Friday. Marking Friday as an Off Day means the first
      // eligible day must not be a Friday.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        loggedAdjustedMinutes: 44 * 60,
        offDays: [5],
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

    it('emits the rest_recommended_then_resume rationale when the tiredness signal triggers', () => {
      // 13h logged in the prior 3 days exceeds the default 12h threshold.
      // The proposal is already scheduled at the end of the month (which gives
      // plenty of rest); the rationale tag is what changes.
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
      // Today=May 22 (10 eligible days, < recurring horizon), gap=7h.
      // Primary shape = distributed (gap > stretchCap=6h, eligibleLen < 14).
      // Concentrated is also viable (gap ≤ absoluteCap=8h). With distributed
      // dismissed ≥3 times, engine should fall back to concentrated.
      const now = Date.now()
      const dismissed = (i: number) => ({
        shape: 'distributed' as const,
        action: 'dismissed' as const,
        at: now - i,
      })
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        monthlyGoalHours: 50,
        loggedAdjustedMinutes: 43 * 60,
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

  describe('meeting days', () => {
    it('does not propose a concentrated plan on a meeting weekday when a non-meeting weekday is available', () => {
      // May 22, 2026 is a Friday. Mark Friday as a meeting day so the last
      // eligible day (the natural concentrated pick) is skipped in favor of
      // the previous non-meeting day.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        loggedAdjustedMinutes: 44 * 60,
        meetingDays: [5],
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('concentrated')
      expect(rec!.plans).toHaveLength(1)
      expect(momentStoredDate(rec!.plans[0].date).day()).not.toBe(5)
    })

    it('keeps distributed picks off meeting days when non-meeting capacity is sufficient', () => {
      // 20h gap, lots of eligible days, mark Wed (3) + Sun (0) as meeting
      // days. Engine should pick only non-meeting days.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-10'),
        loggedAdjustedMinutes: 30 * 60,
        meetingDays: [0, 3],
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('distributed')
      for (const p of rec!.plans) {
        const wd = momentStoredDate(p.date).day()
        expect([0, 3]).not.toContain(wd)
      }
    })

    it('treats Off Day as winning over Meeting Day when both flags overlap', () => {
      // Friday (5) is both an Off Day and a Meeting Day. The engine should
      // exclude Friday entirely (no proposal on a Friday at any cap).
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        loggedAdjustedMinutes: 44 * 60,
        offDays: [5],
        meetingDays: [5],
      })

      expect(rec).not.toBeNull()
      for (const p of rec!.plans) {
        expect(momentStoredDate(p.date).day()).not.toBe(5)
      }
    })

    it('caps meeting-day sessions at the meeting absolute cap when no non-meeting days remain', () => {
      // Today=May 28 (Thu), end-of-month horizon: May 28–31. Goal 50h logged
      // 47h ⇒ gap 3h. Mark every remaining weekday (Thu, Fri, Sat, Sun) as a
      // meeting day so all eligible days are meeting days. Engine must pick a
      // meeting day with at most meetingAbsoluteCap = 3h.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-28'),
        loggedAdjustedMinutes: 47 * 60,
        meetingDays: [0, 4, 5, 6],
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('concentrated')
      expect(rec!.plans).toHaveLength(1)
      // 3h gap fits inside meeting absolute cap (3h), so the engine schedules
      // it. The cap protects against ever proposing more than 3h here.
      expect(rec!.plans[0].minutes).toBeLessThanOrEqual(3 * 60)
    })

    it('returns null from concentrated when only meeting days remain and the gap exceeds the meeting cap', () => {
      // 6h gap with only meeting days available exceeds the 3h meeting
      // absolute cap. Concentrated must fail; the engine should fall back to
      // distributed (which then spreads across meeting days at their cap).
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-28'),
        loggedAdjustedMinutes: 44 * 60,
        meetingDays: [0, 4, 5, 6],
      })

      expect(rec).not.toBeNull()
      // Engine falls back to distributed across the meeting days. Each
      // proposed plan must respect the meeting absolute cap.
      for (const p of rec!.plans) {
        expect(p.minutes).toBeLessThanOrEqual(3 * 60)
      }
    })

    it('does not pick a recurring pattern that lands on meeting days', () => {
      // Recurring scenario from the existing test (May 18, gap 60h ≥ 14d
      // horizon). Mark Mon (1) as a meeting day. The pattern should skip Mon.
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-18'),
        monthlyGoalHours: 60,
        loggedAdjustedMinutes: 0,
        meetingDays: [1],
      })

      expect(rec).not.toBeNull()
      // Engine may pick recurring (without Mon) or fall back to distributed.
      // Either way, no proposal should land on Mon.
      for (const p of rec!.plans) {
        expect(momentStoredDate(p.date).day()).not.toBe(1)
      }
    })
  })
})
