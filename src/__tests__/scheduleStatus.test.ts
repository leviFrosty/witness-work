import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'

import { getScheduleStatusForMonth } from '@/lib/scheduleStatus'
import { RecurringPlanFrequencies } from '@/types/timeEntry'
import type {
  DayPlan,
  RecurringPlan,
  TimeEntriesByYear,
  TimeEntry,
} from '@/types/timeEntry'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const entry = (id: string, date: string, minutes: number): TimeEntry => ({
  id,
  date: moment(date).toDate(),
  hours: Math.floor(minutes / 60),
  minutes: minutes % 60,
})

const dayPlan = (id: string, date: string, minutes: number): DayPlan => ({
  id,
  date: moment(date).toDate(),
  minutes,
})

const reportsByMonth = (entries: TimeEntry[]): TimeEntriesByYear => {
  const reports: TimeEntriesByYear = {}
  for (const report of entries) {
    const date = moment(report.date)
    const year = date.year().toString()
    const month = date.month().toString()
    reports[year] ??= {}
    reports[year][month] ??= []
    reports[year][month].push(report)
  }
  return reports
}

const statusFor = (args: {
  today?: string
  month?: number
  year?: number
  entries?: TimeEntry[]
  dayPlans?: DayPlan[]
  recurringPlans?: RecurringPlan[]
}) =>
  getScheduleStatusForMonth({
    month: args.month ?? 6,
    year: args.year ?? 2026,
    today: moment(args.today ?? '2026-07-09').toDate(),
    serviceReports: reportsByMonth(args.entries ?? []),
    dayPlans: args.dayPlans ?? [],
    recurringPlans: args.recurringPlans ?? [],
    publisher: 'regularPioneer',
    creditLimit: { enabled: false, customLimitHours: 0 },
  })

describe('getScheduleStatusForMonth', () => {
  it('includes today when logged time matches planned time', () => {
    const status = statusFor({
      entries: [entry('today-log', '2026-07-09', 120)],
      dayPlans: [dayPlan('today-plan', '2026-07-09', 120)],
    })

    expect(status.state).toBe('onTrack')
    expect(status.actualMinutes).toBe(120)
    expect(status.plannedMinutes).toBe(120)
    expect(status.differenceMinutes).toBe(0)
  })

  it('reports behind schedule when logged time is less than planned through today', () => {
    const status = statusFor({
      entries: [entry('first-log', '2026-07-01', 60)],
      dayPlans: [
        dayPlan('first-plan', '2026-07-01', 60),
        dayPlan('today-plan', '2026-07-09', 60),
      ],
    })

    expect(status.state).toBe('behind')
    expect(status.actualMinutes).toBe(60)
    expect(status.plannedMinutes).toBe(120)
    expect(status.differenceMinutes).toBe(-60)
  })

  it('reports ahead of schedule when today pushes logged time past planned time', () => {
    const status = statusFor({
      entries: [entry('today-log', '2026-07-09', 90)],
      dayPlans: [dayPlan('today-plan', '2026-07-09', 60)],
    })

    expect(status.state).toBe('ahead')
    expect(status.actualMinutes).toBe(90)
    expect(status.plannedMinutes).toBe(60)
    expect(status.differenceMinutes).toBe(30)
  })

  it('ignores later-in-month logs and plans for a current-month status', () => {
    const status = statusFor({
      entries: [entry('future-log', '2026-07-20', 60)],
      dayPlans: [dayPlan('future-plan', '2026-07-20', 60)],
    })

    expect(status.state).toBe('noPlan')
    expect(status.actualMinutes).toBe(0)
    expect(status.plannedMinutes).toBe(0)
  })

  it('uses the full selected month when the schedule is in the past', () => {
    const status = statusFor({
      today: '2026-08-05',
      entries: [entry('late-log', '2026-07-20', 60)],
      dayPlans: [dayPlan('late-plan', '2026-07-20', 60)],
    })

    expect(status.state).toBe('onTrack')
    expect(status.throughDay).toBe(31)
    expect(status.actualMinutes).toBe(60)
    expect(status.plannedMinutes).toBe(60)
  })

  it('shows full-month planned time for a future schedule that has not started', () => {
    const status = statusFor({
      today: '2026-07-09',
      month: 7,
      entries: [entry('future-log', '2026-08-20', 60)],
      dayPlans: [
        dayPlan('early-plan', '2026-08-02', 60),
        dayPlan('late-plan', '2026-08-20', 90),
      ],
    })

    expect(status.state).toBe('notStarted')
    expect(status.throughDay).toBe(31)
    expect(status.actualMinutes).toBe(0)
    expect(status.plannedMinutes).toBe(150)
  })

  it('expands recurring plans through the schedule status range', () => {
    const recurringPlan: RecurringPlan = {
      id: 'weekly-plan',
      startDate: moment('2026-07-02').toDate(),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    }

    const status = statusFor({
      today: '2026-07-09',
      entries: [entry('first-log', '2026-07-02', 60)],
      recurringPlans: [recurringPlan],
    })

    expect(status.state).toBe('behind')
    expect(status.plannedMinutes).toBe(120)
    expect(status.actualMinutes).toBe(60)
  })
})
