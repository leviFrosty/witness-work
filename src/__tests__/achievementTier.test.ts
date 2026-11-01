import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  isPersonalBest12mo,
  monthCelebrationKey,
  resolveTier,
  tierFromPercent,
} from '@/lib/achievementTier'
import {
  LegacyTimeEntry,
  TimeEntry,
  TimeEntriesByYear,
} from '@/types/timeEntry'
import { Publisher } from '@/types/publisher'
import { normalizeDateForStorage } from '@/lib/normalizeDate'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

type ReportInput = {
  month: number
  year: number
  hours?: number
  minutes?: number
  ldc?: boolean
  tag?: string
  credit?: boolean
}

const buildReport = (input: ReportInput, idx: number): LegacyTimeEntry => ({
  id: `r-${idx}`,

  date: normalizeDateForStorage(
    new Date(Date.UTC(input.year, input.month, 15))
  ),
  hours: input.hours ?? 0,
  minutes: input.minutes ?? 0,
  ldc: input.ldc,
  tag: input.tag,
  credit: input.credit,
})

const buildServiceReports = (inputs: ReportInput[]): TimeEntriesByYear => {
  const out: TimeEntriesByYear = {}
  inputs.forEach((input, idx) => {
    if (!out[input.year]) out[input.year] = {}
    if (!out[input.year][input.month]) out[input.year][input.month] = []
    out[input.year][input.month].push(buildReport(input, idx) as TimeEntry)
  })
  return out
}

const REGULAR_PIONEER: Publisher = 'regularPioneer'
const SPECIAL_PIONEER: Publisher = 'specialPioneer'
const NO_OVERRIDE = { enabled: false, customLimitHours: 0 }

describe('lib/achievementTier', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('tierFromPercent', () => {
    it('returns null below 100% — callers render the normal progress state', () => {
      expect(tierFromPercent(0)).toBeNull()
      expect(tierFromPercent(50)).toBeNull()
      expect(tierFromPercent(99.99)).toBeNull()
    })

    it('returns "reached" for 100-109%', () => {
      expect(tierFromPercent(100)).toBe('reached')
      expect(tierFromPercent(105)).toBe('reached')
      expect(tierFromPercent(109.99)).toBe('reached')
    })

    it('returns "exceeded" for 110-149%', () => {
      expect(tierFromPercent(110)).toBe('exceeded')
      expect(tierFromPercent(125)).toBe('exceeded')
      expect(tierFromPercent(149.99)).toBe('exceeded')
    })

    it('returns "crushed" for 150%+ (no automatic record promotion)', () => {
      expect(tierFromPercent(150)).toBe('crushed')
      expect(tierFromPercent(199.99)).toBe('crushed')
      expect(tierFromPercent(200)).toBe('crushed')
      expect(tierFromPercent(286)).toBe('crushed')
      expect(tierFromPercent(500)).toBe('crushed')
    })
  })

  describe('resolveTier', () => {
    it('returns null when goal not met regardless of personal-best flag', () => {
      expect(resolveTier(0, true)).toBeNull()
      expect(resolveTier(50, true)).toBeNull()
      expect(resolveTier(99, false)).toBeNull()
    })

    it('returns the threshold tier when goal met but not a personal best', () => {
      expect(resolveTier(100, false)).toBe('reached')
      expect(resolveTier(120, false)).toBe('exceeded')
      expect(resolveTier(160, false)).toBe('crushed')
    })

    it('promotes any goal-met month to "record" when it is a personal best, regardless of starting tier', () => {
      expect(resolveTier(100, true)).toBe('record')
      expect(resolveTier(135, true)).toBe('record')
      expect(resolveTier(199, true)).toBe('record')
      expect(resolveTier(500, true)).toBe('record')
    })

    it('keeps tier at "crushed" for 200%+ when not a personal best (regression)', () => {
      expect(resolveTier(200, false)).toBe('crushed')
      expect(resolveTier(286, false)).toBe('crushed')
    })
  })

  describe('isPersonalBest12mo', () => {
    it('returns false for zero or negative hoursCompleted', () => {
      expect(
        isPersonalBest12mo({}, 3, 2026, 0, REGULAR_PIONEER, NO_OVERRIDE)
      ).toBe(false)
      expect(
        isPersonalBest12mo({}, 3, 2026, -5, REGULAR_PIONEER, NO_OVERRIDE)
      ).toBe(false)
    })

    it('returns true when there is no prior history', () => {
      const reports = buildServiceReports([
        { month: 3, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, REGULAR_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    it('returns true when current strictly beats every prior month in window', () => {
      const reports = buildServiceReports([
        { month: 1, year: 2026, hours: 60 },
        { month: 2, year: 2026, hours: 80 },
        { month: 3, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, REGULAR_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    it('returns false when ANY prior month within 12mo has higher adjusted hours (the reported bug)', () => {
      const reports = buildServiceReports([
        { month: 1, year: 2026, hours: 143 },
        { month: 2, year: 2026, hours: 32 },
        { month: 3, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(false)
    })

    it('full integration of the reported bug: resolveTier returns "crushed", not "record"', () => {
      const reports = buildServiceReports([
        { month: 1, year: 2026, hours: 143 },
        { month: 2, year: 2026, hours: 32 },
        { month: 3, year: 2026, hours: 100 },
      ])
      const isBest = isPersonalBest12mo(
        reports,
        3,
        2026,
        100,
        SPECIAL_PIONEER,
        NO_OVERRIDE
      )
      const goalHours = 50
      const percent = (100 / goalHours) * 100
      expect(isBest).toBe(false)
      expect(resolveTier(percent, isBest)).toBe('crushed')
    })

    it('treats equal prior hours as blocking the record (>= comparison)', () => {
      const reports = buildServiceReports([
        { month: 2, year: 2026, hours: 100 },
        { month: 3, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(false)
    })

    it('ignores higher months that fall OUTSIDE the 12-month window', () => {
      const reports = buildServiceReports([
        { month: 2, year: 2025, hours: 500 },
        { month: 3, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    it('considers the boundary month (exactly 12 months back) as IN-window', () => {
      const reports = buildServiceReports([
        { month: 3, year: 2025, hours: 200 },
        { month: 3, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(false)
    })

    it('handles gaps in history (missing months do not block the record)', () => {
      const reports = buildServiceReports([
        { month: 1, year: 2026, hours: 80 },

        { month: 3, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    it('crosses year boundaries correctly when looking back', () => {
      const reports = buildServiceReports([
        { month: 7, year: 2025, hours: 110 },
        { month: 11, year: 2025, hours: 90 },
        { month: 0, year: 2026, hours: 80 },
        { month: 1, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 1, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(false)
    })

    it('returns true when years of history exist but nothing in the 12mo window beats current', () => {
      const reports = buildServiceReports([
        { month: 0, year: 2024, hours: 500 },

        { month: 6, year: 2025, hours: 50 },
        { month: 11, year: 2025, hours: 70 },
        { month: 2, year: 2026, hours: 80 },

        { month: 3, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    describe('credit limit interactions', () => {
      it('regular pioneer: prior month with all-LDC time is capped at 55h', () => {
        const reports = buildServiceReports([
          { month: 2, year: 2026, hours: 80, ldc: true },
          { month: 3, year: 2026, hours: 60 },
        ])
        expect(
          isPersonalBest12mo(reports, 3, 2026, 60, REGULAR_PIONEER, NO_OVERRIDE)
        ).toBe(true)
      })

      it('special pioneer: no credit cap means LDC-heavy prior months still count fully', () => {
        const reports = buildServiceReports([
          { month: 2, year: 2026, hours: 80, ldc: true },
          { month: 3, year: 2026, hours: 60 },
        ])
        expect(
          isPersonalBest12mo(reports, 3, 2026, 60, SPECIAL_PIONEER, NO_OVERRIDE)
        ).toBe(false)
      })

      it('honors a custom credit limit override (regular pioneer with 30h cap)', () => {
        const reports = buildServiceReports([
          { month: 2, year: 2026, hours: 50, ldc: true },
          { month: 3, year: 2026, hours: 40 },
        ])
        expect(
          isPersonalBest12mo(reports, 3, 2026, 40, REGULAR_PIONEER, {
            enabled: true,
            customLimitHours: 30,
          })
        ).toBe(true)
      })

      it('treats customLimitHours: 0 as "no limit" (matches adjustedMinutes semantics)', () => {
        const reports = buildServiceReports([
          { month: 2, year: 2026, hours: 80, ldc: true },
          { month: 3, year: 2026, hours: 60 },
        ])
        expect(
          isPersonalBest12mo(reports, 3, 2026, 60, REGULAR_PIONEER, {
            enabled: true,
            customLimitHours: 0,
          })
        ).toBe(false)
      })

      it.each(['publisher', 'regularAuxiliary'] as const)(
        'ignores a saved credit override for %s when comparing prior months',
        (publisher) => {
          const reports = buildServiceReports([
            { month: 2, year: 2026, hours: 50, ldc: true },
            { month: 3, year: 2026, hours: 40 },
          ])
          expect(
            isPersonalBest12mo(reports, 3, 2026, 40, publisher, {
              enabled: true,
              customLimitHours: 30,
            })
          ).toBe(false)
        }
      )
    })

    it('still works when current month has reports but they are not part of the prior loop', () => {
      const reports = buildServiceReports([
        { month: 3, year: 2026, hours: 1000 },
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 50, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    it('is robust when "now" falls on a day that does not exist in target month (Jan 31 → Feb)', () => {
      vi.setSystemTime(new Date('2026-01-31T12:00:00Z'))
      const reports = buildServiceReports([
        { month: 1, year: 2025, hours: 200 },
        { month: 1, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 1, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(false)
    })
  })

  describe('monthCelebrationKey', () => {
    it('zero-pads single-digit months and concatenates with year', () => {
      expect(monthCelebrationKey(0, 2026)).toBe('2026-01')
      expect(monthCelebrationKey(8, 2026)).toBe('2026-09')
      expect(monthCelebrationKey(11, 2026)).toBe('2026-12')
    })
  })
})
