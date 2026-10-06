import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}))
vi.mock('@/lib/dates', () => ({
  formatDate: (date: Date) =>
    `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
}))

import { describeRecurrence } from '@/lib/recurrenceText'
import { RecurringPlanFrequencies, type RecurringPlan } from '@/lib/recurrence'

// Saturday, October 3, 2026, as the store anchors calendar days.
const saturday = new Date('2026-10-03T12:00:00.000Z')

const plan = (
  recurrence: Partial<RecurringPlan['recurrence']>
): RecurringPlan => ({
  id: 'r',
  startDate: saturday,
  minutes: 60,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
    ...recurrence,
  },
})

describe('describeRecurrence', () => {
  it('names the weekday for weekly and every-other-week plans', () => {
    expect(describeRecurrence(plan({}))).toBe(
      'planRepeats_weekly {"weekday":"Saturday"}'
    )
    expect(
      describeRecurrence(
        plan({ frequency: RecurringPlanFrequencies.BI_WEEKLY })
      )
    ).toBe('planRepeats_biWeekly {"weekday":"Saturday"}')
    expect(describeRecurrence(plan({ interval: 3 }))).toBe(
      'planRepeats_everyWeeks {"count":3,"weekday":"Saturday"}'
    )
  })

  it("uses the start date's day of the month for monthly plans", () => {
    expect(
      describeRecurrence(plan({ frequency: RecurringPlanFrequencies.MONTHLY }))
    ).toBe('planRepeats_monthly {"day":"3rd"}')
  })

  it('names the week and weekday for monthly-by-weekday plans', () => {
    expect(
      describeRecurrence(
        plan({
          frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
          monthlyByWeekdayConfig: { weekday: 2, weekOfMonth: 2 },
        })
      )
    ).toBe('planRepeats_secondWeekday {"weekday":"Tuesday"}')
    expect(
      describeRecurrence(
        plan({
          frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
          monthlyByWeekdayConfig: { weekday: 0, weekOfMonth: -1 },
        })
      )
    ).toBe('planRepeats_lastWeekday {"weekday":"Sunday"}')
  })

  it('adds the last date when the plan ends', () => {
    expect(
      describeRecurrence(
        plan({ endDate: new Date('2026-12-05T12:00:00.000Z') })
      )
    ).toBe(
      'planRepeats_until {"pattern":"planRepeats_weekly {\\"weekday\\":\\"Saturday\\"}","date":"2026-12-5"}'
    )
  })
})
