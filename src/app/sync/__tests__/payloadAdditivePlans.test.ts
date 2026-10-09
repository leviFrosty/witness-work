import { describe, expect, it, vi } from 'vitest'
import { normalizeLegacyPlans } from '@/app/sync/payloadAdditivePlans'
import { storedDayKey } from '@/lib/normalizeDate'
import {
  type DayPlan,
  type RecurringPlan,
  RecurringPlanFrequencies,
} from '@/types/timeEntry'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const at = (day: string) => `${day}T12:00:00.000Z`

const store = () => ({
  dayPlans: [
    { id: 'cart', date: at('2026-10-09'), minutes: 60 },
  ] as unknown as DayPlan[],
  recurringPlans: [
    {
      id: 'morning',
      startDate: at('2026-10-02'),
      minutes: 120,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
      updatedAt: 10,
    },
  ] as unknown as RecurringPlan[],
})

describe('normalizeLegacyPlans', () => {
  it('skips recurring instances an older build hid behind a Day Plan', () => {
    const d = { serviceReportStore: store() }
    normalizeLegacyPlans(d)
    const [plan] = d.serviceReportStore.recurringPlans
    expect(plan.deletedDates?.map(storedDayKey)).toEqual(['2026-10-09'])
    expect(plan.updatedAt).toBe(10)
  })

  it('leaves a marked payload untouched', () => {
    const d = { serviceReportStore: { ...store(), additivePlans: true } }
    normalizeLegacyPlans(d)
    expect(d.serviceReportStore.recurringPlans[0].deletedDates).toBeUndefined()
  })
})
