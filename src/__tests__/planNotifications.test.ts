import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'
import {
  deriveOffsetFromDates,
  offsetFromMinutes,
  offsetToMinutes,
} from '@/lib/notificationOffset'
import {
  buildReminderSchedule,
  savedReminderOffsetMinutes,
} from '@/lib/reminderSchedule'

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
    // Half-second short of exactly 30 minutes — should round to 30 min, not 29.
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
          // Moved a day later; the saved fire time is for the old start.
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
