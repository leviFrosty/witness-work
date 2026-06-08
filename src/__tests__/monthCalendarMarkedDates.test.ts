import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'
import { buildMonthCalendarMarkedDates } from '@/features/service-reports/lib/monthCalendarMarkedDates'

const storedDay = (ymd: string) => normalizeDateForStorage(moment(ymd).toDate())

describe('buildMonthCalendarMarkedDates', () => {
  it('marks day plans so the calendar rerenders newly planned days', () => {
    const markedDates = buildMonthCalendarMarkedDates({
      month: 5,
      year: 2026,
      monthsReports: [],
      dayPlans: [
        {
          id: 'today-plan',
          date: storedDay('2026-06-08'),
          minutes: 90,
        },
      ],
      recurringPlans: [],
      reportDotColor: '#123456',
    })

    expect(markedDates['2026-06-08']).toMatchObject({
      planInvalidationKey: expect.stringContaining('d:today-plan'),
    })
  })

  it('keeps report markings while also changing the marker when a plan exists', () => {
    const markedDates = buildMonthCalendarMarkedDates({
      month: 5,
      year: 2026,
      monthsReports: [
        {
          id: 'report',
          date: storedDay('2026-06-08'),
          hours: 1,
          minutes: 0,
        },
      ],
      dayPlans: [
        {
          id: 'today-plan',
          date: storedDay('2026-06-08'),
          minutes: 90,
        },
      ],
      recurringPlans: [],
      reportDotColor: '#123456',
    })

    expect(markedDates['2026-06-08']).toMatchObject({
      marked: true,
      dotColor: '#123456',
      planInvalidationKey: expect.stringContaining('d:today-plan'),
    })
  })

  it('marks recurring plan instances in the displayed month', () => {
    const markedDates = buildMonthCalendarMarkedDates({
      month: 5,
      year: 2026,
      monthsReports: [],
      dayPlans: [],
      recurringPlans: [
        {
          id: 'weekly-plan',
          startDate: storedDay('2026-06-01'),
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
        },
      ],
      reportDotColor: '#123456',
    })

    expect(markedDates['2026-06-08']).toMatchObject({
      planInvalidationKey: expect.stringContaining('r:weekly-plan'),
    })
  })
})
