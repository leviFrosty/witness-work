import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  generateRecommendation,
  proposedPlanLocalDay,
} from '@/lib/assistantRecommendation'
import { momentStoredDate, normalizeDateForStorage } from '@/lib/normalizeDate'
import type { Visit } from '@/types/visit'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

const baseInput = {
  year: 2026,
  month: 4,
  today: normalizeDateForStorage('2026-05-01'),
  monthlyGoalHours: 50,

  standardGapMinutes: 50 * 60,
  dayPlans: [] as DayPlan[],
  recurringPlans: [] as RecurringPlan[],
  conversations: [] as Visit[],
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

  it('returns null when there is no remaining standard gap (logged meets the goal)', () => {
    expect(
      generateRecommendation({
        ...baseInput,
        standardGapMinutes: 0,
      })
    ).toBeNull()
  })

  it('returns null when the projection (logged + planned) already meets the goal', () => {
    expect(
      generateRecommendation({
        ...baseInput,
        standardGapMinutes: 0,
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
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        standardGapMinutes: 20 * 60,
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
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-14'),
        standardGapMinutes: 8 * 60,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('distributed')
      expect(rec!.plans).toHaveLength(2)
      expect(rec!.plans.every((p) => p.minutes === 4 * 60)).toBe(true)

      for (const p of rec!.plans) {
        const d = momentStoredDate(p.date)
        expect(d.isAfter(momentStoredDate('2026-05-14'), 'day')).toBe(true)
        expect(d.isSameOrAfter(momentStoredDate('2026-05-22'), 'day')).toBe(
          true
        )
      }

      const last = rec!.plans[rec!.plans.length - 1]
      expect(momentStoredDate(last.date).format('YYYY-MM-DD')).toBe(
        '2026-05-31'
      )
    })

    it('proposes 2x5h for a 10h gap mid-month (fewer medium days, spread out)', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-10'),
        standardGapMinutes: 10 * 60,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('distributed')
      expect(rec!.plans).toHaveLength(2)
      expect(rec!.plans.every((p) => p.minutes === 5 * 60)).toBe(true)

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
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-18'),
        monthlyGoalHours: 60,
        standardGapMinutes: 60 * 60,
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

    it('sizes a recurring pattern to the weeks left, not the eligible-day count', () => {
      const rec = generateRecommendation({
        ...baseInput,
        year: 2026,
        month: 9,
        today: normalizeDateForStorage('2026-10-05'),
        standardGapMinutes: 50 * 60,
        offDays: [0, 4, 5],
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('recurring')
      expect(rec!.headline.values.weeks).toBe(4)
      const total = rec!.plans.reduce((s, p) => s + p.minutes, 0)
      expect(total).toBeGreaterThanOrEqual(50 * 60)

      expect(total - 50 * 60).toBeLessThan(rec!.plans.length * 60)
    })

    it('excludes weekdays in offDays from the eligible pool', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        standardGapMinutes: 6 * 60,
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
        standardGapMinutes: 20 * 60,
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
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        standardGapMinutes: 6 * 60,
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
        standardGapMinutes: 7 * 60,
        assistantHistory: [dismissed(1), dismissed(2), dismissed(3)],
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).not.toBe('distributed')
    })

    it('falls through to best-effort distributed at stretch cap when the goal is unreachable', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-27'),
        monthlyGoalHours: 50,
        standardGapMinutes: 40 * 60,
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('distributed')
      expect(rec!.rationale.code).toBe('best_effort_unreachable_goal')
      expect(rec!.plans).toHaveLength(5)
      expect(rec!.plans.every((p) => p.minutes === 6 * 60)).toBe(true)
    })

    it('skips days that already have a DayPlan', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-15'),
        standardGapMinutes: 5 * 60,
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
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-15'),
        standardGapMinutes: 6 * 60,
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
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        standardGapMinutes: 6 * 60,
        meetingDays: [5],
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('concentrated')
      expect(rec!.plans).toHaveLength(1)
      expect(momentStoredDate(rec!.plans[0].date).day()).not.toBe(5)
    })

    it('keeps distributed picks off meeting days when non-meeting capacity is sufficient', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-10'),
        standardGapMinutes: 20 * 60,
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
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-22'),
        standardGapMinutes: 6 * 60,
        offDays: [5],
        meetingDays: [5],
      })

      expect(rec).not.toBeNull()
      for (const p of rec!.plans) {
        expect(momentStoredDate(p.date).day()).not.toBe(5)
      }
    })

    it('caps meeting-day sessions at the meeting absolute cap when no non-meeting days remain', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-28'),
        standardGapMinutes: 3 * 60,
        meetingDays: [0, 4, 5, 6],
      })

      expect(rec).not.toBeNull()
      expect(rec!.shape).toBe('concentrated')
      expect(rec!.plans).toHaveLength(1)

      expect(rec!.plans[0].minutes).toBeLessThanOrEqual(3 * 60)
    })

    it('returns null from concentrated when only meeting days remain and the gap exceeds the meeting cap', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-28'),
        standardGapMinutes: 6 * 60,
        meetingDays: [0, 4, 5, 6],
      })

      expect(rec).not.toBeNull()

      for (const p of rec!.plans) {
        expect(p.minutes).toBeLessThanOrEqual(3 * 60)
      }
    })

    it('does not pick a recurring pattern that lands on meeting days', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-18'),
        monthlyGoalHours: 60,
        standardGapMinutes: 60 * 60,
        meetingDays: [1],
      })

      expect(rec).not.toBeNull()

      for (const p of rec!.plans) {
        expect(momentStoredDate(p.date).day()).not.toBe(1)
      }
    })
  })

  describe('spreadEvenly', () => {
    const minutes = (rec: ReturnType<typeof generateRecommendation>) =>
      rec!.plans.map((p) => p.minutes)

    it('spreads the gap across every picked day instead of front-loading 6h days', () => {
      const rec = generateRecommendation({
        ...baseInput,
        year: 2026,
        month: 9,
        today: normalizeDateForStorage('2026-10-13'),
        standardGapMinutes: 50 * 60,
        offDays: [1, 3, 5],
        spreadEvenly: true,
      })

      expect(rec!.shape).toBe('distributed')
      expect(rec!.plans).toHaveLength(11)
      expect(minutes(rec).every((m) => m === 4 * 60 || m === 5 * 60)).toBe(true)
      expect(minutes(rec).reduce((s, m) => s + m, 0)).toBe(50 * 60)
    })

    it('uses every picked day early in the month instead of a recurring subset', () => {
      const rec = generateRecommendation({
        ...baseInput,
        year: 2026,
        month: 9,
        today: normalizeDateForStorage('2026-10-01'),
        standardGapMinutes: 50 * 60,
        offDays: [1, 3, 5],
        spreadEvenly: true,
      })

      expect(rec!.plans).toHaveLength(18)
      expect(minutes(rec).every((m) => m === 2 * 60 || m === 3 * 60)).toBe(true)
      expect(minutes(rec).reduce((s, m) => s + m, 0)).toBe(50 * 60)
    })

    it('leaves skipped days alone', () => {
      const rec = generateRecommendation({
        ...baseInput,
        year: 2026,
        month: 9,
        today: normalizeDateForStorage('2026-10-01'),
        standardGapMinutes: 50 * 60,
        offDays: [1, 3, 5],
        spreadEvenly: true,
        skipDayKeys: new Set(['2026-10-01', '2026-10-03']),
      })

      const days = rec!.plans.map((p) => proposedPlanLocalDay(p).getDate())
      expect(days).toHaveLength(16)
      expect(days).not.toContain(1)
      expect(days).not.toContain(3)
      expect(minutes(rec).reduce((s, m) => s + m, 0)).toBe(50 * 60)
    })

    it('uses fewer days for a small gap so no session drops under 2h', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-14'),
        standardGapMinutes: 5 * 60 + 30,
        spreadEvenly: true,
      })

      expect(rec!.plans).toHaveLength(2)
      expect(minutes(rec).every((m) => m >= 2 * 60)).toBe(true)
      expect(minutes(rec).reduce((s, m) => s + m, 0)).toBe(5 * 60 + 30)
    })

    it('keeps sessions off meeting days', () => {
      const rec = generateRecommendation({
        ...baseInput,
        today: normalizeDateForStorage('2026-05-14'),
        standardGapMinutes: 30 * 60,
        meetingDays: [2, 6],
        spreadEvenly: true,
      })

      for (const p of rec!.plans) {
        expect([2, 6]).not.toContain(momentStoredDate(p.date).day())
      }
    })
  })
})
