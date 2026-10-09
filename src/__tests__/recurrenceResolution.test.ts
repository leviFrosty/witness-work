import { describe, expect, it, vi } from 'vitest'
import {
  plannedMinutesThroughDayForMonth,
  plannedMinutesThroughEachDayOfMonth,
  plannedMinutesForDay,
  resolvePlannedContributionsForDay,
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

describe('resolvePlannedContributionsForDay', () => {
  it('counts every Day Plan and every recurring Plan on the day', () => {
    const dayPlans = [dayPlan('day-1', 60), dayPlan('day-2', 60)]
    const recurringPlans = [recurringPlan('recurring-1', 240)]

    const contributions = resolvePlannedContributionsForDay(
      date,
      dayPlans,
      recurringPlans
    )

    expect(
      contributions.map(({ source, plan, minutes }) => ({
        source,
        id: plan.id,
        minutes,
      }))
    ).toEqual([
      { source: 'day', id: 'day-1', minutes: 60 },
      { source: 'day', id: 'day-2', minutes: 60 },
      { source: 'recurring', id: 'recurring-1', minutes: 240 },
    ])
    expect(plannedMinutesForDay(date, dayPlans, recurringPlans)).toBe(360)
  })

  it('counts every recurring Plan that falls on the day', () => {
    const recurringPlans = [
      recurringPlan('morning', 120),
      recurringPlan('study', 60),
    ]

    expect(
      resolvePlannedContributionsForDay(date, [], recurringPlans).map(
        ({ plan }) => plan.id
      )
    ).toEqual(['morning', 'study'])
    expect(plannedMinutesForDay(date, [], recurringPlans)).toBe(180)
  })

  it('tags each Plan with its own credit-ness', () => {
    const contributions = resolvePlannedContributionsForDay(
      date,
      [dayPlan('day', 60)],
      [recurringPlan('credit', 120), recurringPlan('standard', 30)],
      {
        dayPlanIsCredit: () => false,
        recurringIsCredit: (plan) => plan.id === 'credit',
      }
    )

    expect(
      contributions.map(({ plan, isCredit }) => [plan.id, isCredit])
    ).toEqual([
      ['day', false],
      ['credit', true],
      ['standard', false],
    ])
  })

  it('leaves out recurring Plans skipped on the day', () => {
    const skipped = { ...recurringPlan('skipped', 120), deletedDates: [date] }

    expect(
      resolvePlannedContributionsForDay(
        date,
        [dayPlan('day', 60)],
        [skipped]
      ).map(({ plan }) => plan.id)
    ).toEqual(['day'])
  })

  it('ignores invalid negative recurring minutes', () => {
    const invalidRecurringPlan = recurringPlan('invalid', -60)

    expect(
      resolvePlannedContributionsForDay(date, [], [invalidRecurringPlan])
    ).toEqual([])
  })
})

describe('plannedMinutesThroughEachDayOfMonth', () => {
  it('matches plannedMinutesThroughDayForMonth for every day', () => {
    // Weekly from Wednesday the 5th, plus a Day Plan on the 12th.
    const dayPlans: DayPlan[] = [
      { id: 'day', date: normalizeDateForStorage('2026-08-12'), minutes: 30 },
    ]
    const recurringPlans = [recurringPlan('weekly', 120)]

    const byDay = plannedMinutesThroughEachDayOfMonth(
      7,
      2026,
      dayPlans,
      recurringPlans
    )

    expect(byDay).toHaveLength(31)
    expect([byDay[3], byDay[4], byDay[11], byDay[30]]).toEqual([
      0, 120, 270, 510,
    ])
    byDay.forEach((minutes, i) =>
      expect(minutes).toBe(
        plannedMinutesThroughDayForMonth(
          7,
          2026,
          i + 1,
          dayPlans,
          recurringPlans
        )
      )
    )
  })
})
