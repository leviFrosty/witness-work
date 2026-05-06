import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'
import { ServiceReport, ServiceReportsByYears } from '../types/serviceReport'
import { ServiceReportPeriod } from '../lib/serviceReportPeriod'

vi.mock('../lib/logger', () => import('./mocks/logger'))

const reports = (
  year: number,
  month: number,
  entries: Partial<ServiceReport>[]
): ServiceReportsByYears => ({
  [year]: {
    [month]: entries.map((e, i) => ({
      id: e.id ?? `id-${year}-${month}-${i}`,
      hours: e.hours ?? 0,
      minutes: e.minutes ?? 0,
      date: e.date ?? new Date(year, month, 15, 12, 0, 0),
      ...e,
    })),
  },
})

describe('ServiceReportPeriod.forMonth', () => {
  describe('adjustedMinutes', () => {
    it('sums standard hours into adjustedMinutes.value for a single-report month', () => {
      const serviceReports = reports(2026, 4, [{ hours: 2, minutes: 30 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports,
      })

      expect(period.adjustedMinutes.value).toBe(2 * 60 + 30)
    })

    it('returns zeroed adjustedMinutes when the period has no reports', () => {
      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports: {},
      })

      expect(period.adjustedMinutes).toEqual({
        value: 0,
        standard: 0,
        credit: 0,
        creditOverage: 0,
      })
    })

    it('caps adjustedMinutes at the default 55-hour credit limit', () => {
      const serviceReports = reports(2026, 4, [
        { id: 'std', hours: 30, minutes: 0 },
        { id: 'ldc', hours: 40, minutes: 0, ldc: true },
      ])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports,
      })

      expect(period.adjustedMinutes.value).toBe(55 * 60)
      expect(period.adjustedMinutes.creditOverage).toBe(15 * 60)
    })

    it('honors a publisher-specific credit-limit exemption (special pioneer)', () => {
      const serviceReports = reports(2026, 4, [
        { id: 'std', hours: 80, minutes: 0 },
        { id: 'ldc', hours: 30, minutes: 0, ldc: true },
      ])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports,
        publisher: 'specialPioneer',
      })

      expect(period.adjustedMinutes.value).toBe(110 * 60)
      expect(period.adjustedMinutes.creditOverage).toBe(0)
    })

    it('honors a user credit-limit override', () => {
      const serviceReports = reports(2026, 4, [
        { id: 'std', hours: 45, minutes: 0 },
        { id: 'ldc', hours: 40, minutes: 0, ldc: true },
      ])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports,
        publisher: 'regularPioneer',
        creditLimitOverride: { enabled: true, customLimitHours: 70 },
      })

      expect(period.adjustedMinutes.value).toBe(70 * 60)
      expect(period.adjustedMinutes.creditOverage).toBe(15 * 60)
    })

    it('isolates January from prior December across a year boundary', () => {
      const serviceReports: ServiceReportsByYears = {
        2025: {
          11: [
            {
              id: 'dec-2025',
              hours: 99,
              minutes: 0,
              date: new Date(Date.UTC(2025, 11, 31, 12, 0, 0)),
            },
          ],
        },
        2026: {
          0: [
            {
              id: 'jan-2026',
              hours: 1,
              minutes: 0,
              date: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)),
            },
          ],
        },
      }

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 0,
        serviceReports,
      })

      expect(period.adjustedMinutes.value).toBe(60)
    })

    it('isolates the period: reports in adjacent months do not contribute', () => {
      const serviceReports: ServiceReportsByYears = {
        2026: {
          3: [
            {
              id: 'april',
              hours: 99,
              minutes: 0,
              date: new Date(2026, 3, 30, 12, 0, 0),
            },
          ],
          4: [
            {
              id: 'may',
              hours: 1,
              minutes: 30,
              date: new Date(2026, 4, 1, 12, 0, 0),
            },
          ],
          5: [
            {
              id: 'june',
              hours: 99,
              minutes: 0,
              date: new Date(2026, 5, 1, 12, 0, 0),
            },
          ],
        },
      }

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports,
      })

      expect(period.adjustedMinutes.value).toBe(60 + 30)
    })
  })

  describe('goalRemaining', () => {
    it('returns goalHours * 60 minus adjustedMinutes when under the goal', () => {
      const serviceReports = reports(2026, 4, [{ hours: 10, minutes: 0 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports,
        goalHours: 25,
      })

      expect(period.goalRemaining).toBe(15 * 60)
    })

    it('clamps goalRemaining to 0 once the goal is met', () => {
      const serviceReports = reports(2026, 4, [{ hours: 30, minutes: 0 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports,
        goalHours: 25,
      })

      expect(period.goalRemaining).toBe(0)
    })

    it('returns full goal when no reports exist for the period', () => {
      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports: {},
        goalHours: 50,
      })

      expect(period.goalRemaining).toBe(50 * 60)
    })

    it('treats a missing goalHours as zero — goalRemaining is zero', () => {
      const serviceReports = reports(2026, 4, [{ hours: 5, minutes: 0 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports,
      })

      expect(period.goalRemaining).toBe(0)
    })
  })

  describe('rolloverFromPrior', () => {
    it('surfaces the prior month fractional minutes when querying the current month', () => {
      const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 24 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 3,
        serviceReports,
        referenceDate: moment('2026-04-15'),
        hasAnnualGoal: true,
      })

      expect(period.rolloverFromPrior).toEqual({
        sourceYear: 2026,
        sourceMonth: 2,
        minutes: 24,
      })
    })

    it('returns null when prior month has no fractional minutes', () => {
      const serviceReports = reports(2026, 2, [{ hours: 2, minutes: 0 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 3,
        serviceReports,
        referenceDate: moment('2026-04-15'),
        hasAnnualGoal: true,
      })

      expect(period.rolloverFromPrior).toBeNull()
    })

    it('returns null when querying a non-current month (rollover only flows into the current month)', () => {
      const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 24 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 5,
        serviceReports,
        referenceDate: moment('2026-04-15'),
        hasAnnualGoal: true,
      })

      expect(period.rolloverFromPrior).toBeNull()
    })

    it('skips a prior service-year boundary for annual-goal publishers (Aug→Sep)', () => {
      const serviceReports = reports(2026, 7, [{ hours: 1, minutes: 24 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 8,
        serviceReports,
        referenceDate: moment('2026-09-05'),
        hasAnnualGoal: true,
      })

      expect(period.rolloverFromPrior).toBeNull()
    })

    it('still crosses the SY boundary for non-annual-goal publishers', () => {
      const serviceReports = reports(2026, 7, [{ hours: 1, minutes: 24 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 8,
        serviceReports,
        referenceDate: moment('2026-09-05'),
        hasAnnualGoal: false,
      })

      expect(period.rolloverFromPrior).toEqual({
        sourceYear: 2026,
        sourceMonth: 7,
        minutes: 24,
      })
    })

    it('respects the lastRolloverYearMonth marker', () => {
      const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 24 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 3,
        serviceReports,
        referenceDate: moment('2026-04-15'),
        hasAnnualGoal: true,
        lastRolloverYearMonth: '2026-04',
      })

      expect(period.rolloverFromPrior).toBeNull()
    })

    it('uses any day-of-month within referenceDate as the rollover anchor (custom rollover-day)', () => {
      // Anchor on the 28th instead of the 15th — a deliberately late
      // mid-month date that some users prefer as their "review month" cutoff.
      const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 30 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 3,
        serviceReports,
        referenceDate: moment('2026-04-28'),
        hasAnnualGoal: true,
      })

      expect(period.rolloverFromPrior).toEqual({
        sourceYear: 2026,
        sourceMonth: 2,
        minutes: 30,
      })
    })

    it('treats the first day of the month as a valid rollover anchor', () => {
      // Edge: anchoring on day 1 still counts the prior month's fractional
      // hours — the period boundary is the calendar month, not "day N".
      const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 30 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 3,
        serviceReports,
        referenceDate: moment('2026-04-01'),
        hasAnnualGoal: true,
      })

      expect(period.rolloverFromPrior).toEqual({
        sourceYear: 2026,
        sourceMonth: 2,
        minutes: 30,
      })
    })

    it('returns null when no referenceDate is supplied (rollover requires an anchor)', () => {
      const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 24 }])

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 3,
        serviceReports,
      })

      expect(period.rolloverFromPrior).toBeNull()
    })
  })

  describe('timezone-anchored dates', () => {
    it('reads noon-UTC anchored dates regardless of stored hour offset (May 1 noon UTC counts in May)', () => {
      const serviceReports: ServiceReportsByYears = {
        2026: {
          4: [
            {
              id: 'tz-anchored',
              hours: 2,
              minutes: 30,
              date: new Date(Date.UTC(2026, 4, 1, 12, 0, 0)),
            },
          ],
        },
      }

      const period = ServiceReportPeriod.forMonth({
        year: 2026,
        month: 4,
        serviceReports,
      })

      expect(period.adjustedMinutes.value).toBe(2 * 60 + 30)
      expect(period.adjustedMinutes.standard).toBe(2 * 60 + 30)
    })

    it('a JST-authored May 1 report is counted in May totals after the device switches to PST', () => {
      const originalTZ = process.env.TZ
      try {
        process.env.TZ = 'Asia/Tokyo'
        const dateAuthoredInJST = moment('2026-05-01').toDate()
        const normalized = new Date(
          Date.UTC(
            moment(dateAuthoredInJST).year(),
            moment(dateAuthoredInJST).month(),
            moment(dateAuthoredInJST).date(),
            12,
            0,
            0,
            0
          )
        )
        const serviceReports: ServiceReportsByYears = {
          2026: {
            4: [
              {
                id: 'jst-report',
                hours: 2,
                minutes: 30,
                date: normalized,
              },
            ],
          },
        }

        process.env.TZ = 'America/Los_Angeles'
        const period = ServiceReportPeriod.forMonth({
          year: 2026,
          month: 4,
          serviceReports,
        })

        expect(period.adjustedMinutes.value).toBe(2 * 60 + 30)
      } finally {
        if (originalTZ === undefined) delete process.env.TZ
        else process.env.TZ = originalTZ
      }
    })
  })
})
