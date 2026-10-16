import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => ({}) },
}))

import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import {
  buildMonthReportData,
  type MonthReportInputs,
} from '@/features/service-reports/lib/monthReportData'
import type { TimeEntry } from '@/types/timeEntry'

const entry = (id: string, hours: number, categoryId?: string): TimeEntry => ({
  id,
  date: new Date(2026, 7, 10, 12),
  hours,
  minutes: 0,
  ...(categoryId ? { categoryId, credit: true } : {}),
})

const build = (
  entries: TimeEntry[],
  overrides: Partial<MonthReportInputs> = {}
) =>
  buildMonthReportData({
    month: 7,
    year: 2026,
    publisher: 'regularPioneer',
    entryMode: 'hours',
    serviceReports: { 2026: { 7: entries } },
    categories: [
      { id: 'bethel', name: 'Bethel', isCredit: true },
      { id: LDC_BUILTIN_CATEGORY_ID, name: 'LDC', isCredit: true },
    ] as MonthReportInputs['categories'],
    contacts: [],
    conversations: [],
    overrideCreditLimit: false,
    customCreditLimitHours: 55,
    reportCommentOverrides: {},
    ...overrides,
  })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 5, 12))
})
afterEach(() => vi.useRealTimers())

describe('month report text', () => {
  it('writes each credit line as one sentence', () => {
    const data = build([
      entry('a', 30),
      entry('b', 4, LDC_BUILTIN_CATEGORY_ID),
      entry('c', 6, 'bethel'),
    ])
    expect(data.defaultNotes.split('\n')).toEqual([
      'Credit breakdown',
      'LDC: 4h',
      'Bethel: 6h',
      'Credit shown on report: 10h',
    ])
  })

  it('names the credit left over the cap', () => {
    const data = build([entry('a', 30), entry('b', 40, 'bethel')])
    expect(data.defaultNotes).toContain('Credit shown on report: 25h')
    expect(data.defaultNotes).toContain('Not applied: 15h over credit cap')
  })

  it('shares the report as label lines', () => {
    const data = build([entry('a', 30), entry('b', 1, 'bethel')])
    expect(data.reportAsString()).toBe(
      [
        'Service Report - Aug 2026',
        '',
        '---',
        '',
        'Hours: 30',
        'Credit: 1',
        'Studies: 0',
        'Notes:',
        '',
        'Credit breakdown',
        'Bethel: 1h',
        'Credit shown on report: 1h',
      ].join('\n')
    )
  })

  it('answers Yes or No for a checkbox publisher, with no notes', () => {
    const shared = build([entry('a', 1)], {
      publisher: 'publisher',
      entryMode: 'checkbox',
    })
    expect(shared.reportAsString()).toBe(
      [
        'Service Report - Aug 2026',
        '',
        '---',
        '',
        'Hours: Yes',
        'Credit: 0',
        'Studies: 0',
        'Notes:',
        '',
      ].join('\n')
    )
    const none = build([], { publisher: 'publisher', entryMode: 'checkbox' })
    expect(none.reportAsString()).toContain('Hours: No')
  })
})
