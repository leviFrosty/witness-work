import { describe, expect, it, vi } from 'vitest'
import {
  resolvePlannedContributionsForDay,
  resolvePlannedDay,
} from '@/lib/recurrence'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  DayPlan,
  RecurringPlan,
  RecurringPlanFrequencies,
} from '@/types/timeEntry'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const date = normalizeDateForStorage('2026-08-05')

const dayPlan = (id: string, minutes: number): DayPlan => ({
  id,
  date,
  minutes,
})

const recurringPlan = (id: string, minutes: number): RecurringPlan => ({
  id,
  startDate: date,
  minutes,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
})

describe('resolvePlannedDay', () => {
  it('counts every Day Plan and labels intersecting recurring Plans as replaced', () => {
    const dayPlans = [dayPlan('day-1', 60), dayPlan('day-2', 60)]
    const recurringPlans = [recurringPlan('recurring-1', 240)]

    const resolution = resolvePlannedDay(date, dayPlans, recurringPlans)

    expect(resolution.counted.map(({ plan }) => plan.id)).toEqual([
      'day-1',
      'day-2',
    ])
    expect(resolution.notCounted).toMatchObject([
      {
        source: 'recurring',
        plan: { id: 'recurring-1' },
        minutes: 240,
        reason: 'replacedByDayPlans',
      },
    ])
  })

  it('counts the largest recurring Plan and labels the others as lower priority', () => {
    const recurringPlans = [
      recurringPlan('shorter', 60),
      recurringPlan('winner', 240),
      recurringPlan('medium', 120),
    ]

    const resolution = resolvePlannedDay(date, [], recurringPlans)

    expect(resolution.counted.map(({ plan }) => plan.id)).toEqual(['winner'])
    expect(
      resolution.notCounted.map(({ plan, reason }) => ({
        id: plan.id,
        reason,
      }))
    ).toEqual([
      { id: 'shorter', reason: 'lowerRecurringPriority' },
      { id: 'medium', reason: 'lowerRecurringPriority' },
    ])
  })

  it('keeps the counted-only API and its deterministic recurring tie-breaks unchanged', () => {
    const recurringPlans = [
      recurringPlan('standard', 120),
      recurringPlan('credit-z', 120),
      recurringPlan('credit-a', 120),
    ]
    const recurringIsCredit = (plan: RecurringPlan) =>
      plan.id.startsWith('credit')

    const resolution = resolvePlannedDay(date, [], recurringPlans, {
      recurringIsCredit,
    })
    const existingResult = resolvePlannedContributionsForDay(
      date,
      [],
      recurringPlans,
      { recurringIsCredit }
    )

    expect(resolution.counted.map(({ plan }) => plan.id)).toEqual(['credit-a'])
    expect(existingResult).toEqual(resolution.counted)
  })

  it('preserves the counted-only API behavior for invalid negative recurring minutes', () => {
    const invalidRecurringPlan = recurringPlan('invalid', -60)

    expect(
      resolvePlannedContributionsForDay(date, [], [invalidRecurringPlan])
    ).toEqual([])
  })
})
