import { describe, expect, it } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { RecurringPlanFrequencies } from '@/lib/recurrence'
import {
  isStreakMilestone,
  nextSeenStreak,
  serviceDays,
  serviceStreak,
  shownStreak,
  streakEndsSoon,
  streakLastsThrough,
  streakReminderAt,
  type ServiceStreak,
  type StreakRecords,
} from '@/lib/serviceStreak'
import type {
  DayPlan,
  RecurringPlan,
  TimeEntriesByYear,
  TimeEntry,
} from '@/types/timeEntry'

// 2026-10-06 is a Tuesday.
const now = new Date(2026, 9, 6, 15)
const stored = (key: string) => normalizeDateForStorage(`${key}T09:00:00`)

const entries = (
  ...items: [string, number, Partial<TimeEntry>?][]
): TimeEntriesByYear => {
  const reports: TimeEntriesByYear = {}
  items.forEach(([key, minutes, extra], i) => {
    const [year, month] = key.split('-').map(Number)
    reports[year] ??= {}
    reports[year][month - 1] ??= []
    reports[year][month - 1].push({
      id: `entry-${i}`,
      date: stored(key),
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
      ...extra,
    })
  })
  return reports
}

const dayPlan = (key: string, minutes = 120): DayPlan => ({
  id: `plan-${key}`,
  date: stored(key),
  minutes,
})

const records = (
  serviceReports: TimeEntriesByYear,
  dayPlans: DayPlan[] = [],
  recurringPlans: RecurringPlan[] = []
): StreakRecords => ({ serviceReports, dayPlans, recurringPlans })

const plans = (r: StreakRecords, at = now) => serviceStreak('plans', r, at)
const months = (r: StreakRecords, at = now) => serviceStreak('months', r, at)

describe('serviceDays', () => {
  it('keeps a 0h entry, the checkbox "shared" marker', () => {
    expect(serviceDays(entries(['2026-10-02', 0])).get('2026-10-02')).toBe(0)
  })

  it('sums entries per day and skips Time Rollover halves', () => {
    const days = serviceDays(
      entries(
        ['2026-10-01', 60],
        ['2026-10-01', 30],
        ['2026-10-01', 20, { rollover: true }],
        ['2026-10-03', 20, { rollover: true }]
      )
    )
    expect(days.get('2026-10-01')).toBe(90)
    expect(days.has('2026-10-03')).toBe(false)
  })
})

describe('serviceStreak — plans', () => {
  it('counts planned days kept, skipping days without a Plan', () => {
    const streak = plans(
      records(
        entries(
          ['2026-10-03', 30],
          ['2026-10-01', 15],
          ['2026-09-29', 200],
          // Time without a Plan neither adds nor breaks.
          ['2026-09-30', 60]
        ),
        [dayPlan('2026-10-03'), dayPlan('2026-10-01'), dayPlan('2026-09-29')]
      )
    )
    expect(streak).toMatchObject({ count: 3, latest: '2026-10-03' })
  })

  it('counts a day short of its Plan', () => {
    const streak = plans(
      records(entries(['2026-10-05', 5]), [dayPlan('2026-10-05', 240)])
    )
    expect(streak.count).toBe(1)
  })

  it('breaks on a planned day with no time once the next day is over', () => {
    const streak = plans(
      records(entries(['2026-10-03', 60], ['2026-09-29', 60]), [
        dayPlan('2026-10-03'),
        dayPlan('2026-10-01'),
        dayPlan('2026-09-29'),
      ])
    )
    expect(streak).toMatchObject({ count: 1, latest: '2026-10-03' })
  })

  it('waits on today and yesterday, and says when it ends', () => {
    const streak = plans(
      records(entries(['2026-10-03', 60], ['2026-10-01', 60]), [
        dayPlan('2026-10-06'),
        dayPlan('2026-10-05'),
        dayPlan('2026-10-03'),
        dayPlan('2026-10-01'),
      ])
    )
    expect(streak.count).toBe(2)
    expect(streak.due).toEqual({
      period: '2026-10-05',
      endsAt: new Date(2026, 9, 7),
    })
  })

  it('looks ahead to the next Plan once today and yesterday are kept', () => {
    const streak = plans(
      records(entries(['2026-10-06', 60]), [
        dayPlan('2026-10-06'),
        dayPlan('2026-10-09'),
      ])
    )
    expect(streak.due).toEqual({
      period: '2026-10-09',
      endsAt: new Date(2026, 9, 11),
    })
  })

  it('has nothing due without a Plan ahead', () => {
    const streak = plans(
      records(entries(['2026-10-06', 60]), [dayPlan('2026-10-06')])
    )
    expect(streak.due).toBeNull()
    expect(plans(records(entries(['2026-10-06', 60])))).toEqual({
      kind: 'plans',
      count: 0,
      latest: null,
      due: null,
    })
  })

  it("ignores a 0h Day Plan; it's a day off", () => {
    const streak = plans(
      records(entries(['2026-10-03', 60]), [
        dayPlan('2026-10-05', 0),
        dayPlan('2026-10-03'),
      ])
    )
    expect(streak.count).toBe(1)
    expect(streak.due).toBeNull()
  })

  it('counts recurring Plans', () => {
    const weekly: RecurringPlan = {
      id: 'tuesdays',
      startDate: stored('2026-09-08'),
      minutes: 120,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    }
    const streak = plans(
      records(
        entries(
          ['2026-09-08', 60],
          ['2026-09-15', 60],
          ['2026-09-22', 60],
          ['2026-09-29', 60]
        ),
        [],
        [weekly]
      )
    )
    expect(streak).toMatchObject({ count: 4, latest: '2026-09-29' })
    expect(streak.due).toEqual({
      period: '2026-10-06',
      endsAt: new Date(2026, 9, 8),
    })
  })
})

describe('serviceStreak — months', () => {
  it('counts months with any entry, the "shared" checkbox included', () => {
    expect(
      months(
        records(
          entries(['2026-10-02', 0], ['2026-09-30', 0], ['2026-08-02', 60])
        )
      )
    ).toEqual({
      kind: 'months',
      count: 3,
      latest: '2026-10-01',
      due: { period: '2026-11-01', endsAt: new Date(2027, 0, 1) },
    })
  })

  it('waits on last month through the end of this one', () => {
    const streak = months(
      records(entries(['2026-08-30', 0], ['2026-07-02', 0]))
    )
    expect(streak).toMatchObject({ count: 2, latest: '2026-08-01' })
    expect(streak.due).toEqual({
      period: '2026-09-01',
      endsAt: new Date(2026, 10, 1),
    })
  })

  it('breaks on a skipped month', () => {
    expect(
      months(records(entries(['2026-09-30', 0], ['2026-07-15', 60]))).count
    ).toBe(1)
  })
})

const streak = (overrides: Partial<ServiceStreak>): ServiceStreak => ({
  kind: 'plans',
  count: 5,
  latest: '2026-10-05',
  due: { period: '2026-10-05', endsAt: new Date(2026, 9, 7) },
  ...overrides,
})

describe('shownStreak', () => {
  it('hides streaks under 3', () => {
    expect(shownStreak(streak({ count: 2 }))).toBe(0)
    expect(shownStreak(streak({ count: 3 }))).toBe(3)
  })
})

describe('streakEndsSoon', () => {
  it('is a day out for Plans, a week for months', () => {
    expect(streakEndsSoon(streak({}), now)).toBe(true)
    expect(
      streakEndsSoon(
        streak({ due: { period: '2026-10-06', endsAt: new Date(2026, 9, 8) } }),
        now
      )
    ).toBe(false)
    const month = streak({
      kind: 'months',
      due: { period: '2026-09-01', endsAt: new Date(2026, 10, 1) },
    })
    expect(streakEndsSoon(month, new Date(2026, 9, 20))).toBe(false)
    expect(streakEndsSoon(month, new Date(2026, 9, 26))).toBe(true)
  })

  it("doesn't warn about a streak that isn't shown", () => {
    expect(streakEndsSoon(streak({ count: 2 }), now)).toBe(false)
  })
})

describe('streakReminderAt', () => {
  it('reminds at 6 PM on the last day, or 3 days before a month ends', () => {
    expect(streakReminderAt(streak({}))).toEqual(new Date(2026, 9, 6, 18))
    expect(
      streakReminderAt(
        streak({
          kind: 'months',
          due: { period: '2026-09-01', endsAt: new Date(2026, 10, 1) },
        })
      )
    ).toEqual(new Date(2026, 9, 29, 18))
    expect(streakReminderAt(streak({ count: 2 }))).toBeNull()
    expect(streakReminderAt(streak({ due: null }))).toBeNull()
  })
})

describe('streakLastsThrough', () => {
  it('is the last day before it ends, or the Plan horizon', () => {
    expect(streakLastsThrough(streak({}), now)).toBe('2026-10-06')
    expect(streakLastsThrough(streak({ due: null }), now)).toBe('2026-12-01')
  })
})

describe('isStreakMilestone', () => {
  it('celebrates Plan milestones and every month', () => {
    expect(
      [2, 3, 4, 5, 10, 11, 50, 60, 75, 100].map((n) =>
        isStreakMilestone('plans', n)
      )
    ).toEqual([false, true, false, true, true, false, true, false, true, true])
    expect(isStreakMilestone('months', 2)).toBe(false)
    expect(isStreakMilestone('months', 4)).toBe(true)
  })
})

describe('nextSeenStreak', () => {
  const at = (count: number, latest: string | null) =>
    streak({ count, latest, due: null })
  const seen = (latest: string | null) => ({ kind: 'plans' as const, latest })

  it('starts remembering silently', () => {
    expect(nextSeenStreak(null, at(5, '2026-10-05'), now)).toEqual({
      seen: seen('2026-10-05'),
      grew: false,
    })
  })

  it('grows when a newer planned day is kept', () => {
    expect(
      nextSeenStreak(seen('2026-10-03'), at(6, '2026-10-05'), now)
    ).toEqual({ seen: seen('2026-10-05'), grew: true })
  })

  it('waits for 3', () => {
    expect(
      nextSeenStreak(seen('2026-10-03'), at(2, '2026-10-05'), now)
    ).toEqual({ seen: seen('2026-10-05'), grew: false })
  })

  it("doesn't replay a day already seen, or step back", () => {
    for (const current of [
      at(6, '2026-10-05'),
      at(4, '2026-10-03'),
      at(0, null),
    ])
      expect(nextSeenStreak(seen('2026-10-05'), current, now)).toEqual({
        seen: seen('2026-10-05'),
        grew: false,
      })
  })

  it("doesn't celebrate records that were still loading, or old growth", () => {
    expect(nextSeenStreak(seen(null), at(9, '2026-10-05'), now).grew).toBe(
      false
    )
    expect(
      nextSeenStreak(seen('2026-09-20'), at(9, '2026-10-04'), now)
    ).toEqual({ seen: seen('2026-10-04'), grew: false })
  })

  it('restarts silently when the kind changes', () => {
    expect(
      nextSeenStreak(
        { kind: 'months', latest: '2026-09-01' },
        at(5, '2026-10-05'),
        now
      )
    ).toEqual({ seen: seen('2026-10-05'), grew: false })
  })
})
