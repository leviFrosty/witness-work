import { describe, expect, it, vi } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  isRecurringPlanAnytimeOnDate,
  RecurringPlanFrequencies,
  type RecurringPlan,
} from '@/lib/recurrence'
import type { DayPlan } from '@/types/timeEntry'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import { reminderOccurrences } from '@/lib/reminderSchedule'
import { unloggedDayReminderGroups } from '@/lib/unloggedDayReminders'

/** Local wall-clock instant on 2026-03-<day>. */
const at = (day: number, hours = 0, minutes = 0) =>
  new Date(2026, 2, day, hours, minutes)

const anytimePlan = (overrides: Partial<DayPlan> = {}): DayPlan => ({
  id: 'anytime',
  date: normalizeDateForStorage(at(10, 12)),
  minutes: 300,
  startTimeInMinutes: 720,
  anytime: true,
  ...overrides,
})

const weekly = (overrides: Partial<RecurringPlan> = {}): RecurringPlan => ({
  id: 'weekly',
  startDate: normalizeDateForStorage(at(3, 12)),
  minutes: 120,
  startTimeInMinutes: 720,
  anytime: true,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
  ...overrides,
})

describe('anytime Plans', () => {
  it('lets one instance of an anytime series have a time, and back', () => {
    const plan = weekly({
      overrides: [
        {
          date: normalizeDateForStorage(at(10, 12)),
          minutes: 120,
          startTimeInMinutes: 540,
          anytime: false,
        },
      ],
    })
    expect(isRecurringPlanAnytimeOnDate(plan, at(10, 12))).toBe(false)
    expect(isRecurringPlanAnytimeOnDate(plan, at(17, 12))).toBe(true)
    expect(
      isRecurringPlanAnytimeOnDate(weekly({ anytime: undefined }), at(10, 12))
    ).toBe(false)
  })

  it('reminds at 8:00 AM that day, whatever the offset', () => {
    const [reminder] = reminderOccurrences({
      contacts: [],
      visits: [],
      plans: [anytimePlan({ notifyMe: true, reminderOffsetMinutes: 30 })],
      visitOffset: { amount: 0, unit: 'minutes' },
      planOffset: { amount: 30, unit: 'minutes' },
    })
    expect(reminder).toMatchObject({
      kind: 'plan',
      date: at(10, 8),
      anchor: at(10, 8),
    })
  })

  it('reminds to log time that evening, not the next one', () => {
    // 5 hours from noon would end at 5 PM; a 10-hour one would pass 8 PM.
    const groups = unloggedDayReminderGroups(
      {
        dayPlans: [anytimePlan({ minutes: 600 })],
        recurringPlans: [],
        timeEntries: {},
        remindAt: 20 * 60,
        enabledAt: 0,
        tracksHoursIn: () => true,
      },
      at(10, 10).getTime()
    )
    expect(groups.map(({ date }) => date)).toEqual([at(10, 20)])
  })
})
