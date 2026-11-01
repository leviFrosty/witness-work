import { describe, expect, it } from 'vitest'
import moment from 'moment'
import {
  dailyPace,
  monthWeeks,
  serviceDayStats,
  yearPace,
} from '@/features/progress/lib/progressCardStats'
import type { TimeEntry } from '@/types/timeEntry'

const entry = (day: string, hours: number, extra: Partial<TimeEntry> = {}) =>
  ({
    id: `${day}-${hours}`,
    date: new Date(`${day}T12:00:00.000Z`),
    hours,
    minutes: 0,
    ...extra,
  }) as TimeEntry

describe('dailyPace', () => {
  const month = 9
  const year = 2026

  it('spreads what is left over the days after today (#775)', () => {
    const pace = dailyPace({
      loggedMinutes: 25 * 60,
      goalMinutes: 50 * 60,
      month,
      year,
      today: moment({ year, month, day: 11 }),
    })
    expect(pace).toEqual({
      state: 'current',
      perDayMinutes: 75,
      perWeekMinutes: 525,
      remainingMinutes: 25 * 60,
      daysLeft: 20,
    })
  })

  it('puts it all on the last day', () => {
    const pace = dailyPace({
      loggedMinutes: 48 * 60,
      goalMinutes: 50 * 60,
      month,
      year,
      today: moment({ year, month, day: 31 }),
    })
    expect(pace).toMatchObject({
      state: 'current',
      perDayMinutes: 120,
      perWeekMinutes: null,
      daysLeft: 0,
    })
  })

  it('leaves out the week figure with under a week to go', () => {
    const pace = dailyPace({
      loggedMinutes: 0,
      goalMinutes: 50 * 60,
      month,
      year,
      today: moment({ year, month, day: 26 }),
    })
    expect(pace).toMatchObject({ daysLeft: 5, perWeekMinutes: null })
  })

  it('reports a reached goal', () => {
    expect(
      dailyPace({
        loggedMinutes: 52 * 60,
        goalMinutes: 50 * 60,
        month,
        year,
        today: moment({ year, month, day: 20 }),
      })
    ).toEqual({ state: 'met', overMinutes: 120 })
  })

  it('spreads the goal over a future month', () => {
    expect(
      dailyPace({
        loggedMinutes: 0,
        goalMinutes: 30 * 60,
        month: 10,
        year,
        today: moment({ year, month, day: 20 }),
      })
    ).toEqual({
      state: 'future',
      perDayMinutes: 60,
      perWeekMinutes: 420,
      daysLeft: 30,
    })
  })

  it('reports how a past month fell short', () => {
    expect(
      dailyPace({
        loggedMinutes: 31 * 60,
        goalMinutes: 50 * 60,
        month: 9,
        year,
        today: moment({ year, month: 10, day: 2 }),
      })
    ).toEqual({ state: 'past', averagePerDayMinutes: 60, shortMinutes: 1140 })
  })

  it('has nothing to say without a goal', () => {
    expect(
      dailyPace({
        loggedMinutes: 60,
        goalMinutes: 0,
        month,
        year,
        today: moment({ year, month, day: 5 }),
      })
    ).toBeNull()
  })
})

describe('serviceDayStats', () => {
  it('counts days with time, their average, and the longest', () => {
    const stats = serviceDayStats([
      entry('2026-10-02', 2),
      entry('2026-10-02', 1),
      entry('2026-10-05', 3),
      entry('2026-10-09', 1),
    ])
    expect(stats).toEqual({
      days: 3,
      averageMinutes: 140,
      bestDay: { day: '2026-10-02', minutes: 180 },
    })
  })

  it('skips Time Rollover halves and empty markers', () => {
    const stats = serviceDayStats([
      entry('2026-10-01', 0, { minutes: 30, rollover: true }),
      entry('2026-10-03', 0),
    ])
    expect(stats).toEqual({ days: 0, averageMinutes: 0, bestDay: null })
  })
})

describe('monthWeeks', () => {
  it('splits the month into weeks cut to its days', () => {
    const weeks = monthWeeks({
      reports: [entry('2026-10-01', 2), entry('2026-10-04', 1)],
      month: 9,
      year: 2026,
      startOfWeek: 0,
      today: moment({ year: 2026, month: 9, day: 6 }),
    })
    expect(weeks.map((w) => [w.start, w.end])).toEqual([
      ['2026-10-01', '2026-10-03'],
      ['2026-10-04', '2026-10-10'],
      ['2026-10-11', '2026-10-17'],
      ['2026-10-18', '2026-10-24'],
      ['2026-10-25', '2026-10-31'],
    ])
    expect(weeks[0]).toMatchObject({ minutes: 120, isCurrent: false })
    expect(weeks[1]).toMatchObject({ minutes: 60, isCurrent: true })
    expect(weeks[2]).toMatchObject({ isFuture: true })
  })

  it('starts weeks on Monday when asked', () => {
    const weeks = monthWeeks({
      reports: [],
      month: 9,
      year: 2026,
      startOfWeek: 1,
      today: moment({ year: 2026, month: 9, day: 6 }),
    })
    expect(weeks[0]).toMatchObject({ start: '2026-10-01', end: '2026-10-04' })
    expect(weeks[1]).toMatchObject({ start: '2026-10-05', end: '2026-10-11' })
  })
})

describe('yearPace', () => {
  it('spreads the rest of the goal over the months left, this one too', () => {
    expect(
      yearPace({
        loggedMinutes: 600 * 60 - 550 * 60,
        goalMinutes: 600 * 60,
        serviceYear: 2026,
        today: moment({ year: 2026, month: 9, day: 15 }),
      })
    ).toEqual({ state: 'current', perMonthMinutes: 3000, monthsLeft: 11 })
  })

  it('reports a reached, past, or future goal', () => {
    const today = moment({ year: 2026, month: 9, day: 15 })
    expect(
      yearPace({
        loggedMinutes: 610 * 60,
        goalMinutes: 600 * 60,
        serviceYear: 2026,
        today,
      })
    ).toEqual({ state: 'met', overMinutes: 600 })
    expect(
      yearPace({
        loggedMinutes: 500 * 60,
        goalMinutes: 600 * 60,
        serviceYear: 2025,
        today,
      })
    ).toEqual({ state: 'past', shortMinutes: 6000 })
    expect(
      yearPace({
        loggedMinutes: 0,
        goalMinutes: 600 * 60,
        serviceYear: 2027,
        today,
      })
    ).toEqual({ state: 'future', perMonthMinutes: 3000 })
  })
})
