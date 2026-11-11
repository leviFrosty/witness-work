import { describe, expect, it } from 'vitest'
import {
  dayPlanSuggestion,
  entriesOnDay,
  entryDayCount,
  entryDays,
  loggedMinutesOnDays,
} from '@/features/service-reports/lib/entryDays'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
  type TimeEntriesByYear,
} from '@/types/timeEntry'

const day = (iso: string) => {
  const [year, month, date] = iso.split('-').map(Number)
  return new Date(year, month - 1, date, 12)
}
const keys = (days: Date[]) =>
  days.map(
    (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  )

describe('entryDays', () => {
  const today = day('2026-11-09')

  it('ends on today, so yesterday is always next to it', () => {
    expect(keys(entryDays(today, today))).toEqual([
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
    ])
  })

  it('keeps the same days while a day among them is chosen', () => {
    expect(keys(entryDays(day('2026-11-03'), today))).toEqual(
      keys(entryDays(today, today))
    )
  })

  it('surrounds an earlier day, across a month', () => {
    expect(keys(entryDays(day('2026-11-01'), today))).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ])
  })

  it('ends on a day after today', () => {
    const days = keys(entryDays(day('2026-11-12'), today))
    expect(days[6]).toBe('2026-11-12')
    expect(days[0]).toBe('2026-11-06')
  })

  it('shows fewer days when seven would be too narrow to tap', () => {
    expect(entryDayCount(320, 48)).toBe(6)
    expect(entryDayCount(353, 44)).toBe(7)
    expect(entryDayCount(900, 44)).toBe(7)
    expect(entryDayCount(200, 48)).toBe(5)
    expect(entryDayCount(0, 48)).toBe(7)
    expect(keys(entryDays(today, today, 6))).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
    ])
  })
})

describe('loggedMinutesOnDays', () => {
  const entry = (id: string, iso: string, hours: number, minutes = 0) => ({
    id,
    hours,
    minutes,
    date: normalizeDateForStorage(day(iso)),
  })
  const reports: TimeEntriesByYear = {
    2026: {
      10: [
        entry('a', '2026-11-08', 1, 30),
        entry('b', '2026-11-08', 0, 45),
        { ...entry('c', '2026-11-09', 5), rollover: true },
      ],
      9: [entry('d', '2026-10-31', 2)],
    },
  }

  it('totals each day, without rollover time', () => {
    const logged = loggedMinutesOnDays(reports, [
      day('2026-10-31'),
      day('2026-11-08'),
      day('2026-11-09'),
    ])
    expect(logged.get('2026-10-31')).toBe(120)
    expect(logged.get('2026-11-08')).toBe(135)
    expect(logged.get('2026-11-09')).toBe(0)
  })

  it("lists a day's entries in the order they were logged, without rollover time", () => {
    expect(
      entriesOnDay(reports, day('2026-11-08')).map((entry) => entry.id)
    ).toEqual(['a', 'b'])
    expect(entriesOnDay(reports, day('2026-11-09'))).toEqual([])
    expect(entriesOnDay(reports, day('2025-11-08'))).toEqual([])
  })
})

describe('dayPlanSuggestion', () => {
  const plan = (
    id: string,
    iso: string,
    minutes: number,
    categoryId?: string
  ) =>
    ({
      id,
      date: normalizeDateForStorage(day(iso)),
      minutes,
      categoryId,
    }) satisfies DayPlan

  it('is nothing on a day without plans', () => {
    expect(dayPlanSuggestion(day('2026-11-09'), [], [])).toBeUndefined()
  })

  it("offers the day's planned time and its Type", () => {
    expect(
      dayPlanSuggestion(
        day('2026-11-09'),
        [plan('a', '2026-11-09', 120, 'ldc'), plan('b', '2026-11-10', 60)],
        []
      )
    ).toEqual({ minutes: 120, categoryId: 'ldc' })
  })

  it('adds up several plans and drops a Type they do not share', () => {
    const weekly: RecurringPlan = {
      id: 'weekly',
      startDate: normalizeDateForStorage(day('2026-11-02')),
      minutes: 90,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    }
    expect(
      dayPlanSuggestion(
        day('2026-11-09'),
        [plan('a', '2026-11-09', 120, 'ldc')],
        [weekly]
      )
    ).toEqual({ minutes: 210, categoryId: undefined })
  })
})
