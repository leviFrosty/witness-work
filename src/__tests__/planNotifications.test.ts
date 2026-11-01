import moment from 'moment'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deriveOffsetFromDates,
  offsetFromMinutes,
  offsetToMinutes,
  type NotificationOffset,
} from '@/lib/notificationOffset'
import {
  buildReminderSchedule,
  savedReminderOffsetMinutes,
} from '@/lib/reminderSchedule'
import type { DayPlan } from '@/types/timeEntry'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

describe('deriveOffsetFromDates', () => {
  const anchor = moment('2026-04-27T09:00:00Z').toDate()

  it('returns minutes when no larger unit divides evenly', () => {
    const notif = moment(anchor).subtract(45, 'minutes').toDate()
    expect(deriveOffsetFromDates(anchor, notif)).toEqual({
      amount: 45,
      unit: 'minutes',
    })
  })

  it('snaps to hours when the gap divides evenly into hours', () => {
    const notif = moment(anchor).subtract(2, 'hours').toDate()
    expect(deriveOffsetFromDates(anchor, notif)).toEqual({
      amount: 2,
      unit: 'hours',
    })
  })

  it('snaps to days when the gap divides evenly into days', () => {
    const notif = moment(anchor).subtract(3, 'days').toDate()
    expect(deriveOffsetFromDates(anchor, notif)).toEqual({
      amount: 3,
      unit: 'days',
    })
  })

  it('snaps to weeks when the gap divides evenly into weeks', () => {
    const notif = moment(anchor).subtract(2, 'weeks').toDate()
    expect(deriveOffsetFromDates(anchor, notif)).toEqual({
      amount: 2,
      unit: 'weeks',
    })
  })

  it('rounds sub-minute drift so DST/clock-skew gaps still snap cleanly', () => {
    const notif = new Date(anchor.getTime() - (30 * 60 * 1000 - 500))
    expect(deriveOffsetFromDates(anchor, notif)).toEqual({
      amount: 30,
      unit: 'minutes',
    })
  })

  it('returns null when the notification fires at or after the anchor', () => {
    expect(deriveOffsetFromDates(anchor, anchor)).toBeNull()
    expect(
      deriveOffsetFromDates(anchor, moment(anchor).add(5, 'minutes').toDate())
    ).toBeNull()
  })
})

describe('reminder offsets', () => {
  const anchor = moment('2026-04-27T09:00:00Z').toDate()

  it('round-trips minutes and the cleanest offset', () => {
    expect(offsetFromMinutes(120)).toEqual({ amount: 2, unit: 'hours' })
    expect(offsetFromMinutes(0)).toBeNull()
    expect(offsetToMinutes({ amount: 2, unit: 'hours' })).toBe(120)
    expect(offsetToMinutes({ amount: undefined, unit: 'hours' })).toBeNull()
  })

  it('prefers the saved offset over the saved fire time', () => {
    expect(
      savedReminderOffsetMinutes(anchor, {
        reminderOffsetMinutes: 120,
        notifications: [{ date: moment(anchor).subtract(5, 'm').toDate() }],
      })
    ).toBe(120)
  })

  it('derives a legacy offset from the saved fire time', () => {
    expect(
      savedReminderOffsetMinutes(anchor, {
        notifications: [{ date: moment(anchor).subtract(2, 'h').toDate() }],
      })
    ).toBe(120)
    expect(savedReminderOffsetMinutes(anchor, {})).toBeUndefined()
  })

  it("keeps a moved Plan's chosen offset instead of the preference", () => {
    const now = moment(anchor).subtract(10, 'days').valueOf()
    const [reminder] = buildReminderSchedule({
      contacts: [],
      visits: [],
      plans: [
        {
          id: 'p',

          date: moment(anchor).add(1, 'day').startOf('day').toDate(),
          startTimeInMinutes: 9 * 60,
          minutes: 60,
          notifyMe: true,
          reminderOffsetMinutes: 120,
          notifications: [
            { id: 'x', date: moment(anchor).subtract(2, 'h').toDate() },
          ],
        },
      ],
      visitOffset: { amount: 30, unit: 'minutes' },
      planOffset: { amount: 30, unit: 'minutes' },
      now,
    })
    const start = moment(anchor).add(1, 'day').startOf('day').add(9, 'hours')
    expect(reminder.date).toEqual(start.subtract(2, 'hours').toDate())
  })
})

describe('reminders across a daylight saving change', () => {
  const originalTZ = process.env.TZ
  afterEach(() => {
    process.env.TZ = originalTZ
  })

  const planReminder = (
    day: [number, number, number],
    plan: Pick<DayPlan, 'reminderOffsetMinutes' | 'notifications'>,
    planOffset: NotificationOffset = { amount: 30, unit: 'minutes' }
  ) =>
    buildReminderSchedule({
      contacts: [],
      visits: [],
      plans: [
        {
          id: 'p',
          date: new Date(Date.UTC(day[0], day[1], day[2], 12)),
          startTimeInMinutes: 10 * 60,
          minutes: 60,
          notifyMe: true,
          notifications: [],
          ...plan,
        },
      ],
      visitOffset: { amount: 30, unit: 'minutes' },
      planOffset,
      now: new Date(2026, 0, 1).getTime(),
    })[0]

  it('fires "1 day before" at the same wall-clock time when clocks fall back', () => {
    process.env.TZ = 'America/New_York'
    const reminder = planReminder([2026, 10, 1], {
      reminderOffsetMinutes: 1440,
    })
    expect(reminder.date).toEqual(new Date(2026, 9, 31, 10, 0))
    expect(deriveOffsetFromDates(reminder.anchor, reminder.date)).toEqual({
      amount: 1,
      unit: 'days',
    })
  })

  it('fires "1 day before" at the same wall-clock time when clocks spring forward', () => {
    process.env.TZ = 'America/New_York'
    const reminder = planReminder([2026, 2, 8], { reminderOffsetMinutes: 1440 })
    expect(reminder.date).toEqual(new Date(2026, 2, 7, 10, 0))
    expect(
      planReminder([2026, 2, 8], { reminderOffsetMinutes: 1440 + 30 }).date
    ).toEqual(new Date(2026, 2, 7, 9, 30))
  })

  it('counts minute and hour offsets in elapsed time, as before', () => {
    process.env.TZ = 'America/New_York'

    const reminder = planReminder([2026, 10, 1], { reminderOffsetMinutes: 180 })
    expect(reminder.date.getTime()).toBe(
      new Date(2026, 10, 1, 10, 0).getTime() - 180 * 60_000
    )
    expect(deriveOffsetFromDates(reminder.anchor, reminder.date)).toEqual({
      amount: 3,
      unit: 'hours',
    })

    const night = new Date(Date.UTC(2026, 10, 1, 6))
    const midnight = new Date(night.getTime() - 120 * 60_000)
    expect(midnight.getHours()).toBe(0)
    expect(deriveOffsetFromDates(night, midnight)).toEqual({
      amount: 2,
      unit: 'hours',
    })
  })

  it('reads a day-before fallback and a legacy fire time as one day', () => {
    process.env.TZ = 'America/New_York'
    const fallback = planReminder(
      [2026, 10, 1],
      {},
      { amount: 1, unit: 'days' }
    )
    expect(fallback.date).toEqual(new Date(2026, 9, 31, 10, 0))
    expect(deriveOffsetFromDates(fallback.anchor, fallback.date)).toEqual({
      amount: 1,
      unit: 'days',
    })
    const anchor = new Date(2026, 10, 1, 10, 0)
    const legacy = {
      notifications: [{ id: 'n', date: new Date(2026, 9, 31, 10, 0) }],
    }
    expect(savedReminderOffsetMinutes(anchor, legacy)).toBe(1440)
    expect(planReminder([2026, 10, 1], legacy).date).toEqual(
      new Date(2026, 9, 31, 10, 0)
    )
  })

  it('reads day offsets older versions saved in elapsed time as days', () => {
    process.env.TZ = 'America/New_York'
    const cases: [Date, number, Date][] = [
      [new Date(2026, 10, 2, 10, 0), 2880, new Date(2026, 9, 31, 10, 0)],

      [new Date(2026, 10, 2, 10, 0), 10080, new Date(2026, 9, 26, 10, 0)],

      [new Date(2027, 2, 14, 10, 0), 1440, new Date(2027, 2, 13, 10, 0)],
    ]
    for (const [anchor, minutes, fireAt] of cases) {
      const legacy = {
        notifications: [
          { id: 'n', date: new Date(anchor.getTime() - minutes * 60_000) },
        ],
      }
      expect(savedReminderOffsetMinutes(anchor, legacy)).toBe(minutes)
      expect(
        deriveOffsetFromDates(anchor, legacy.notifications[0].date)
      ).toEqual(offsetFromMinutes(minutes))
      const day: [number, number, number] = [
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate(),
      ]
      expect(planReminder(day, legacy).date).toEqual(fireAt)
    }
  })
})
