import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ timeZone: 'UTC' }],
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
import { buildCalendarDayModel } from '@/components/calendarDayModel'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  plannedMinutesThroughDayForMonth,
  RecurringPlanFrequencies,
  recurringPlansOverlapping,
  type RecurringPlan,
} from '@/lib/recurrence'
import type { DayPlan, TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'
import { buildScheduleDayIndex } from '@/features/plans/lib/scheduleDayIndex'
import { scheduleMonthModels } from '@/features/plans/lib/scheduleDayModels'

const stored = (year: number, month: number, day: number) =>
  normalizeDateForStorage(new Date(year, month, day, 12))

const entry = (
  day: number,
  hours: number,
  extra: Partial<TimeEntry> = {}
): TimeEntry =>
  ({
    id: `e-${day}`,
    hours,
    minutes: 0,
    date: stored(2026, 10, day),
    ...extra,
  }) as TimeEntry

const plan = (day: number, minutes: number, note?: string): DayPlan =>
  ({
    id: `p-${day}`,
    date: stored(2026, 10, day),
    minutes,
    note,
  }) as DayPlan

const weekly = (day: number, minutes: number): RecurringPlan => ({
  id: `r-${day}`,
  startDate: stored(2026, 10, day),
  minutes,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
})

const reportsFor = (entries: TimeEntry[]): TimeEntriesByYear => ({
  2026: { 10: entries },
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildCalendarDayModel', () => {
  it('works out a planned day the way the cell shows it', () => {
    const model = buildCalendarDayModel({
      dateString: '2026-11-09',
      reports: [entry(9, 2)],
      dayPlans: [plan(9, 60, 'Bring tracts')],
      recurringPlans: [weekly(2, 90)],
    })
    expect(model.planned).toBe(true)
    expect(model.recurringPlans).toHaveLength(1)
    expect(model.plannedMinutes).toBe(150)
    expect(model.loggedMinutes).toBe(120)
    expect(model.wentInService).toBe(true)
    expect(model.hasNote).toBe(true)
    expect(model.noteDot).toBe(true)
    expect(model.localDay).toEqual(new Date(2026, 10, 9))
  })

  it('marks a day without plans by its reports alone', () => {
    const model = buildCalendarDayModel({
      dateString: '2026-11-10',
      reports: [entry(10, 1, { note: 'Return visit' })],
      dayPlans: [],
      recurringPlans: [weekly(2, 90)],
    })
    expect(model.planned).toBe(false)
    expect(model.recurringPlans).toEqual([])
    expect(model.plannedMinutes).toBe(0)
    expect(model.noteDot).toBe(true)
  })
})

describe('scheduleMonthModels', () => {
  const dayPlans = [plan(9, 60)]
  const recurring = [weekly(2, 90)]

  it('builds every day of the month once and reuses it', () => {
    const reports = reportsFor([entry(9, 2)])
    const index = buildScheduleDayIndex(reports, dayPlans)
    const november = scheduleMonthModels(index, recurring, {
      year: 2026,
      month: 10,
    })
    expect(november.size).toBe(30)
    expect(november.get('2026-11-09')?.plannedMinutes).toBe(150)
    expect(november.get('2026-11-16')?.plannedMinutes).toBe(90)
    expect(november.get('2026-11-17')?.planned).toBe(false)
    expect(
      scheduleMonthModels(index, recurring, { year: 2026, month: 10 })
    ).toBe(november)

    expect(buildScheduleDayIndex(reports, dayPlans)).toBe(index)
  })

  it('starts over when the records change', () => {
    const reports = reportsFor([entry(9, 2)])
    const index = buildScheduleDayIndex(reports, dayPlans)
    const before = scheduleMonthModels(index, recurring, {
      year: 2026,
      month: 10,
    })

    const moreReports = reportsFor([entry(9, 2), entry(17, 3)])
    const after = scheduleMonthModels(
      buildScheduleDayIndex(moreReports, dayPlans),
      recurring,
      { year: 2026, month: 10 }
    )
    expect(after).not.toBe(before)
    expect(after.get('2026-11-17')?.loggedMinutes).toBe(180)

    const fewerPlans = scheduleMonthModels(index, [], {
      year: 2026,
      month: 10,
    })
    expect(fewerPlans.get('2026-11-16')?.planned).toBe(false)
  })

  it('starts over when the time zone moves', () => {
    const index = buildScheduleDayIndex(reportsFor([]), dayPlans)
    const before = scheduleMonthModels(index, recurring, {
      year: 2026,
      month: 10,
    })
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-600)
    expect(
      scheduleMonthModels(index, recurring, { year: 2026, month: 10 })
    ).not.toBe(before)
  })
})

describe('recurringPlansOverlapping', () => {
  it('keeps the plans that could fall in the range', () => {
    const ended: RecurringPlan = {
      ...weekly(2, 60),
      id: 'ended',
      recurrence: {
        ...weekly(2, 60).recurrence,
        endDate: stored(2026, 10, 10),
      },
    }
    const later = {
      ...weekly(2, 60),
      id: 'later',
      startDate: stored(2026, 11, 1),
    }
    const plans = [weekly(2, 90), ended, later]
    expect(
      recurringPlansOverlapping(
        plans,
        new Date(2026, 10, 11),
        new Date(2026, 10, 30)
      ).map((p) => p.id)
    ).toEqual(['r-2'])
    expect(
      recurringPlansOverlapping(
        plans,
        new Date(2026, 10, 1),
        new Date(2026, 11, 1)
      ).map((p) => p.id)
    ).toEqual(['r-2', 'ended', 'later'])
  })
})

describe('plannedMinutesThroughDayForMonth', () => {
  it('keeps totals per snapshot of the plans', () => {
    const dayPlans = [plan(9, 60)]
    const recurring = [weekly(2, 90)]
    expect(
      plannedMinutesThroughDayForMonth(10, 2026, 30, dayPlans, recurring)
    ).toBe(60 + 90 * 5)
    expect(
      plannedMinutesThroughDayForMonth(10, 2026, 9, dayPlans, recurring)
    ).toBe(60 + 90 * 2)
    expect(
      plannedMinutesThroughDayForMonth(
        10,
        2026,
        30,
        [...dayPlans, plan(20, 30)],
        recurring
      )
    ).toBe(90 + 90 * 5)
    expect(plannedMinutesThroughDayForMonth(10, 2026, 30, dayPlans, [])).toBe(
      60
    )
  })
})
