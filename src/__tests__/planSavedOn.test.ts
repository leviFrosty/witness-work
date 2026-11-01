import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useServiceReport from '@/stores/serviceReport'
import { petActiveDays } from '@/features/pet/lib/activity'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'
import type { DayPlan } from '@/types/timeEntry'

const plan = (id: string): DayPlan => ({
  id,
  date: new Date(2026, 9, 20, 12),
  minutes: 60,
})

const activeDays = () => {
  const { dayPlans, recurringPlans } = useServiceReport.getState()
  return [
    ...petActiveDays({
      serviceReports: {},
      visits: [],
      dayPlans,
      recurringPlans,
    }),
  ].sort()
}

describe('Plan savedOn (the Pet Companion counts the User’s saves)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 5, 9))
    useServiceReport.setState({
      dayPlans: [],
      recurringPlans: [],
      deletedDayPlans: [],
      deletedRecurringPlans: [],
    })
  })
  afterEach(() => vi.useRealTimers())

  it('stamps the day the User first saves a Plan, and keeps it on edits', () => {
    useServiceReport.getState().addDayPlan(plan('a'))
    expect(useServiceReport.getState().dayPlans[0].savedOn).toBe('2026-10-05')
    vi.setSystemTime(new Date(2026, 9, 7, 23, 30))
    useServiceReport.getState().updateDayPlan({ id: 'a', minutes: 90 })

    useServiceReport.getState().updateDayPlan({ id: 'a', note: '- [x] Tracts' })
    expect(useServiceReport.getState().dayPlans[0].savedOn).toBe('2026-10-05')
    expect(activeDays()).toEqual(['2026-10-05'])
  })

  it('stamps a Plan with no save day on the User’s first edit', () => {
    useServiceReport.setState({ dayPlans: [plan('legacy')] })
    vi.setSystemTime(new Date(2026, 9, 7, 9))
    useServiceReport.getState().updateDayPlan({ id: 'legacy', minutes: 90 })
    expect(useServiceReport.getState().dayPlans[0].savedOn).toBe('2026-10-07')
  })

  it('leaves it alone for a change Buddies makes', () => {
    useServiceReport.getState().addDayPlan(plan('a'))
    const before = useServiceReport.getState().dayPlans[0]
    vi.setSystemTime(new Date(2026, 9, 9, 9))
    useServiceReport
      .getState()
      .updateDayPlan({ id: 'a', buddies: [] }, { automatic: true })
    useServiceReport.getState().addDayPlan(plan('linked'), { automatic: true })
    const [edited, linked] = useServiceReport.getState().dayPlans

    expect(edited.updatedAt).toBeGreaterThan(before.updatedAt!)
    expect(edited.savedOn).toBe('2026-10-05')
    expect(linked.savedOn).toBeUndefined()
    expect(activeDays()).toEqual(['2026-10-05'])
  })

  it('keeps a Recurring Plan’s first save day through its edits', () => {
    const store = useServiceReport.getState()
    store.addRecurringPlan({
      id: 'r',
      startDate: new Date(2026, 9, 1, 12),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    })
    vi.setSystemTime(new Date(2026, 9, 6, 9))
    useServiceReport.getState().addRecurringPlanOverride('r', {
      date: new Date(2026, 9, 8, 12),
      minutes: 30,
    })
    useServiceReport.getState().updateRecurringPlanOverride('r', {
      date: new Date(2026, 9, 8, 12),
      minutes: 45,
    })
    useServiceReport.getState().updateRecurringPlan({ id: 'r', minutes: 90 })
    vi.setSystemTime(new Date(2026, 9, 7, 9))
    useServiceReport
      .getState()
      .deleteSingleEventFromRecurringPlan('r', new Date(2026, 9, 15, 12))
    expect(useServiceReport.getState().recurringPlans[0].savedOn).toBe(
      '2026-10-05'
    )
  })

  it('stamps a Recurring Plan with no save day on its first occurrence edit', () => {
    useServiceReport.setState({
      recurringPlans: [
        {
          id: 'legacy',
          startDate: new Date(2026, 9, 1, 12),
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
        },
      ],
    })
    useServiceReport.getState().addRecurringPlanOverride('legacy', {
      date: new Date(2026, 9, 8, 12),
      minutes: 30,
    })
    expect(useServiceReport.getState().recurringPlans[0].savedOn).toBe(
      '2026-10-05'
    )
  })
})
