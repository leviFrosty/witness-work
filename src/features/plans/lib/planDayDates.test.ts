import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))

import { allEventsStartDate } from '@/features/plans/lib/planDayDates'
import { getPlansIntersectingDay } from '@/lib/recurrence'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'
import useServiceReport from '@/stores/serviceReport'

const day = (iso: string) => new Date(`${iso}T12:00:00`)

describe('allEventsStartDate', () => {
  it('keeps the series start when the occurrence stays on its day', () => {
    expect(
      allEventsStartDate(
        '2026-01-06T12:00:00.000Z',
        day('2026-10-20'),
        day('2026-10-20')
      )
    ).toEqual(day('2026-01-06'))
  })

  it('moves the series start as far as the occurrence moved', () => {
    expect(
      allEventsStartDate(
        new Date('2026-01-06T12:00:00.000Z'),
        day('2026-10-20'),
        day('2026-10-22')
      )
    ).toEqual(day('2026-01-08'))
    expect(
      allEventsStartDate(
        '2026-01-06T12:00:00.000Z',
        day('2026-10-20'),
        day('2026-10-19')
      )
    ).toEqual(day('2026-01-05'))
  })

  it('crosses a daylight saving change by whole days', () => {
    expect(
      allEventsStartDate(
        '2026-03-01T12:00:00.000Z',
        day('2026-03-07'),
        day('2026-03-09')
      )
    ).toEqual(day('2026-03-03'))
  })
})

describe('an "All events" edit from a later occurrence', () => {
  beforeEach(() => {
    useServiceReport.setState({ recurringPlans: [], deletedRecurringPlans: [] })
    useServiceReport.getState().addRecurringPlan({
      id: 'weekly',
      startDate: day('2026-01-06'),
      startTimeInMinutes: 600,
      minutes: 120,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    })
  })

  it('keeps every earlier occurrence', () => {
    const { startDate } = useServiceReport.getState().recurringPlans[0]
    useServiceReport.getState().updateRecurringPlan({
      id: 'weekly',
      minutes: 90,
      startDate: allEventsStartDate(
        startDate,
        day('2026-10-20'),
        day('2026-10-20')
      ),
    })

    const plans = useServiceReport.getState().recurringPlans
    expect(getPlansIntersectingDay(day('2026-01-06'), plans)).toHaveLength(1)
    expect(getPlansIntersectingDay(day('2026-01-13'), plans)).toHaveLength(1)
    expect(plans[0].minutes).toBe(90)
  })
})
