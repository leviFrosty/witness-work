import { describe, expect, it } from 'vitest'

import {
  dueReportMonth,
  shouldShowPreviousReportReminder,
} from '@/features/service-reports/lib/previousReportReminder'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'

const now = new Date('2026-07-09T12:00:00.000Z')

describe('shouldShowPreviousReportReminder', () => {
  it('hides the previous report on a fresh install with no backfilled data', () => {
    expect(
      shouldShowPreviousReportReminder({
        installedOn: new Date('2026-07-09T10:00:00.000Z'),
        now,
        previousMonthHasEntries: false,
        submittedReportMonths: [],
      })
    ).toBe(false)
  })

  it('shows the previous report for an existing User', () => {
    expect(
      shouldShowPreviousReportReminder({
        installedOn: new Date('2026-06-15T12:00:00.000Z'),
        now,
        previousMonthHasEntries: false,
        submittedReportMonths: [],
      })
    ).toBe(true)
  })

  it('shows a backfilled previous report even on a fresh install', () => {
    expect(
      shouldShowPreviousReportReminder({
        installedOn: new Date('2026-07-09T10:00:00.000Z'),
        now,
        previousMonthHasEntries: true,
        submittedReportMonths: [],
      })
    ).toBe(true)
  })

  it('stays hidden once the previous report was submitted', () => {
    expect(
      shouldShowPreviousReportReminder({
        installedOn: new Date('2025-01-01T00:00:00.000Z'),
        now,
        previousMonthHasEntries: true,
        submittedReportMonths: ['2026-06'],
      })
    ).toBe(false)
  })
})

describe('dueReportMonth', () => {
  const entry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
    id: 'entry',
    date: new Date('2026-06-12T12:00:00.000Z'),
    hours: 2,
    minutes: 0,
    ...overrides,
  })

  const june = (...entries: TimeEntry[]): TimeEntriesByYear => ({
    2026: { 5: entries },
  })
  const freshInstall = new Date('2026-07-09T10:00:00.000Z')

  it("is last month while last month's report is unsent", () => {
    expect(
      dueReportMonth({
        installedOn: freshInstall,
        now,
        serviceReports: june(entry()),
        submittedReportMonths: [],
      })
    ).toEqual({ month: 5, year: 2026, isPreviousMonth: true })
  })

  it("counts a Kingdom Publisher's shared checkbox for last month", () => {
    expect(
      dueReportMonth({
        installedOn: freshInstall,
        now,
        serviceReports: june(entry({ hours: 0, minutes: 0 })),
        submittedReportMonths: [],
      }).isPreviousMonth
    ).toBe(true)
  })

  it('is this month once last month was submitted', () => {
    expect(
      dueReportMonth({
        installedOn: new Date('2025-01-01T00:00:00.000Z'),
        now,
        serviceReports: june(entry()),
        submittedReportMonths: ['2026-06'],
      })
    ).toEqual({ month: 6, year: 2026, isPreviousMonth: false })
  })

  it('is this month on a fresh install whose last month only holds a rollover', () => {
    expect(
      dueReportMonth({
        installedOn: freshInstall,
        now,
        serviceReports: june(entry({ rollover: true })),
        submittedReportMonths: [],
      }).isPreviousMonth
    ).toBe(false)
  })

  it('is December of last year in January', () => {
    expect(
      dueReportMonth({
        installedOn: new Date('2025-01-01T00:00:00.000Z'),
        now: new Date('2027-01-03T12:00:00.000Z'),
        serviceReports: {},
        submittedReportMonths: [],
      })
    ).toEqual({ month: 11, year: 2026, isPreviousMonth: true })
  })
})
