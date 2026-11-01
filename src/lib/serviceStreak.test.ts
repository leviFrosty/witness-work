import { afterAll, describe, expect, it } from 'vitest'
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
  streakHistory,
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

          ['2026-09-30', 60]
        ),
        [dayPlan('2026-10-03'), dayPlan('2026-10-01'), dayPlan('2026-09-29')]
      )
    )
    expect(streak).toMatchObject({
      count: 3,
      latest: '2026-10-03',
      since: '2026-09-29',
    })
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
      since: null,
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
      since: '2026-08-01',
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
  since: '2026-09-29',
  due: { period: '2026-10-05', endsAt: new Date(2026, 9, 7) },
  ...overrides,
})

describe('shownStreak', () => {
  it('shows any streak from its first day', () => {
    expect(shownStreak(streak({ count: 0 }))).toBe(0)
    expect(shownStreak(streak({ count: 1 }))).toBe(1)
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

  it("doesn't warn without a streak", () => {
    expect(streakEndsSoon(streak({ count: 0 }), now)).toBe(false)
  })

  describe('when clocks change', () => {
    const originalTZ = process.env.TZ
    afterAll(() => {
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    })

    it.each([
      ['America/New_York', [2026, 10, 1]],
      ['America/New_York', [2026, 2, 8]],
      ['Europe/London', [2026, 9, 25]],
      ['Australia/Sydney', [2026, 9, 4]],
    ] as const)('warns from the last day’s start in %s', (zone, [y, m, d]) => {
      process.env.TZ = zone
      const plans = streak({
        due: { period: '', endsAt: new Date(y, m, d + 1) },
      })
      expect(streakEndsSoon(plans, new Date(y, m, d - 1, 23, 30))).toBe(false)
      expect(streakEndsSoon(plans, new Date(y, m, d, 0, 30))).toBe(true)
    })

    it('warns a week before a month ends across the change', () => {
      process.env.TZ = 'Europe/London'

      const month = streak({
        kind: 'months',
        due: { period: '2026-09-01', endsAt: new Date(2026, 10, 1) },
      })
      expect(streakEndsSoon(month, new Date(2026, 9, 24, 23, 30))).toBe(false)
      expect(streakEndsSoon(month, new Date(2026, 9, 25, 0, 30))).toBe(true)
    })
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

describe('streakHistory', () => {
  const kept = (...keys: string[]) =>
    entries(...keys.map((key): [string, number] => [key, 60]))
  const planned = (...keys: string[]) => keys.map((key) => dayPlan(key))

  it('lists planned days kept, oldest first, and skips days without a Plan', () => {
    const history = streakHistory(
      'plans',
      records(
        kept('2026-09-01', '2026-09-02', '2026-09-03'),
        planned('2026-09-01', '2026-09-03')
      ),
      now
    )
    expect(history.kept).toEqual(['2026-09-01', '2026-09-03'])
    expect(history.milestones).toEqual([])
  })

  it('reaches each milestone on the planned day kept that got there', () => {
    const days = Array.from(
      { length: 10 },
      (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`
    )
    const history = streakHistory(
      'plans',
      records(kept(...days), planned(...days)),
      now
    )
    expect(history.milestones).toEqual([
      { count: 3, on: '2026-09-03' },
      { count: 5, on: '2026-09-05' },
      { count: 10, on: '2026-09-10' },
    ])
  })

  it('starts over after a missed planned day, and reaches them again', () => {
    const history = streakHistory(
      'plans',
      records(
        kept(
          '2026-09-01',
          '2026-09-02',
          '2026-09-03',
          '2026-09-05',
          '2026-09-06',
          '2026-09-07'
        ),
        planned(
          '2026-09-01',
          '2026-09-02',
          '2026-09-03',
          '2026-09-04',
          '2026-09-05',
          '2026-09-06',
          '2026-09-07'
        )
      ),
      now
    )
    expect(history.milestones).toEqual([
      { count: 3, on: '2026-09-03' },
      { count: 3, on: '2026-09-07' },
    ])
  })

  it('keeps the longest streak as the best after it ends', () => {
    const history = streakHistory(
      'plans',
      records(
        kept('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-08'),
        planned(
          '2026-09-01',
          '2026-09-02',
          '2026-09-03',
          '2026-09-05',
          '2026-09-08'
        )
      ),
      now
    )
    expect(history.best).toBe(3)
    expect(
      streakHistory('months', records(kept('2026-07-02', '2026-10-01')), now)
        .best
    ).toBe(1)
    expect(streakHistory('plans', records(kept('2026-09-01')), now).best).toBe(
      0
    )
  })

  it('keeps a milestone reached the day after a missed planned day', () => {
    const history = streakHistory(
      'plans',
      records(
        kept('2026-10-01', '2026-10-02', '2026-10-06', '2026-10-09'),
        planned(
          '2026-10-01',
          '2026-10-02',
          '2026-10-05',
          '2026-10-06',
          '2026-10-09'
        )
      ),
      new Date(2026, 9, 20, 12)
    )
    expect(history.milestones).toEqual([{ count: 3, on: '2026-10-06' }])
  })

  it("doesn't end the streak for a planned day yesterday or today", () => {
    const history = streakHistory(
      'plans',
      records(
        kept('2026-10-01', '2026-10-02', '2026-10-06'),
        planned('2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06')
      ),
      now
    )
    expect(history.milestones).toEqual([{ count: 3, on: '2026-10-06' }])
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
    const history = streakHistory(
      'plans',
      records(kept('2026-09-08', '2026-09-15', '2026-09-22'), [], [weekly]),
      now
    )
    expect(history.kept).toEqual(['2026-09-08', '2026-09-15', '2026-09-22'])
    expect(history.milestones).toEqual([{ count: 3, on: '2026-09-22' }])
  })

  it("doesn't count time logged after now", () => {
    const history = streakHistory(
      'plans',
      records(
        kept('2026-10-06', '2026-10-07'),
        planned('2026-10-06', '2026-10-07')
      ),
      now
    )
    expect(history.kept).toEqual(['2026-10-06'])
  })

  it('reaches a months milestone on each month out from the third', () => {
    const history = streakHistory(
      'months',
      records(
        entries(
          ['2026-06-12', 0],
          ['2026-07-03', 0],
          ['2026-08-20', 0],
          ['2026-08-02', 0],
          ['2026-09-09', 0]
        )
      ),
      now
    )
    expect(history.milestones).toEqual([
      { count: 3, on: '2026-08-02' },
      { count: 4, on: '2026-09-09' },
    ])
  })

  it('keeps a months milestone reached the month after one without', () => {
    const history = streakHistory(
      'months',
      records(entries(['2026-06-01', 0], ['2026-07-01', 0], ['2026-09-01', 0])),
      new Date(2026, 11, 6, 12)
    )
    expect(history.milestones).toEqual([{ count: 3, on: '2026-09-01' }])
  })

  it('starts a months streak over once the month after one without has passed', () => {
    const history = streakHistory(
      'months',
      records(
        entries(
          ['2026-03-01', 0],
          ['2026-04-01', 0],
          ['2026-05-01', 0],
          ['2026-07-01', 0],
          ['2026-08-01', 0],
          ['2026-10-01', 0]
        )
      ),
      now
    )

    expect(history.milestones).toEqual([
      { count: 3, on: '2026-05-01' },
      { count: 4, on: '2026-07-01' },
      { count: 3, on: '2026-10-01' },
    ])
  })
})
