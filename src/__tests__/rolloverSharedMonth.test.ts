import moment from 'moment'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  return { default: new I18n({ en }, { locale: 'en' }) }
})
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ timeDisplayFormat: 'decimal' }),
}))

import { buildReport, type BuildReportArgs } from '@/app/widgets/buildReport'
import { buildRolloverEntries } from '@/features/service-reports/lib/rollover'
import { buildMonthReportData } from '@/features/service-reports/lib/monthReportData'
import { buildServiceHistoryRows } from '@/features/service-reports/lib/serviceHistoryRows'
import { buildMonthCalendarMarkedDates } from '@/features/service-reports/lib/monthCalendarMarkedDates'
import {
  consecutiveDaysStreak,
  daysLogged,
  flattenDailyMinutes,
  totalMinutes,
} from '@/features/profile/lib/profileStats'
import { getLoggedDayKeys, isCountableEntry } from '@/lib/serviceReport'
import type { Publisher, PublisherHours } from '@/types/publisher'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'

const FEB = 1
const MAR = 2

const ministry = (
  month: number,
  day: number,
  hours: number,
  minutes = 0
): TimeEntry => ({
  id: `ministry-${month}-${day}`,
  date: new Date(2026, month, day, 12),
  hours,
  minutes,
})

/** The real pair Time Rollover writes: −30m on Feb 28, +30m on Mar 1. */
const febToMarRollover = buildRolloverEntries({
  pending: [{ sourceYear: 2026, sourceMonth: FEB, minutes: 30 }],
  today: moment({ year: 2026, month: MAR, day: 1, hour: 12 }),
  serviceReports: {},
})
const [febRolloverSource, marRolloverDestination] = febToMarRollover

/** February has real ministry; March so far holds only the rolled-over 30m. */
const rolloverOnlyMarch = (...extraMarch: TimeEntry[]): TimeEntriesByYear => ({
  2026: {
    [FEB]: [ministry(FEB, 10, 10, 30), febRolloverSource],
    [MAR]: [marRolloverDestination, ...extraMarch],
  },
})

const publisherHours: PublisherHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 50,
  specialPioneer: 100,
  custom: 50,
}

const reportFor = (
  serviceReports: TimeEntriesByYear,
  month: number,
  publisher: Publisher,
  entryMode: 'checkbox' | 'hours'
) =>
  buildMonthReportData({
    month,
    year: 2026,
    publisher,
    entryMode,
    serviceReports,
    categories: [],
    contacts: [],
    conversations: [],
    overrideCreditLimit: false,
    customCreditLimitHours: 55,
    reportCommentOverrides: {},
  })

const widgetFor = (
  serviceReports: TimeEntriesByYear,
  publisher: Publisher = 'publisher'
) => {
  const args: BuildReportArgs = {
    serviceReports,
    publisher,
    publisherHours,
    monthlyGoalOverrides: {},
    overrideCreditLimit: false,
    customCreditLimitHours: 55,
    timeDisplayFormat: 'decimal',
    dayPlans: [],
    recurringPlans: [],
    conversations: [],
  }
  return buildReport(args)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, MAR, 1, 15))
})
afterEach(() => vi.useRealTimers())

describe('isCountableEntry', () => {
  it.each([
    ['ministry time', ministry(MAR, 3, 1, 30), true],
    ['the 0h checkbox marker', ministry(MAR, 3, 0), true],
    ['credit time', { ...ministry(MAR, 3, 2), credit: true }, true],
    ['a rollover destination', marRolloverDestination, false],
    ['a rollover source', febRolloverSource, false],
    ['a negative entry', ministry(MAR, 3, 0, -15), false],
  ])('%s → %s', (_, entry, countable) => {
    expect(isCountableEntry(entry)).toBe(countable)
  })
})

describe('a month holding only Time Rollover entries', () => {
  it('is reported as not shared, while its hours still count', () => {
    const report = reportFor(rolloverOnlyMarch(), MAR, 'publisher', 'checkbox')

    expect(report.sharedInMinistry).toBe(false)
    expect(report.hourglassReport.minutes).toBe(0)
    expect(report.reportAsString()).toContain('Hours: No')

    const hours = reportFor(rolloverOnlyMarch(), MAR, 'regularPioneer', 'hours')
    expect(hours.sharedInMinistry).toBe(false)
    expect(hours.hourglassReport.minutes).toBe(30)
  })

  it('is not shared when both halves of two rollovers cancel out', () => {
    // March's 30m rolled on into April: +30m on Mar 1 and −30m on Mar 31.
    const [marRolloverSource] = buildRolloverEntries({
      pending: [{ sourceYear: 2026, sourceMonth: MAR, minutes: 30 }],
      today: moment({ year: 2026, month: MAR + 1, day: 1, hour: 12 }),
      serviceReports: rolloverOnlyMarch(),
    })

    const report = reportFor(
      rolloverOnlyMarch(marRolloverSource),
      MAR,
      'publisher',
      'checkbox'
    )

    expect(report.sharedInMinistry).toBe(false)
  })

  it('still counts as shared once the User logs real ministry', () => {
    const checkbox = ministry(MAR, 1, 0)
    const report = reportFor(
      rolloverOnlyMarch(checkbox),
      MAR,
      'publisher',
      'checkbox'
    )

    expect(report.sharedInMinistry).toBe(true)
    expect(report.hourglassReport.minutes).toBe(1)
  })

  it('leaves the source month shared and floored to whole hours', () => {
    const report = reportFor(
      rolloverOnlyMarch(),
      FEB,
      'regularPioneer',
      'hours'
    )

    expect(report.sharedInMinistry).toBe(true)
    expect(report.hourglassReport.minutes).toBe(10 * 60)
  })

  it('leaves the widget Reporting State unreported', () => {
    const widget = widgetFor(rolloverOnlyMarch())

    expect(widget.hasReportedThisMonth).toBe(false)
    expect(widget.publisherState).toBe('unreported')
    expect(widget.monthMinutes).toBe(30)
  })

  it('moves the widget to reportedToday when the User shares', () => {
    const widget = widgetFor(rolloverOnlyMarch(ministry(MAR, 1, 0)))

    expect(widget.hasReportedThisMonth).toBe(true)
    expect(widget.publisherState).toBe('reportedToday')
  })

  it('does not count the rollover entry as reported today', () => {
    // Ministry logged ahead for Mar 3; the only entry dated today is the
    // rolled-over 30m.
    const widget = widgetFor(rolloverOnlyMarch(ministry(MAR, 3, 1)))

    expect(widget.publisherState).toBe('reportedThisMonth')
  })
})

describe('Service History rows', () => {
  const rows = (serviceReports: TimeEntriesByYear) =>
    buildServiceHistoryRows({
      serviceYear: 2025,
      role: 'publisher',
      roleHistory: null,
      monthlyGoalOverrides: {},
      serviceReports,
      now: new Date(2026, MAR + 1, 15),
    })
  const rowFor = (serviceReports: TimeEntriesByYear, month: number) =>
    rows(serviceReports).find(
      (row) => row.target.year === 2026 && row.target.month === month
    )

  it('leaves a rollover-only month open to fill in', () => {
    expect(rowFor(rolloverOnlyMarch(), MAR)?.loggedMinutes).toBeNull()
  })

  it('keeps rolled-over minutes in a shared month’s logged time', () => {
    expect(rowFor(rolloverOnlyMarch(), FEB)?.loggedMinutes).toBe(10 * 60)
    expect(
      rowFor(rolloverOnlyMarch(ministry(MAR, 3, 2)), MAR)?.loggedMinutes
    ).toBe(2 * 60 + 30)
  })
})

describe('days with only a Time Rollover entry', () => {
  it('have no logged time for the Projected Total to replace a Plan with', () => {
    const march = rolloverOnlyMarch()[2026][MAR]
    expect(getLoggedDayKeys(march).has('2026-03-01')).toBe(false)
    expect(
      getLoggedDayKeys([...march, ministry(MAR, 1, 1)]).has('2026-03-01')
    ).toBe(true)
  })

  it('get no logged-time dot on the Schedule calendar', () => {
    const marked = buildMonthCalendarMarkedDates({
      month: MAR,
      year: 2026,
      monthsReports: rolloverOnlyMarch(ministry(MAR, 3, 1))[2026][MAR],
      dayPlans: [],
      recurringPlans: [],
      reportDotColor: '#123456',
    })

    expect(marked['2026-03-01']).toBeUndefined()
    expect(marked['2026-03-03']).toMatchObject({ marked: true })
  })

  it('neither add to nor break a Profile streak', () => {
    // 20m on Feb 28 floored by a −30m rollover the same day.
    const lastDayRollover = buildRolloverEntries({
      pending: [{ sourceYear: 2026, sourceMonth: FEB, minutes: 30 }],
      today: moment({ year: 2026, month: MAR, day: 1, hour: 12 }),
      serviceReports: {},
    })
    const daily = flattenDailyMinutes({
      2026: {
        [FEB]: [
          ministry(FEB, 27, 2, 10),
          ministry(FEB, 28, 0, 20),
          lastDayRollover[0],
        ],
        [MAR]: [lastDayRollover[1]],
      },
    })

    expect(daily.has('2026-03-01')).toBe(false)
    expect(daily.get('2026-02-28')).toBe(20)
    expect(consecutiveDaysStreak(daily)).toBe(2)
    expect(daysLogged(daily)).toBe(2)
    expect(totalMinutes(daily)).toBe(2 * 60 + 30)
  })
})
