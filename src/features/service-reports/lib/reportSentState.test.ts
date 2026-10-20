import { describe, expect, it, vi } from 'vitest'
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { date?: string }) =>
      options?.date ? `${key}:${options.date}` : key,
  },
}))
import {
  reportSentLabel,
  reportSentState,
} from '@/features/service-reports/lib/reportSentState'

const oct3 = new Date(2026, 9, 3, 9).getTime()

describe('reportSentState', () => {
  it('is not sent when the month is not marked', () => {
    const state = reportSentState(
      { submittedReportMonths: ['2026-08'], preferenceUpdatedAt: {} },
      '2026-09'
    )
    expect(state).toEqual({ sent: false })
    expect(reportSentLabel(state)).toBeNull()
  })

  it("dates the label from the month's stamp", () => {
    const state = reportSentState(
      {
        submittedReportMonths: ['2026-09'],
        preferenceUpdatedAt: { 'submittedReportMonths:2026-09': oct3 },
      },
      '2026-09'
    )
    expect(state).toEqual({ sent: true, sentAt: oct3 })
    expect(reportSentLabel(state)).toBe('reportSentOn:Oct 3')
  })

  it('says just Sent without a stamp for the month', () => {
    const state = reportSentState(
      {
        submittedReportMonths: ['2026-09'],
        preferenceUpdatedAt: { submittedReportMonths: oct3 },
      },
      '2026-09'
    )
    expect(state).toEqual({ sent: true, sentAt: null })
    expect(reportSentLabel(state)).toBe('reportSent')
  })

  it('ignores a stamp from before the month began', () => {
    const state = reportSentState(
      {
        submittedReportMonths: ['2026-10'],
        preferenceUpdatedAt: { 'submittedReportMonths:2026-10': oct3 - 1e10 },
      },
      '2026-10'
    )
    expect(state).toEqual({ sent: true, sentAt: null })
  })
})
