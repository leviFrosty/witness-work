import { describe, expect, it } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { RecurringPlan } from '@/lib/recurrence'
import type { DayPlan, TimeEntry } from '@/types/timeEntry'
import { dayStatus } from '@/features/plans/lib/dayStatus'
import {
  buildScheduleDayIndex,
  serviceYearDayStatuses,
} from '@/features/plans/lib/scheduleDayIndex'

const stored = (year: number, month: number, day: number) =>
  normalizeDateForStorage(new Date(year, month, day, 12))

const entry = (
  year: number,
  month: number,
  day: number,
  hours: number
): TimeEntry =>
  ({
    id: `e-${year}-${month}-${day}`,
    hours,
    minutes: 0,
    date: stored(year, month, day),
  }) as TimeEntry

const plan = (
  year: number,
  month: number,
  day: number,
  minutes: number
): DayPlan =>
  ({
    id: `p-${year}-${month}-${day}`,
    date: stored(year, month, day),
    minutes,
  }) as DayPlan

describe('dayStatus', () => {
  it('reads a day the way the month calendar colors it', () => {
    const base = {
      hasPlan: true,
      plannedMinutes: 120,
      hasEntries: false,
      loggedMinutes: 0,
      isPast: false,
    }
    expect(dayStatus({ ...base, hasPlan: false })).toBe('none')
    expect(dayStatus({ ...base, hasPlan: false, hasEntries: true })).toBe(
      'logged'
    )
    expect(dayStatus(base)).toBe('planned')
    expect(dayStatus({ ...base, isPast: true })).toBe('missed')
    expect(
      dayStatus({ ...base, hasEntries: true, loggedMinutes: 60, isPast: true })
    ).toBe('partial')
    expect(
      dayStatus({ ...base, hasEntries: true, loggedMinutes: 120, isPast: true })
    ).toBe('met')
  })
})

describe('serviceYearDayStatuses', () => {
  it('colors a Service Year from its entries and plans', () => {
    const index = buildScheduleDayIndex(
      {
        2026: {
          9: [entry(2026, 9, 1, 3), entry(2026, 9, 3, 1)],
        },
      },
      [
        plan(2026, 9, 1, 180),
        plan(2026, 9, 3, 120),
        plan(2026, 9, 6, 60),
        plan(2026, 9, 20, 60),
      ]
    )
    const statuses = serviceYearDayStatuses({
      serviceYear: 2026,
      index,
      recurringPlans: [] as RecurringPlan[],
      today: new Date(2026, 9, 7, 9),
    })
    expect(statuses.size).toBe(365)
    expect(statuses.get('2026-10-01')).toBe('met')
    expect(statuses.get('2026-10-03')).toBe('partial')
    expect(statuses.get('2026-10-06')).toBe('missed')
    expect(statuses.get('2026-10-20')).toBe('planned')
    expect(statuses.get('2026-10-21')).toBe('none')
    expect(statuses.has('2026-08-31')).toBe(false)
    expect(statuses.has('2027-08-31')).toBe(true)
  })
})
