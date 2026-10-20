import moment from 'moment'
import { afterEach, describe, expect, it } from 'vitest'
import {
  copiedPlansBucket,
  lastWeekPlanCopies,
  weekHasDaysAhead,
} from '@/lib/copyLastWeekPlans'
import { normalizeDateForStorage, storedDayKey } from '@/lib/normalizeDate'
import { RecurringPlanFrequencies, type RecurringPlan } from '@/lib/recurrence'
import type { DayPlan } from '@/types/timeEntry'

/** Local noon on a `YYYY-MM-DD` day. */
const local = (key: string) =>
  moment(`${key} 12:00`, 'YYYY-MM-DD HH:mm').toDate()

const plan = (key: string, overrides: Partial<DayPlan> = {}): DayPlan => ({
  id: `plan-${key}-${overrides.startTimeInMinutes ?? 'x'}`,
  date: normalizeDateForStorage(local(key)),
  minutes: 120,
  startTimeInMinutes: 9 * 60,
  ...overrides,
})

const weekly = (key: string, overrides: Partial<RecurringPlan> = {}) =>
  ({
    id: `weekly-${key}`,
    startDate: normalizeDateForStorage(local(key)),
    minutes: 60,
    startTimeInMinutes: 9 * 60,
    recurrence: { frequency: RecurringPlanFrequencies.WEEKLY, interval: 1 },
    ...overrides,
  }) as RecurringPlan

let ids = 0
const copies = (
  args: Omit<Partial<Parameters<typeof lastWeekPlanCopies>[0]>, 'day'> & {
    dayPlans: DayPlan[]
    day: string
  }
) =>
  lastWeekPlanCopies({
    recurringPlans: [],
    startOfWeek: 0,
    offDays: [],
    today: local('2026-10-01'),
    newId: () => `copy-${++ids}`,
    ...args,
    day: local(args.day),
  })

/** Each copy's day and start time. */
const days = (result: DayPlan[]) =>
  result.map(
    (copy) =>
      `${storedDayKey(normalizeDateForStorage(copy.date))} ${copy.anytime ? 'anytime' : copy.startTimeInMinutes}`
  )

const originalTZ = process.env.TZ
afterEach(() => {
  process.env.TZ = originalTZ
  ids = 0
})

describe('lastWeekPlanCopies', () => {
  it("copies a Plan onto the same weekday with everything but who's invited", () => {
    const source = plan('2026-10-13', {
      minutes: 150,
      startTimeInMinutes: 9 * 60 + 30,
      categoryId: 'cart',
      title: 'Cart witnessing',
      location: { name: 'Main St', latitude: 1, longitude: 2 },
      note: 'Bring tracts',
      buddies: ['inbox-1'],
      source: 'recommendation',
      savedOn: '2026-10-10',
      updatedAt: 5,
    })
    const [copy, ...rest] = copies({ dayPlans: [source], day: '2026-10-21' })
    expect(rest).toEqual([])
    expect(copy).toEqual({
      id: 'copy-1',
      date: local('2026-10-20'),
      minutes: 150,
      startTimeInMinutes: 9 * 60 + 30,
      categoryId: 'cart',
      title: 'Cart witnessing',
      location: { name: 'Main St', latitude: 1, longitude: 2 },
      note: 'Bring tracts',
      noteDoc: undefined,
    })
  })

  it('copies every day of last week, by Start of Week', () => {
    // Sunday the 11th through Saturday the 17th, and the Sunday after.
    const dayPlans = [
      plan('2026-10-10'),
      plan('2026-10-11'),
      plan('2026-10-17'),
      plan('2026-10-18', { startTimeInMinutes: 600 }),
    ]
    expect(days(copies({ dayPlans, day: '2026-10-21' }))).toEqual([
      '2026-10-18 540',
      '2026-10-24 540',
    ])
    // A week from Monday: Monday the 12th through Sunday the 18th.
    expect(
      days(copies({ dayPlans, day: '2026-10-21', startOfWeek: 1 }))
    ).toEqual(['2026-10-24 540', '2026-10-25 600'])
  })

  it('copies across a month and a year boundary', () => {
    expect(
      days(
        copies({
          dayPlans: [plan('2026-10-29'), plan('2026-10-31')],
          day: '2026-11-02',
        })
      )
    ).toEqual(['2026-11-05 540', '2026-11-07 540'])
    expect(
      days(
        copies({
          dayPlans: [plan('2026-12-28'), plan('2026-12-31')],
          day: '2027-01-06',
          today: local('2026-12-01'),
        })
      )
    ).toEqual(['2027-01-04 540', '2027-01-07 540'])
  })

  it.each([
    // Clocks fall back on Sunday, November 1, 2026 and spring forward on
    // Sunday, March 8, 2026 in New York, and on April 5 and October 4, 2026 in
    // Sydney.
    ['America/New_York', '2026-10-25', '2026-11-01'],
    ['America/New_York', '2026-10-31', '2026-11-07'],
    ['America/New_York', '2026-03-01', '2026-03-08'],
    ['Australia/Sydney', '2026-03-29', '2026-04-05'],
    ['Australia/Sydney', '2026-09-27', '2026-10-04'],
    ['Pacific/Auckland', '2026-09-20', '2026-09-27'],
  ])('keeps the weekday and time across DST in %s (%s)', (tz, from, to) => {
    process.env.TZ = tz
    const source = plan(from, { startTimeInMinutes: 2 * 60 + 30 })
    const result = copies({
      dayPlans: [source],
      day: to,
      today: local('2026-01-01'),
    })
    expect(days(result)).toEqual([`${to} 150`])
    expect(moment(result[0].date).format('YYYY-MM-DD')).toBe(to)
  })

  it('leaves recurring Plans and Plans joined through a buddy where they are', () => {
    expect(
      copies({
        dayPlans: [
          plan('2026-10-13', {
            buddyShare: { from: 'inbox-1', shareId: 'theirs' },
          }),
        ],
        recurringPlans: [weekly('2026-10-06')],
        day: '2026-10-20',
      })
    ).toEqual([])
  })

  it('skips a day that already has a Plan at the same start time', () => {
    const dayPlans = [
      plan('2026-10-13', { startTimeInMinutes: 540 }),
      plan('2026-10-13', { startTimeInMinutes: 840 }),
      plan('2026-10-14', { startTimeInMinutes: 540 }),
      plan('2026-10-15', { anytime: true, startTimeInMinutes: 720 }),
      plan('2026-10-16', { anytime: true, startTimeInMinutes: 720 }),
      // Already on this week.
      plan('2026-10-20', { startTimeInMinutes: 540 }),
      plan('2026-10-22', { anytime: true, startTimeInMinutes: 720 }),
      // Noon, but with a set time.
      plan('2026-10-23', { startTimeInMinutes: 720 }),
    ]
    expect(
      days(
        copies({
          dayPlans,
          // A recurring Plan at 9:00 every Wednesday.
          recurringPlans: [weekly('2026-10-07')],
          day: '2026-10-20',
        })
      )
    ).toEqual(['2026-10-20 840', '2026-10-23 anytime'])
  })

  it('counts a recurring instance at its own time on that date', () => {
    const recurring = weekly('2026-10-07', {
      overrides: [
        {
          date: normalizeDateForStorage(local('2026-10-21')),
          minutes: 60,
          startTimeInMinutes: 14 * 60,
        },
      ],
    })
    expect(
      days(
        copies({
          dayPlans: [
            plan('2026-10-14', { startTimeInMinutes: 540 }),
            plan('2026-10-14', { startTimeInMinutes: 840 }),
          ],
          recurringPlans: [recurring],
          day: '2026-10-20',
        })
      )
    ).toEqual(['2026-10-21 540'])
  })

  it('adds nothing when copied again', () => {
    const dayPlans = [plan('2026-10-13'), plan('2026-10-15')]
    const first = copies({ dayPlans, day: '2026-10-20' })
    expect(first).toHaveLength(2)
    expect(
      copies({ dayPlans: [...dayPlans, ...first], day: '2026-10-20' })
    ).toEqual([])
  })

  it('skips Off Days and days already past', () => {
    const dayPlans = [
      plan('2026-10-11'),
      plan('2026-10-12'),
      plan('2026-10-13'),
      plan('2026-10-14'),
      plan('2026-10-17'),
    ]
    expect(
      days(
        copies({
          dayPlans,
          day: '2026-10-19',
          today: local('2026-10-19'),
          offDays: [6],
        })
      )
    ).toEqual(['2026-10-19 540', '2026-10-20 540', '2026-10-21 540'])
  })

  it('gives each copy a new id, which its reminder uses', () => {
    const dayPlans = [
      plan('2026-10-13', {
        id: 'a',
        notifyMe: true,
        reminderOffsetMinutes: 30,
      }),
      plan('2026-10-14', {
        id: 'b',
        anytime: true,
        startTimeInMinutes: 720,
        notifyMe: true,
      }),
      plan('2026-10-15', { id: 'c', notifyMe: false }),
    ]
    const result = copies({ dayPlans, day: '2026-10-20' })
    expect(result.map((copy) => copy.id)).toEqual([
      'copy-1',
      'copy-2',
      'copy-3',
    ])
    expect(result[0]).toMatchObject({
      notifyMe: true,
      reminderOffsetMinutes: 30,
      notifications: [
        {
          id: 'witness-work-plan-copy-1',
          date: moment('2026-10-20 08:30', 'YYYY-MM-DD HH:mm').toDate(),
        },
      ],
    })
    expect(result[1]).toMatchObject({
      notifyMe: true,
      notifications: [
        {
          id: 'witness-work-plan-copy-2',
          date: moment('2026-10-21 08:00', 'YYYY-MM-DD HH:mm').toDate(),
        },
      ],
    })
    expect(result[2].notifyMe).toBeUndefined()
  })
})

describe('weekHasDaysAhead', () => {
  const today = local('2026-10-21')
  it.each([
    ['2026-10-17', 0, false],
    ['2026-10-18', 0, true],
    ['2026-10-24', 0, true],
    // Weeks from Thursday: the 15th through the 21st.
    ['2026-10-15', 4, true],
    ['2026-10-14', 4, false],
  ])('%s (week from %i): %s', (day, startOfWeek, expected) => {
    expect(weekHasDaysAhead(local(day), startOfWeek, today)).toBe(expected)
  })
})

it('buckets how many Plans were copied', () => {
  expect([1, 2, 3, 4, 6, 7, 30].map(copiedPlansBucket)).toEqual([
    '1',
    '2-3',
    '2-3',
    '4-6',
    '4-6',
    '7+',
    '7+',
  ])
})
