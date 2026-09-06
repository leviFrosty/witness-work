import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import useMonthReportData, {
  type MonthReportData,
} from '@/features/service-reports/hooks/useMonthReportData'
import { buildHourglassLink } from '@/features/service-reports/lib/submitLinks'
import type { TimeEntry } from '@/types/timeEntry'
import type { Publisher } from '@/types/publisher'

const fixture = vi.hoisted(() => ({
  entries: [] as TimeEntry[],
  role: 'regularPioneer' as Publisher,
  reportCommentOverrides: {} as Record<string, string>,
}))

vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({
    role: fixture.role,
    publisherHours: { regularPioneer: 50, publisher: 0 },
    userSpecifiedHasAnnualGoal: 'default',
    milestoneOverrides: null,
    overrideCreditLimit: false,
    customCreditLimitHours: 55,
    reportCommentOverrides: fixture.reportCommentOverrides,
  }),
}))
vi.mock('@/stores/serviceReport', () => ({
  default: () => ({ serviceReports: { 2026: { 7: fixture.entries } } }),
}))
vi.mock('@/stores/categories', () => ({
  default: () => ({
    categories: [{ id: 'bethel', name: 'Bethel', isCredit: true }],
  }),
}))
vi.mock('@/stores/conversationStore', () => ({
  default: () => ({ conversations: [] }),
}))
vi.mock('@/stores/contactsStore', () => ({
  default: () => ({ contacts: [] }),
}))
vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  return { default: new I18n({ en }, { locale: 'en' }) }
})

const checkReport = (check: (data: MonthReportData) => void) => {
  function Probe() {
    check(useMonthReportData(7, 2026))
    return null
  }
  renderToStaticMarkup(createElement(Probe))
}

const entry = (hours: number, credit = false): TimeEntry => ({
  id: credit ? 'credit' : 'preaching',
  date: new Date(2026, 7, 10, 12),
  hours,
  minutes: 0,
  ...(credit ? { categoryId: 'bethel', credit: true } : {}),
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 5, 12))
  fixture.entries = []
  fixture.role = 'regularPioneer'
  fixture.reportCommentOverrides = {}
})
afterEach(() => vi.useRealTimers())

describe('Hourglass report data', () => {
  it.each([
    { preaching: 30, credit: 10, applied: 10 },
    { preaching: 1, credit: 1, applied: 1 },
    { preaching: 30, credit: 40, applied: 25 },
    { preaching: 60, credit: 10, applied: 0 },
    { preaching: 0, credit: 10, applied: 10 },
    { preaching: 1, credit: 0, applied: 0 },
  ])(
    'exports $preaching preaching hours separately from $credit credit hours',
    ({ preaching, credit, applied }) => {
      fixture.entries = [entry(preaching), entry(credit, true)]
      checkReport((data) => {
        expect(data.hours).toBe(preaching)
        expect(data.credit).toBe(applied)
        const url = new URL(
          buildHourglassLink({
            month: 8,
            year: 2026,
            ...data.hourglassReport,
          })
        )
        expect(url.searchParams.get('minutes')).toBe(String(preaching * 60))
        if (credit > 0) {
          expect(url.searchParams.get('remarks')).toContain(
            `Bethel: ${credit}h`
          )
          expect(url.searchParams.get('remarks')).toContain(
            `Credit shown on report: ${applied}h`
          )
        }
      })
    }
  )

  it('preserves preaching minutes without rounding them to whole hours', () => {
    fixture.entries = [{ ...entry(1), minutes: 30 }, entry(1, true)]
    checkReport((data) => expect(data.hourglassReport.minutes).toBe(90))
  })

  it.each([false, true])(
    'preserves the checkbox participation indicator: %s',
    (shared) => {
      fixture.role = 'publisher'
      fixture.entries = shared ? [entry(0)] : []
      checkReport((data) =>
        expect(data.hourglassReport.minutes).toBe(shared ? 1 : 0)
      )
    }
  )

  it('keeps credit overage in the Hourglass remarks', () => {
    fixture.entries = [entry(30), entry(40, true)]
    checkReport((data) => {
      expect(data.hourglassReport.remarks).toBe(data.defaultNotes)
      expect(data.hourglassReport.remarks).toContain(
        'Credit shown on report: 25h'
      )
      expect(data.hourglassReport.remarks).toContain('Not applied: 15h')
    })
  })

  it.each(['User comment & details', ''])(
    'respects a saved report comment override: %j',
    (comment) => {
      fixture.entries = [entry(30), entry(10, true)]
      fixture.reportCommentOverrides = { '2026-08': comment }
      checkReport((data) => {
        const url = new URL(
          buildHourglassLink({ month: 8, year: 2026, ...data.hourglassReport })
        )
        expect(url.searchParams.get('minutes')).toBe('1800')
        expect(url.searchParams.get('remarks')).toBe(comment || null)
      })
    }
  )
})
