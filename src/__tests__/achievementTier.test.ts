import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import moment from 'moment'
import {
  isPersonalBest12mo,
  monthCelebrationKey,
  resolveTier,
  tierFromPercent,
} from '@/lib/achievementTier'
import {
  LegacyServiceReport,
  ServiceReport,
  ServiceReportsByYears,
} from '@/types/serviceReport'
import { Publisher } from '@/types/publisher'
import { normalizeDateForStorage } from '@/lib/normalizeDate'

// Tests pull in modules that transitively touch MMKV, which doesn't exist
// in the vitest env.
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

type ReportInput = {
  /** 0-indexed (Jan=0). */
  month: number
  year: number
  hours?: number
  minutes?: number
  ldc?: boolean
  tag?: string
  credit?: boolean
}

const buildReport = (input: ReportInput, idx: number): LegacyServiceReport => ({
  id: `r-${idx}`,
  // Mid-month, anchored noon-UTC the same way the production write-path does
  // it. Using the 15th avoids any "first/last day rolls into adjacent month
  // under TZ shift" footguns in tests.
  date: normalizeDateForStorage(
    new Date(Date.UTC(input.year, input.month, 15))
  ),
  hours: input.hours ?? 0,
  minutes: input.minutes ?? 0,
  ldc: input.ldc,
  tag: input.tag,
  credit: input.credit,
})

const buildServiceReports = (inputs: ReportInput[]): ServiceReportsByYears => {
  const out: ServiceReportsByYears = {}
  inputs.forEach((input, idx) => {
    if (!out[input.year]) out[input.year] = {}
    if (!out[input.year][input.month]) out[input.year][input.month] = []
    out[input.year][input.month].push(buildReport(input, idx) as ServiceReport)
  })
  return out
}

const PUBLISHER: Publisher = 'publisher'
const REGULAR_PIONEER: Publisher = 'regularPioneer'
const SPECIAL_PIONEER: Publisher = 'specialPioneer'
const NO_OVERRIDE = { enabled: false, customLimitHours: 0 }

describe('lib/achievementTier', () => {
  // The function reads `moment()` to seed today's day before stamping in the
  // target month/year. Pin time so tests are deterministic regardless of when
  // the suite runs (e.g. on Feb 29 of a leap year, or on the 31st of a 31-day
  // month while the target month has only 30).
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

    it('never returns "record" — that tier is reserved for personal bests', () => {
      const samples = [100, 110, 150, 200, 300, 1000]
      for (const pct of samples) {
        expect(tierFromPercent(pct)).not.toBe('record')
      }
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
      expect(resolveTier(286, false)).toBe('crushed')
    })

    it('promotes any goal-met month to "record" when it is a personal best, regardless of starting tier', () => {
      expect(resolveTier(100, true)).toBe('record') // reached → record
      expect(resolveTier(135, true)).toBe('record') // exceeded → record
      expect(resolveTier(199, true)).toBe('record') // crushed → record
      expect(resolveTier(500, true)).toBe('record') // crushed → record
    })

    it('does NOT promote when goal not met, even if isPersonalBest is true', () => {
      // Defensive: callers should already gate on `hasMetGoal`, but the
      // function itself must not crown a sub-100% month.
      expect(resolveTier(80, true)).toBeNull()
    })

    it('keeps tier at "crushed" for 200%+ when not a personal best (regression)', () => {
      // The reported bug: prior month had 143h, current month has 100h with a
      // 50h goal (200%). Without a personal best, the current month must NOT
      // be promoted to "record".
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
        { month: 3, year: 2026, hours: 100 }, // current
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, REGULAR_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    it('returns true when current strictly beats every prior month in window', () => {
      const reports = buildServiceReports([
        { month: 1, year: 2026, hours: 60 }, // Feb
        { month: 2, year: 2026, hours: 80 }, // Mar
        { month: 3, year: 2026, hours: 100 }, // Apr (current)
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, REGULAR_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    it('returns false when ANY prior month within 12mo has higher adjusted hours (the reported bug)', () => {
      // User's repro: 143 / 32 / 100 with current = April 2026.
      // 143 in Feb beats 100 in Apr, so 100 is NOT a personal best.
      const reports = buildServiceReports([
        { month: 1, year: 2026, hours: 143 }, // Feb — capped by credit limit if all LDC
        { month: 2, year: 2026, hours: 32 }, // Mar
        { month: 3, year: 2026, hours: 100 }, // Apr (current)
      ])
      expect(
        isPersonalBest12mo(
          reports,
          3,
          2026,
          100,
          SPECIAL_PIONEER, // no credit cap → all 143 standard hours count
          NO_OVERRIDE
        )
      ).toBe(false)
    })

    it('full integration of the reported bug: resolveTier returns "crushed", not "record"', () => {
      // Goal = 50h (regular pioneer). Current = 100h → 200% of goal.
      // Prior month in window had 143h (286%). Current is NOT a personal
      // best, so resolveTier must return 'crushed', not 'record'.
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
      // A tie with a prior month is not a record — callers will see 'crushed'
      // (or whatever the threshold gives) instead of being promoted.
      const reports = buildServiceReports([
        { month: 2, year: 2026, hours: 100 }, // Mar — ties with current
        { month: 3, year: 2026, hours: 100 }, // Apr (current)
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(false)
    })

    it('ignores higher months that fall OUTSIDE the 12-month window', () => {
      // April 2025 is exactly 12 months back — included.
      // March 2025 is 13 months back — excluded.
      const reports = buildServiceReports([
        { month: 2, year: 2025, hours: 500 }, // Mar 2025 — too old, must be ignored
        { month: 3, year: 2026, hours: 100 }, // Apr 2026 (current)
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    it('considers the boundary month (exactly 12 months back) as IN-window', () => {
      // April 2025 → April 2026 is i=12 in the loop. A higher value there
      // must block the record.
      const reports = buildServiceReports([
        { month: 3, year: 2025, hours: 200 }, // Apr 2025 — in window at i=12
        { month: 3, year: 2026, hours: 100 }, // Apr 2026 (current)
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(false)
    })

    it('handles gaps in history (missing months do not block the record)', () => {
      // Only Feb and Apr have reports; Mar / Jan / Dec / etc. are gaps.
      // Gaps are zero-hours-equivalent and cannot beat the current month.
      const reports = buildServiceReports([
        { month: 1, year: 2026, hours: 80 }, // Feb
        // Mar 2026 — gap
        { month: 3, year: 2026, hours: 100 }, // Apr (current)
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    it('crosses year boundaries correctly when looking back', () => {
      // Current = Feb 2026. Window covers Feb 2025 — Jan 2026.
      // Highest prior in window is in Aug 2025 — must block the record.
      const reports = buildServiceReports([
        { month: 7, year: 2025, hours: 110 }, // Aug 2025 — beats current
        { month: 11, year: 2025, hours: 90 }, // Dec 2025
        { month: 0, year: 2026, hours: 80 }, // Jan 2026
        { month: 1, year: 2026, hours: 100 }, // Feb 2026 (current)
      ])
      expect(
        isPersonalBest12mo(reports, 1, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(false)
    })

    it('returns true when years of history exist but nothing in the 12mo window beats current', () => {
      const reports = buildServiceReports([
        // 2+ years ago — 500h spike, must be ignored
        { month: 0, year: 2024, hours: 500 },
        // Within window, all under current
        { month: 6, year: 2025, hours: 50 },
        { month: 11, year: 2025, hours: 70 },
        { month: 2, year: 2026, hours: 80 },
        // Current
        { month: 3, year: 2026, hours: 100 },
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 100, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    describe('credit limit interactions', () => {
      it('regular pioneer: prior month with all-LDC time is capped at 55h', () => {
        // Prior raw time = 80h, all LDC. Regular pioneer is capped at 55h
        // credit. So the *adjusted* prior month is 55h, not 80h.
        // Current month (60h) beats that → personal best.
        const reports = buildServiceReports([
          { month: 2, year: 2026, hours: 80, ldc: true }, // Mar — capped at 55
          { month: 3, year: 2026, hours: 60 }, // Apr — current standard
        ])
        expect(
          isPersonalBest12mo(reports, 3, 2026, 60, REGULAR_PIONEER, NO_OVERRIDE)
        ).toBe(true)
      })

      it('special pioneer: no credit cap means LDC-heavy prior months still count fully', () => {
        // Same data as above, but special pioneer has no credit cap.
        // Prior month is 80h adjusted, which beats current 60h.
        const reports = buildServiceReports([
          { month: 2, year: 2026, hours: 80, ldc: true },
          { month: 3, year: 2026, hours: 60 },
        ])
        expect(
          isPersonalBest12mo(reports, 3, 2026, 60, SPECIAL_PIONEER, NO_OVERRIDE)
        ).toBe(false)
      })

      it('honors a custom credit limit override (regular publisher with 30h cap)', () => {
        // Prior month: 50h all LDC. With a 30h custom credit cap, that's
        // capped to 30h adjusted. Current month: 40h standard → beats it.
        const reports = buildServiceReports([
          { month: 2, year: 2026, hours: 50, ldc: true },
          { month: 3, year: 2026, hours: 40 },
        ])
        expect(
          isPersonalBest12mo(reports, 3, 2026, 40, PUBLISHER, {
            enabled: true,
            customLimitHours: 30,
          })
        ).toBe(true)
      })

      it('treats customLimitHours: 0 as "no limit" (matches adjustedMinutes semantics)', () => {
        // 0 means uncapped — prior month should retain its full 80h LDC.
        const reports = buildServiceReports([
          { month: 2, year: 2026, hours: 80, ldc: true },
          { month: 3, year: 2026, hours: 60 },
        ])
        expect(
          isPersonalBest12mo(reports, 3, 2026, 60, PUBLISHER, {
            enabled: true,
            customLimitHours: 0,
          })
        ).toBe(false)
      })
    })

    it('still works when current month has reports but they are not part of the prior loop', () => {
      // The function only inspects PRIOR months. The current month's entry in
      // serviceReports must not block its own record claim.
      const reports = buildServiceReports([
        { month: 3, year: 2026, hours: 1000 }, // current — should be ignored
      ])
      expect(
        isPersonalBest12mo(reports, 3, 2026, 50, SPECIAL_PIONEER, NO_OVERRIDE)
      ).toBe(true)
    })

    it('is robust when "now" falls on a day that does not exist in target month (Jan 31 → Feb)', () => {
      // Pin the wall clock to Jan 31. Target current month = Feb 2026 (28
      // days). moment().month(1) from Jan 31 rolls to last-of-Feb. The
      // function should still walk back 12 months without skipping any.
      vi.setSystemTime(new Date('2026-01-31T12:00:00Z'))
      const reports = buildServiceReports([
        // 12 months prior to Feb 2026 = Feb 2025. Put a blocker there.
        { month: 1, year: 2025, hours: 200 },
        { month: 1, year: 2026, hours: 100 }, // current
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

    it('produces stable keys regardless of moment instance', () => {
      const m = moment().month(3).year(2026)
      expect(monthCelebrationKey(m.month(), m.year())).toBe('2026-04')
    })
  })
})
