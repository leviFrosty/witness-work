import moment from 'moment'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
} from '@/types/timeEntry'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  weekNeedsPlan,
  weekPlanReminderDates,
  weekPlanSources,
  type WeekPlanSources,
} from '@/lib/weekPlanReminders'
import { buildReminderSchedule } from '@/lib/reminderSchedule'

const originalTZ = process.env.TZ

beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

const at = (month: number, day: number, hours = 0, minutes = 0) =>
  new Date(2026, month - 1, day, hours, minutes)

const plan = (
  month: number,
  day: number,
  overrides: Partial<DayPlan> = {}
): DayPlan => ({
  id: `plan-${month}-${day}`,
  date: normalizeDateForStorage(at(month, day, 12)),
  minutes: 120,
  startTimeInMinutes: 9 * 60,
  ...overrides,
})

const recurring = (overrides: Partial<RecurringPlan> = {}): RecurringPlan => ({
  id: 'recurring',
  startDate: normalizeDateForStorage(at(1, 7, 12)),
  minutes: 60,
  startTimeInMinutes: 9 * 60,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
  ...overrides,
})

const sources = (
  overrides: Partial<WeekPlanSources> = {}
): WeekPlanSources => ({
  dayPlans: [],
  recurringPlans: [],
  offDays: [],
  weekday: 6,
  remindAt: 18 * 60,
  enabledAt: 0,
  ...overrides,
})

const now = at(3, 9, 10).getTime()

const weeks = (s: WeekPlanSources, from = now) =>
  weekPlanReminderDates(s, from).map(({ week }) => week)

describe('weekPlanReminderDates', () => {
  it('invites on the chosen weekday and time to plan the week after', () => {
    const reminders = weekPlanReminderDates(sources({ enabledAt: now }), now)
    expect(reminders).toEqual([
      { date: at(3, 14, 18), week: '2026-03-15' },
      { date: at(3, 21, 18), week: '2026-03-22' },
    ])
  })

  it('lists reminders since the setting was turned on, at most two weeks back', () => {
    expect(weeks(sources())).toEqual([
      '2026-03-01',
      '2026-03-08',
      '2026-03-15',
      '2026-03-22',
    ])
    expect(weeks(sources({ enabledAt: at(3, 5).getTime() }))).toEqual([
      '2026-03-08',
      '2026-03-15',
      '2026-03-22',
    ])
  })

  it('skips a week that has a Day Plan on any day', () => {
    expect(weeks(sources({ enabledAt: now, dayPlans: [plan(3, 18)] }))).toEqual(
      ['2026-03-22']
    )

    expect(
      weeks(sources({ enabledAt: now, dayPlans: [plan(3, 15), plan(3, 28)] }))
    ).toEqual([])
  })

  it("doesn't count a Day Plan outside the week or one with no time", () => {
    expect(
      weeks(
        sources({
          enabledAt: now,
          dayPlans: [plan(3, 14), plan(3, 18, { minutes: 0 })],
        })
      )
    ).toEqual(['2026-03-15', '2026-03-22'])
  })

  it('counts Recurring Plan instances', () => {
    expect(
      weeks(sources({ enabledAt: now, recurringPlans: [recurring()] }))
    ).toEqual([])

    expect(
      weeks(
        sources({
          enabledAt: now,
          recurringPlans: [
            recurring({
              recurrence: {
                frequency: RecurringPlanFrequencies.BI_WEEKLY,
                interval: 1,
                endDate: null,
              },
            }),
          ],
        })
      )
    ).toEqual(['2026-03-22'])
  })

  it('asks again when the only instance that week was skipped or ended', () => {
    expect(
      weeks(
        sources({
          enabledAt: now,
          recurringPlans: [
            recurring({
              deletedDates: [normalizeDateForStorage(at(3, 18, 12))],
            }),
          ],
        })
      )
    ).toEqual(['2026-03-15'])
    expect(
      weeks(
        sources({
          enabledAt: now,
          recurringPlans: [
            recurring({
              recurrence: {
                frequency: RecurringPlanFrequencies.WEEKLY,
                interval: 1,
                endDate: normalizeDateForStorage(at(3, 20, 12)),
              },
            }),
          ],
        })
      )
    ).toEqual(['2026-03-22'])
  })

  it("doesn't count a zero-minute Recurring Plan override", () => {
    expect(
      weeks(
        sources({
          enabledAt: now,
          recurringPlans: [
            recurring({
              overrides: [
                {
                  date: normalizeDateForStorage(at(3, 18, 12)),
                  minutes: 0,
                },
              ],
            }),
          ],
        })
      )
    ).toEqual(['2026-03-15'])
  })

  it('stays quiet when every day is an Off Day', () => {
    expect(
      weeks(sources({ enabledAt: now, offDays: [0, 1, 2, 3, 4, 5, 6] }))
    ).toEqual([])
    expect(
      weeks(sources({ enabledAt: now, offDays: [0, 1, 2, 3, 4, 5] }))
    ).toEqual(['2026-03-15', '2026-03-22'])
  })

  it('keeps the chosen local time across daylight saving changes', () => {
    const spring = weekPlanReminderDates(
      sources({ enabledAt: at(3, 2).getTime() }),
      at(3, 2).getTime()
    )
    expect(spring[0]).toEqual({ date: at(3, 7, 18), week: '2026-03-08' })
    expect(spring[0].date.getHours()).toBe(18)

    const fallNow = at(10, 26, 10).getTime()
    const fall = weekPlanReminderDates(sources({ enabledAt: fallNow }), fallNow)
    expect(fall[0]).toEqual({ date: at(10, 31, 18), week: '2026-11-01' })
    expect(fall[0].date.getHours()).toBe(18)
    expect(fall[1]).toEqual({ date: at(11, 7, 18), week: '2026-11-08' })

    expect(
      weeks(sources({ enabledAt: fallNow, dayPlans: [plan(11, 7)] }), fallNow)
    ).toEqual(['2026-11-08'])
    expect(
      weeks(
        sources({
          enabledAt: at(3, 2).getTime(),
          dayPlans: [plan(3, 14)],
        }),
        at(3, 2).getTime()
      )
    ).toEqual(['2026-03-15'])
  })

  describe('with weeks that start on Monday', () => {
    beforeAll(() => {
      moment.updateLocale('en', { week: { dow: 1, doy: 4 } })
    })
    afterEach(() => {
      moment.updateLocale('en', { week: { dow: 0, doy: 6 } })
    })

    it('asks about the Monday-to-Sunday week after the reminder', () => {
      expect(
        weekPlanReminderDates(
          sources({ enabledAt: now, dayPlans: [plan(3, 15)] }),
          now
        )[0]
      ).toEqual({ date: at(3, 14, 18), week: '2026-03-16' })
    })
  })
})

describe('weekNeedsPlan', () => {
  it('rejects anything but a day key', () => {
    expect(weekNeedsPlan('2026-03-15', sources())).toBe(true)
    expect(weekNeedsPlan('nope', sources())).toBe(false)
  })
})

describe('weekPlanSources', () => {
  const prefs = {
    weekPlanReminder: true,
    weekPlanReminderDay: 0,
    weekPlanReminderTime: 9 * 60,
    weekPlanReminderEnabledAt: 5,
    offDays: [1],
  }
  const records = { dayPlans: [], recurringPlans: [] }

  it('is off until the User turns it on', () => {
    expect(
      weekPlanSources(records, { ...prefs, weekPlanReminder: false })
    ).toBeUndefined()
  })

  it('reads the chosen day and time, falling back to Saturday at 6 PM', () => {
    expect(weekPlanSources(records, prefs)).toMatchObject({
      weekday: 0,
      remindAt: 9 * 60,
      enabledAt: 5,
      offDays: [1],
    })
    expect(
      weekPlanSources(records, {
        ...prefs,
        weekPlanReminderDay: 7,
        weekPlanReminderTime: 24 * 60,
        weekPlanReminderEnabledAt: null,
      })
    ).toMatchObject({ weekday: 6, remindAt: 18 * 60, enabledAt: 0 })
  })
})

describe('buildReminderSchedule', () => {
  it('schedules the invitation to plan next week by that week', () => {
    const schedule = buildReminderSchedule({
      contacts: [],
      visits: [],
      plans: [],
      visitOffset: { amount: 30, unit: 'minutes' },
      planOffset: { amount: 30, unit: 'minutes' },
      weekPlan: sources({ enabledAt: now }),
      now,
    })
    expect(
      schedule.map(({ id, date, anchor, kind, targetId }) => ({
        id,
        date,
        anchor,
        kind,
        targetId,
      }))
    ).toEqual([
      {
        id: 'witness-work-weekPlan-2026-03-15',
        date: at(3, 14, 18),
        anchor: at(3, 15),
        kind: 'weekPlan',
        targetId: '2026-03-15',
      },
      {
        id: 'witness-work-weekPlan-2026-03-22',
        date: at(3, 21, 18),
        anchor: at(3, 22),
        kind: 'weekPlan',
        targetId: '2026-03-22',
      },
    ])
  })
})
