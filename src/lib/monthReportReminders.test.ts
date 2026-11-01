import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [],
}))
vi.mock('@/lib/minutes', () => ({
  formatMinutes: (minutes: number) => ({ formatted: `${minutes}m` }),
}))

import {
  DEFAULT_MONTH_REPORT_REMINDER_TIME,
  monthReportDue,
  monthReportSources,
  nextMonthReportReminder,
  type MonthReportSources,
} from '@/lib/monthReportReminders'
import { buildReminderSchedule } from '@/lib/reminderSchedule'
import { reminderContent } from '@/lib/reminderContent'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'

const entry = (
  year: number,
  month: number,
  overrides: Partial<TimeEntry> = {}
): TimeEntry => ({
  id: `${year}-${month}-${overrides.minutes ?? 60}`,
  hours: 1,
  minutes: 0,
  date: new Date(year, month, 10, 12),
  ...overrides,
})

const reports = (...entries: TimeEntry[]): TimeEntriesByYear => {
  const byYear: TimeEntriesByYear = {}
  for (const e of entries) {
    const year = e.date.getFullYear()
    const month = e.date.getMonth()
    byYear[year] ??= {}
    byYear[year][month] = [...(byYear[year][month] ?? []), e]
  }
  return byYear
}

const sources = (
  overrides: Partial<MonthReportSources> = {}
): MonthReportSources => ({
  serviceReports: reports(entry(2026, 9)),
  submittedReportMonths: [],
  remindAt: DEFAULT_MONTH_REPORT_REMINDER_TIME,
  ...overrides,
})

const OCT_19 = new Date(2026, 9, 19, 15).getTime()

describe('nextMonthReportReminder', () => {
  it('reminds at 9 AM on the 1st about the month that just ended', () => {
    expect(nextMonthReportReminder(sources(), OCT_19)).toEqual({
      date: new Date(2026, 10, 1, 9),
      month: '2026-10',
    })
  })

  it("still reminds on the 1st before the reminder's time", () => {
    const sept = sources({ serviceReports: reports(entry(2026, 8)) })
    expect(
      nextMonthReportReminder(sept, new Date(2026, 9, 1, 8, 59).getTime())
    ).toEqual({ date: new Date(2026, 9, 1, 9), month: '2026-09' })

    expect(
      nextMonthReportReminder(sept, new Date(2026, 9, 1, 9).getTime())
    ).toBeNull()
  })

  it('uses the chosen time and rolls over the year', () => {
    expect(
      nextMonthReportReminder(
        sources({
          serviceReports: reports(entry(2026, 11)),
          remindAt: 7 * 60 + 30,
        }),
        new Date(2026, 11, 31, 22).getTime()
      )
    ).toEqual({ date: new Date(2027, 0, 1, 7, 30), month: '2026-12' })
  })

  it('skips a month with nothing logged', () => {
    expect(
      nextMonthReportReminder(sources({ serviceReports: {} }), OCT_19)
    ).toBeNull()

    expect(
      nextMonthReportReminder(
        sources({
          serviceReports: reports(entry(2026, 9, { rollover: true })),
        }),
        OCT_19
      )
    ).toBeNull()
  })

  it('counts a month logged with no hours, like a Publisher who shared', () => {
    expect(
      nextMonthReportReminder(
        sources({
          serviceReports: reports(entry(2026, 9, { hours: 0, minutes: 0 })),
        }),
        OCT_19
      )
    ).not.toBeNull()
  })

  it('skips a month already submitted', () => {
    expect(
      nextMonthReportReminder(
        sources({ submittedReportMonths: ['2026-10'] }),
        OCT_19
      )
    ).toBeNull()
  })
})

describe('monthReportDue', () => {
  it('rejects a malformed month', () => {
    expect(monthReportDue('2026-1', sources())).toBe(false)
    expect(monthReportDue('2026-10', sources())).toBe(true)
  })
})

describe('monthReportSources', () => {
  const prefs = {
    monthReportReminders: true,
    monthReportReminderTime: 8 * 60,
    submittedReportMonths: ['2026-09'],
  }

  it('is off by default', () => {
    expect(
      monthReportSources(
        { serviceReports: {} },
        { ...prefs, monthReportReminders: false }
      )
    ).toBeUndefined()
  })

  it('falls back to 9 AM for a time out of range', () => {
    expect(
      monthReportSources(
        { serviceReports: {} },
        { ...prefs, monthReportReminderTime: 24 * 60 }
      )?.remindAt
    ).toBe(DEFAULT_MONTH_REPORT_REMINDER_TIME)
    expect(monthReportSources({ serviceReports: {} }, prefs)?.remindAt).toBe(
      8 * 60
    )
  })
})

describe('report reminder schedule', () => {
  const base = {
    contacts: [],
    visits: [],
    plans: [],
    visitOffset: { amount: 0, unit: 'minutes' as const },
    planOffset: { amount: 0, unit: 'minutes' as const },
    now: OCT_19,
  }

  it('schedules one reminder that opens the month', () => {
    const schedule = buildReminderSchedule({
      ...base,
      monthReport: sources(),
    })
    expect(schedule).toEqual([
      {
        id: 'witness-work-monthReport-2026-10',
        date: new Date(2026, 10, 1, 9),
        kind: 'monthReport',
        targetId: '2026-10',
        anchor: new Date(2026, 10, 1, 9),
      },
    ])
    const content = reminderContent(schedule[0], {
      dataProtectionMode: false,
      timeDisplayFormat: 'short',
    })
    expect(content.data).toEqual({
      reminder: { kind: 'monthReport', id: '2026-10' },
    })
    expect(content.title).toContain('October')
  })

  it('has none while off', () => {
    expect(buildReminderSchedule(base)).toEqual([])
  })
})
