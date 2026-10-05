import { describe, expect, it, vi } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
  type TimeEntriesByYear,
  type TimeEntry,
} from '@/types/timeEntry'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  unloggedDay,
  unloggedDayReminderGroups,
  unloggedDaySources,
  type UnloggedDaySources,
} from '@/lib/unloggedDayReminders'
import { buildReminderSchedule } from '@/lib/reminderSchedule'

/** Local wall-clock instant on 2026-03-<day>. */
const at = (day: number, hours = 0, minutes = 0) =>
  new Date(2026, 2, day, hours, minutes)
const now = at(10, 10).getTime()

const plan = (day: number, overrides: Partial<DayPlan> = {}): DayPlan => ({
  id: `plan-${day}`,
  date: normalizeDateForStorage(at(day, 12)),
  minutes: 120,
  startTimeInMinutes: 9 * 60,
  ...overrides,
})

const entry = (day: number, overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: `entry-${day}`,
  hours: 1,
  minutes: 0,
  date: normalizeDateForStorage(at(day, 12)),
  ...overrides,
})

const byMonth = (entries: TimeEntry[]): TimeEntriesByYear => ({
  2026: { 2: entries },
})

const sources = (
  overrides: Partial<UnloggedDaySources> = {}
): UnloggedDaySources => ({
  dayPlans: [],
  recurringPlans: [],
  timeEntries: {},
  remindAt: 20 * 60,
  enabledAt: 0,
  tracksHoursIn: () => true,
  ...overrides,
})

const keys = (groups: ReturnType<typeof unloggedDayReminderGroups>) =>
  groups.map(({ date, days }) => ({
    date,
    days: days.map((day) => day.key),
  }))

describe('unloggedDayReminderGroups', () => {
  it('reminds the evening a planned day ends without time logged', () => {
    const groups = unloggedDayReminderGroups(
      sources({ dayPlans: [plan(10)] }),
      now
    )
    expect(keys(groups)).toEqual([{ date: at(10, 20), days: ['2026-03-10'] }])
    expect(groups[0].days[0]).toMatchObject({
      minutes: 120,
      end: at(10, 11),
    })
  })

  it('waits for the next reminder time when a plan is still going', () => {
    const groups = unloggedDayReminderGroups(
      sources({
        dayPlans: [plan(10, { startTimeInMinutes: 19 * 60 }), plan(11)],
      }),
      now
    )
    // Both days land on the 11th at 8 PM, so they share one reminder.
    expect(keys(groups)).toEqual([
      { date: at(11, 20), days: ['2026-03-10', '2026-03-11'] },
    ])
  })

  it('reminds the next morning when the reminder time is before the plan', () => {
    const groups = unloggedDayReminderGroups(
      sources({ dayPlans: [plan(10)], remindAt: 8 * 60 }),
      now
    )
    expect(keys(groups)).toEqual([{ date: at(11, 8), days: ['2026-03-10'] }])
  })

  it('stays quiet once time is logged, but not for a rollover', () => {
    expect(
      unloggedDayReminderGroups(
        sources({ dayPlans: [plan(10)], timeEntries: byMonth([entry(10)]) }),
        now
      )
    ).toEqual([])
    expect(
      unloggedDayReminderGroups(
        sources({
          dayPlans: [plan(10)],
          timeEntries: byMonth([entry(10, { rollover: true })]),
        }),
        now
      )
    ).toHaveLength(1)
  })

  it('gives one reminder for several plans on a day', () => {
    const [group] = unloggedDayReminderGroups(
      sources({
        dayPlans: [
          plan(10, { categoryId: 'cart' }),
          plan(10, {
            id: 'evening',
            startTimeInMinutes: 15 * 60,
            minutes: 60,
            categoryId: 'cart',
          }),
        ],
      }),
      now
    )
    expect(group.days).toEqual([
      {
        key: '2026-03-10',
        minutes: 180,
        end: at(10, 16),
        categoryId: 'cart',
      },
    ])
  })

  it('leaves out the Type when the day mixes Types', () => {
    const [group] = unloggedDayReminderGroups(
      sources({
        dayPlans: [
          plan(10, { categoryId: 'cart' }),
          plan(10, { id: 'other', categoryId: 'hospital' }),
        ],
      }),
      now
    )
    expect(group.days[0].categoryId).toBeUndefined()
  })

  it('schedules a recurring plan only two weeks ahead and skips days off', () => {
    const weekly: RecurringPlan = {
      id: 'weekly',
      startDate: normalizeDateForStorage(at(3, 12)),
      minutes: 90,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
      deletedDates: [normalizeDateForStorage(at(17, 12))],
    }
    const groups = unloggedDayReminderGroups(
      sources({
        recurringPlans: [weekly],
        // A zero-minute Day Plan replaces the recurring one that day.
        dayPlans: [plan(10, { minutes: 0 })],
      }),
      now
    )
    // The 10th is a day off and the 17th was skipped. The 24th's reminder
    // (that evening) is past the two weeks ahead of 10 AM on the 10th.
    expect(keys(groups).flatMap(({ days }) => days)).toEqual(['2026-03-03'])
  })

  it('skips months without hours tracking', () => {
    expect(
      unloggedDayReminderGroups(
        sources({ dayPlans: [plan(10)], tracksHoursIn: () => false }),
        now
      )
    ).toEqual([])
  })

  it('leaves out days missed before the setting was turned on', () => {
    const dayPlans = [plan(4), plan(8)]
    expect(
      keys(unloggedDayReminderGroups(sources({ dayPlans }), now)).map(
        ({ days }) => days
      )
    ).toEqual([['2026-03-04'], ['2026-03-08']])
    expect(
      keys(
        unloggedDayReminderGroups(
          sources({ dayPlans, enabledAt: at(6).getTime() }),
          now
        )
      ).map(({ days }) => days)
    ).toEqual([['2026-03-08']])
  })
})

describe('unloggedDaySources', () => {
  const records = { dayPlans: [], recurringPlans: [], serviceReports: {} }
  const prefs = {
    unloggedDayReminders: true,
    unloggedDayReminderTime: 20 * 60,
    unloggedDayRemindersEnabledAt: 5,
    role: 'publisher' as const,
    roleHistory: null,
    logsHours: false,
  }

  it('is off until the setting is turned on', () => {
    expect(
      unloggedDaySources(records, { ...prefs, unloggedDayReminders: false })
    ).toBeUndefined()
  })

  it('follows whether the role logs hours that month', () => {
    const month = { year: 2026, month: 2 }
    expect(unloggedDaySources(records, prefs)?.tracksHoursIn(month)).toBe(false)
    expect(
      unloggedDaySources(records, { ...prefs, logsHours: true })?.tracksHoursIn(
        month
      )
    ).toBe(true)
  })

  it('falls back to 8 PM for an unusable time', () => {
    expect(
      unloggedDaySources(records, { ...prefs, unloggedDayReminderTime: 2000 })
        ?.remindAt
    ).toBe(20 * 60)
  })
})

describe('unloggedDay', () => {
  it('is what Add Time prefills, until the day has time', () => {
    const records = {
      dayPlans: [plan(10, { minutes: 95, categoryId: 'cart' })],
      recurringPlans: [],
      timeEntries: {},
    }
    expect(unloggedDay('2026-03-10', records)).toMatchObject({
      minutes: 95,
      categoryId: 'cart',
    })
    expect(
      unloggedDay('2026-03-10', {
        ...records,
        timeEntries: byMonth([entry(10)]),
      })
    ).toBeNull()
    expect(unloggedDay('2026-03-11', records)).toBeNull()
  })
})

describe('buildReminderSchedule', () => {
  it('schedules reminders to log time next to the other reminders', () => {
    const schedule = buildReminderSchedule({
      contacts: [],
      visits: [],
      plans: [plan(10), plan(12)],
      visitOffset: { amount: 30, unit: 'minutes' },
      planOffset: { amount: 30, unit: 'minutes' },
      unloggedDays: sources({ dayPlans: [plan(10), plan(12)] }),
      now,
    })
    expect(
      schedule.map(({ id, kind, targetId, days }) => ({
        id,
        kind,
        targetId,
        days,
      }))
    ).toEqual([
      {
        id: 'witness-work-unloggedDay-2026-03-10',
        kind: 'unloggedDay',
        targetId: '2026-03-10',
        days: ['2026-03-10'],
      },
      {
        id: 'witness-work-unloggedDay-2026-03-12',
        kind: 'unloggedDay',
        targetId: '2026-03-12',
        days: ['2026-03-12'],
      },
    ])
  })
})
