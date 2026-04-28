import moment from 'moment'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Notifications from 'expo-notifications'
import { deriveOffsetFromDates } from '../lib/notificationOffset'

vi.mock('../lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('../stores/mmkv', () => ({
  hasMigratedFromAsyncStorage: () => true,
  MmkvStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  },
}))

const cancelScheduledNotificationAsync = vi.mocked(
  Notifications.cancelScheduledNotificationAsync
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

describe('deleteDayPlan cancels scheduled notifications', () => {
  beforeEach(async () => {
    cancelScheduledNotificationAsync.mockClear()
    const { default: useServiceReport } = await import(
      '../stores/serviceReport'
    )
    useServiceReport.setState({ dayPlans: [] })
  })
  afterEach(() => {
    vi.resetModules()
  })

  it('calls cancelScheduledNotificationAsync for each notification on the deleted plan', async () => {
    const { default: useServiceReport } = await import(
      '../stores/serviceReport'
    )
    const { addDayPlan, deleteDayPlan } = useServiceReport.getState()
    addDayPlan({
      id: 'np1',
      date: moment('2026-04-27').toDate(),
      minutes: 60,
      startTimeInMinutes: 540,
      notifyMe: true,
      notifications: [
        { id: 'notif-a', date: new Date() },
        { id: 'notif-b', date: new Date() },
      ],
    })

    deleteDayPlan('np1')

    // Microtask queue flush — the cancellations are fire-and-forget inside the
    // reducer, so wait one tick to let the scheduled async calls register.
    await new Promise((r) => setTimeout(r, 0))

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2)
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-a')
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-b')
    expect(useServiceReport.getState().dayPlans).toHaveLength(0)
  })

  it('is a no-op when the plan has no notifications', async () => {
    const { default: useServiceReport } = await import(
      '../stores/serviceReport'
    )
    const { addDayPlan, deleteDayPlan } = useServiceReport.getState()
    addDayPlan({
      id: 'np2',
      date: moment('2026-04-28').toDate(),
      minutes: 30,
    })

    deleteDayPlan('np2')

    await new Promise((r) => setTimeout(r, 0))

    expect(cancelScheduledNotificationAsync).not.toHaveBeenCalled()
  })
})
