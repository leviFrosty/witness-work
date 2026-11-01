import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import moment from 'moment'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useServiceReport from '@/stores/serviceReport'
import {
  RecurringPlanFrequencies,
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  standardMinutesForSpecificMonth,
} from '@/lib/serviceReport'
import { getPlansIntersectingDay } from '@/lib/recurrence'

const originalTZ = process.env.TZ
const setTZ = (tz: string) => {
  process.env.TZ = tz
}

beforeAll(() => setTZ('America/Los_Angeles'))
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

beforeEach(() => {
  const s = useServiceReport.getState()
  s._WARNING_forceDeleteServiceReports()
  s._WARNING_forceDeleteDayPlans()
  s._WARNING_forceDeleteRecurringPlans()
})

describe('end-to-end TZ stability', () => {
  it('a JST-authored May 1 report is counted in May totals after the device switches to PST', () => {
    setTZ('Asia/Tokyo')
    useServiceReport.getState().addServiceReport({
      id: 'jst-report',
      hours: 2,
      minutes: 30,
      date: moment('2026-05-01').toDate(),
    })

    setTZ('America/Los_Angeles')
    const state = useServiceReport.getState()

    const monthsReports = getMonthsReports(state.serviceReports, 4, 2026)
    const standard = standardMinutesForSpecificMonth(monthsReports, 4, 2026)
    expect(standard).toBe(2 * 60 + 30)

    const adjusted = adjustedMinutesForSpecificMonth(monthsReports, 4, 2026)
    expect(adjusted.value).toBe(2 * 60 + 30)
  })

  it('a JST-authored May 1 report is also correctly counted in NZDT (UTC+13)', () => {
    setTZ('Asia/Tokyo')
    useServiceReport.getState().addServiceReport({
      id: 'jst-report',
      hours: 1,
      minutes: 0,
      date: moment('2026-05-01').toDate(),
    })

    setTZ('Pacific/Auckland')
    const state = useServiceReport.getState()
    const monthsReports = getMonthsReports(state.serviceReports, 4, 2026)
    const standard = standardMinutesForSpecificMonth(monthsReports, 4, 2026)
    expect(standard).toBe(60)
  })

  it('getPlansIntersectingDay returns a JST-authored weekly plan when queried in NZDT', () => {
    setTZ('Asia/Tokyo')
    useServiceReport.getState().addRecurringPlan({
      id: 'rp-weekly',
      startDate: moment('2026-05-01').toDate(),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    })

    setTZ('Pacific/Auckland')
    const plans = useServiceReport.getState().recurringPlans

    const startDay = moment('2026-05-01').toDate()
    expect(getPlansIntersectingDay(startDay, plans).map((p) => p.id)).toEqual([
      'rp-weekly',
    ])

    const nextWeek = moment('2026-05-08').toDate()
    expect(getPlansIntersectingDay(nextWeek, plans).map((p) => p.id)).toEqual([
      'rp-weekly',
    ])

    const saturday = moment('2026-05-02').toDate()
    expect(getPlansIntersectingDay(saturday, plans)).toEqual([])
  })

  it('respects deletedDates entries written from a different TZ', () => {
    setTZ('America/Los_Angeles')
    useServiceReport.getState().addRecurringPlan({
      id: 'rp-weekly-2',
      startDate: moment('2026-05-01').toDate(),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    })

    useServiceReport
      .getState()
      .deleteSingleEventFromRecurringPlan(
        'rp-weekly-2',
        moment('2026-05-08').toDate()
      )

    setTZ('Pacific/Auckland')
    const plans = useServiceReport.getState().recurringPlans
    const queryDay = moment('2026-05-08').toDate()
    expect(getPlansIntersectingDay(queryDay, plans)).toEqual([])
  })
})
