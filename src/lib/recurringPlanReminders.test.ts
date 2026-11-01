import { describe, expect, it, vi } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { RecurringPlanFrequencies, type RecurringPlan } from '@/lib/recurrence'
import { reminderData } from '@/lib/notificationData'
import type * as Notifications from 'expo-notifications'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  buildReminderSchedule,
  reminderOccurrences,
  recurringPlanOnDay,
} from '@/lib/reminderSchedule'

const at = (day: number, hours = 0, minutes = 0) =>
  new Date(2026, 2, day, hours, minutes)
const stored = (day: number) => normalizeDateForStorage(at(day, 12))

const weekly = (overrides: Partial<RecurringPlan> = {}): RecurringPlan => ({
  id: 'weekly',
  startDate: stored(3),
  minutes: 120,
  startTimeInMinutes: 9 * 60,
  title: 'Cart witnessing',
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
  notifyMe: true,
  reminderOffsetMinutes: 30,
  ...overrides,
})

const sources = (recurringPlans: RecurringPlan[], now: number) => ({
  contacts: [],
  visits: [],
  plans: [],
  recurringPlans,
  visitOffset: { amount: 0, unit: 'minutes' as const },
  planOffset: { amount: 1, unit: 'hours' as const },
  now,
})

const occurrences = (plan: RecurringPlan, now = at(1, 10).getTime()) =>
  reminderOccurrences(sources([plan], now))

describe('Recurring Plan reminders', () => {
  it('reminds before each instance that fires within two weeks', () => {
    expect(occurrences(weekly())).toEqual([
      {
        id: 'witness-work-plan-weekly-2026-03-03',
        date: at(3, 8, 30),
        kind: 'plan',
        targetId: 'weekly',
        day: '2026-03-03',
        anchor: at(3, 9),
        note: undefined,
        title: 'Cart witnessing',
        minutes: 120,
      },
      expect.objectContaining({
        id: 'witness-work-plan-weekly-2026-03-10',
        date: at(10, 8, 30),
        day: '2026-03-10',
      }),
    ])
  })

  it('reminds for none without Notify Me', () => {
    expect(occurrences(weekly({ notifyMe: undefined }))).toEqual([])
    expect(occurrences(weekly({ notifyMe: false }))).toEqual([])
  })

  it('skips deleted dates and stops at the end date', () => {
    expect(occurrences(weekly({ deletedDates: [stored(3)] }))).toEqual([
      expect.objectContaining({ day: '2026-03-10' }),
    ])
    expect(
      occurrences(
        weekly({
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: stored(9),
          },
        })
      )
    ).toEqual([expect.objectContaining({ day: '2026-03-03' })])
  })

  it("follows a date's own start, length, note, and anytime", () => {
    const [moved, anytime] = occurrences(
      weekly({
        overrides: [
          {
            date: stored(3),
            minutes: 60,
            startTimeInMinutes: 14 * 60,
            note: 'Bring the new tracts',
          },
          { date: stored(10), minutes: 180, anytime: true },
        ],
      })
    )
    expect(moved).toMatchObject({
      date: at(3, 13, 30),
      anchor: at(3, 14),
      minutes: 60,
      note: 'Bring the new tracts',
    })

    expect(anytime).toMatchObject({
      date: at(10, 8),
      anchor: at(10, 8),
      minutes: 180,
    })
  })

  it("uses the Plan preference when the Plan didn't save an offset", () => {
    const [first] = occurrences(weekly({ reminderOffsetMinutes: undefined }))
    expect(first.date).toEqual(at(3, 8))
  })

  it('looks past the horizon for a long lead', () => {
    const plan = weekly({ reminderOffsetMinutes: 3 * 7 * 24 * 60 })
    const days = buildReminderSchedule(
      sources([plan], at(1, 10).getTime())
    ).map((reminder) => reminder.day)
    expect(days).toEqual(['2026-03-24', '2026-03-31'])
  })

  it("lists a reminder that went off for the tray, but schedules what's ahead", () => {
    const now = at(10, 8, 45).getTime()
    expect(occurrences(weekly(), now).map((r) => r.day)).toEqual([
      '2026-03-10',
      '2026-03-17',
      '2026-03-24',
    ])
    expect(
      buildReminderSchedule(sources([weekly()], now)).map((r) => r.day)
    ).toEqual(['2026-03-17', '2026-03-24'])
  })

  it('keeps the whole schedule within the pending-notification budget', () => {
    const plans = Array.from({ length: 40 }, (_, index) =>
      weekly({ id: `weekly-${index}`, startTimeInMinutes: 9 * 60 + index })
    )
    const schedule = buildReminderSchedule(sources(plans, at(1, 10).getTime()))
    expect(schedule).toHaveLength(60)

    expect(schedule.slice(0, 40).every((r) => r.day === '2026-03-03')).toBe(
      true
    )
  })

  it("knows whether a Recurring Plan still has a date's instance", () => {
    const plan = weekly({ deletedDates: [stored(10)] })
    expect(recurringPlanOnDay(plan, '2026-03-03')).toBe(true)
    expect(recurringPlanOnDay(plan, '2026-03-10')).toBe(false)
    expect(recurringPlanOnDay(plan, '2026-03-04')).toBe(false)
  })

  it("carries the instance's day to the tap", () => {
    const notification = {
      request: {
        content: {
          data: { reminder: { kind: 'plan', id: 'weekly', day: '2026-03-10' } },
        },
      },
    } as unknown as Notifications.Notification
    expect(reminderData(notification)).toEqual({
      kind: 'plan',
      id: 'weekly',
      day: '2026-03-10',
    })
  })
})
