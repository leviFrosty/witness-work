import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-location', () => ({}))
vi.mock('@/lib/errorTracking', () => ({ errorTracking: {} }))
vi.mock('@/lib/links', () => ({ openURL: vi.fn() }))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, o: Record<string, unknown> = {}) =>
      ({
        hoursShort: `${o.count}h`,
        minutesShort: `${o.count}m`,
        hoursAndMinutesShort: `${o.hours} ${o.minutes}`,
        hoursPerDayToGoalValue: `${o.value} per day to goal!`,
      })[key] ?? key,
  },
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

    expect(nextMonth.report.hoursPerDayNeeded).toBe(1.8)

    expect(nextMonth.report.hoursPerDayToGoalByDay['2026-11-01']).toBe(
      '1.8h per day to goal!'
    )
  })
})

describe('builders as of a given day', () => {
  const reportArgs = () => {
    const { nextMonthPublisher: _next, ...rest } = args({
      publisher: 'regularPioneer',
    })
    return rest
  }

  it('counts the days left as the Daily Pace card does', () => {
    const report = buildReport(reportArgs(), moment(new Date(2026, 9, 20, 12)))
    expect(report.hoursPerDayNeeded).toBe(4.4)

    const midnight = moment(new Date(2026, 9, 21))
    expect(buildReport(reportArgs(), midnight).hoursPerDayNeeded).toBe(4.8)

    for (const day of [30, 31]) {
      const at = moment(new Date(2026, 9, day))
      expect(buildReport(reportArgs(), at).hoursPerDayNeeded).toBe(48)
    }
  })

  it('writes the pace line for each day left, as the Daily Pace card does', () => {
    const { hoursPerDayToGoalByDay } = buildReport(
      reportArgs(),
      moment(new Date(2026, 9, 21, 12))
    )

    expect(Object.keys(hoursPerDayToGoalByDay)).toEqual(
      Array.from({ length: 11 }, (_, i) => `2026-10-${21 + i}`)
    )

    expect(hoursPerDayToGoalByDay['2026-10-21']).toBe('4.8h per day to goal!')

    expect(hoursPerDayToGoalByDay['2026-10-30']).toBe('48h per day to goal!')

    expect(hoursPerDayToGoalByDay['2026-10-31']).toBe('48h per day to goal!')
  })

  it('formats the pace line in hours and minutes when set to', () => {
    const { hoursPerDayToGoalByDay } = buildReport(
      { ...reportArgs(), timeDisplayFormat: 'short' },
      moment(new Date(2026, 9, 21, 12))
    )

    expect(hoursPerDayToGoalByDay['2026-10-21']).toBe('4h 48m per day to goal!')

    expect(hoursPerDayToGoalByDay['2026-10-22']).toBe('5h 20m per day to goal!')
  })

  it('writes no pace line without a goal to reach', () => {
    const met = buildReport(
      {
        ...reportArgs(),
        serviceReports: {
          2026: {
            9: [
              {
                id: 'done',
                date: new Date(2026, 9, 2, 12),
                hours: 50,
                minutes: 0,
              },
            ],
          },
        },
      },
      moment(new Date(2026, 9, 21, 12))
    )
    const noGoal = buildReport(
      { ...reportArgs(), publisher: 'publisher' },
      moment(new Date(2026, 9, 21, 12))
    )

    expect(met.hoursPerDayToGoalByDay).toEqual({})
    expect(noGoal.hoursPerDayToGoalByDay).toEqual({})
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
