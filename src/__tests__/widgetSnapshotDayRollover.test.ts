import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-location', () => ({}))
vi.mock('@/lib/errorTracking', () => ({ errorTracking: {} }))
vi.mock('@/lib/links', () => ({ openURL: vi.fn() }))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ timeDisplayFormat: 'decimal' }),
}))
vi.mock('expo-image-manipulator', () => ({}))
vi.mock('@/stores/profile', () => ({ useProfile: {} }))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({ useBuddies: {} }))

import moment from 'moment'
import {
  buildWidgetSnapshot,
  type BuildSnapshotArgs,
} from '@/app/widgets/snapshot'
import { buildReport } from '@/app/widgets/buildReport'
import { buildCalendar } from '@/app/widgets/buildCalendar'
import type { PublisherHours } from '@/types/publisher'

const publisherHours: PublisherHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 50,
  specialPioneer: 100,
  custom: 50,
}

const args = (overrides: Partial<BuildSnapshotArgs> = {}): BuildSnapshotArgs =>
  ({
    serviceReports: {
      2026: {
        9: [
          {
            id: 'oct-31',
            date: new Date(2026, 9, 31, 12),
            hours: 2,
            minutes: 0,
          },
        ],
      },
    },
    publisher: 'regularAuxiliary',
    nextMonthPublisher: 'publisher',
    logsHours: true,
    publisherHours,
    monthlyGoalOverrides: {},
    overrideCreditLimit: false,
    customCreditLimitHours: 55,
    timeDisplayFormat: 'decimal',
    dayPlans: [{ id: 'nov-3', date: new Date(2026, 10, 3, 12), minutes: 90 }],
    recurringPlans: [],
    contacts: [],
    conversations: [],
    defaultNavigationMapProvider: 'apple',
    defaultPhoneRegionCode: 'US',
    stalenessBreakpoints: { weekDays: 7, monthDays: 30 },
    widgetContactSort: 'longestContacted',
    widgetContactAction: 'none',
    widgetAppointmentWindow: '7days',
    startOfWeek: 0,
    buddyMarkers: {},
    locale: 'en-us',
    nativeLocale: { rtl: false, numberLocale: 'en-us' },
    accentColor: null,
    pet: null,
    ...overrides,
  }) as BuildSnapshotArgs

describe('widget snapshot day rollover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 31, 18))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('records the local day it was built for', () => {
    const snapshot = buildWidgetSnapshot(args())

    expect(snapshot.builtOn).toBe('2026-10-31')
    expect(snapshot.report.publisherState).toBe('reportedToday')
    expect(snapshot.calendar.month).toBe(9)
  })

  it("builds next month's report and calendar as of its first day", () => {
    const { nextMonth } = buildWidgetSnapshot(args())

    expect(nextMonth.builtOn).toBe('2026-11-01')
    // Next month's role, from Role History.
    expect(nextMonth.report.mode).toBe('checkbox')
    expect(nextMonth.report.publisherState).toBe('unreported')
    expect(nextMonth.report.monthMinutes).toBe(0)
    expect(nextMonth.calendar).toMatchObject({ month: 10, year: 2026 })
    const today = nextMonth.calendar.days.filter((d) => d.isToday)
    expect(today.map((d) => d.date)).toEqual(['2026-11-01'])
    expect(nextMonth.calendar.currentWeekStart).toBe(0)
    expect(
      nextMonth.calendar.days.find((d) => d.date === '2026-11-03')
    ).toMatchObject({ hasPlan: true, isPast: false })
  })

  it('uses the next month goal for that month', () => {
    const { report, nextMonth } = buildWidgetSnapshot(
      args({ nextMonthPublisher: 'regularPioneer' })
    )

    expect(report.goalHours).toBe(30)
    expect(nextMonth.report.goalHours).toBe(50)
    // 50 hours over the 30 days left from Nov 1, 00:00.
    expect(nextMonth.report.hoursPerDayNeeded).toBe(1.7)
  })
})

describe('builders as of a given day', () => {
  const reportArgs = () => {
    const { nextMonthPublisher: _next, ...rest } = args({
      publisher: 'regularPioneer',
    })
    return rest
  }

  it('counts the days left from `now`', () => {
    // 2 of 50 hours logged; 48 left over the 11 whole days to Nov 1.
    const report = buildReport(reportArgs(), moment(new Date(2026, 9, 20, 12)))

    expect(report.hoursPerDayNeeded).toBe(4.4)
  })

  it("is reported only on the day it's built for", () => {
    const onTheDay = buildReport(reportArgs(), moment(new Date(2026, 9, 31, 9)))
    const nextMonth = buildReport(reportArgs(), moment(new Date(2026, 10, 1)))

    expect(onTheDay.publisherState).toBe('reportedToday')
    expect(nextMonth.publisherState).toBe('unreported')
  })

  it("builds the calendar of `now`'s month", () => {
    const calendar = buildCalendar(
      args({ publisher: 'regularPioneer' }),
      moment(new Date(2026, 10, 12))
    )

    expect(calendar).toMatchObject({ month: 10, currentWeekStart: 7 })
    expect(calendar.days.find((d) => d.isToday)?.date).toBe('2026-11-12')
  })
})
