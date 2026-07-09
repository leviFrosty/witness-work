import { describe, expect, it } from 'vitest'

import { shouldShowPreviousReportReminder } from '@/features/service-reports/lib/previousReportReminder'

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
