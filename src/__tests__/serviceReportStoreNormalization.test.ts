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
import { momentStoredDate } from '@/lib/normalizeDate'
import {
  RecurringPlanFrequencies,
  type RecurringPlan,
} from '@/lib/serviceReport'

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

const expectAnchoredCalendarDay = (date: Date, ymdLocal: string) => {
  expect(date.getUTCHours()).toBe(12)
  expect(momentStoredDate(date).format('YYYY-MM-DD')).toBe(ymdLocal)
}

describe('addServiceReport', () => {
  it('normalizes the report date and rebuckets by the normalized day', () => {
    const { addServiceReport } = useServiceReport.getState()
    addServiceReport({
      id: 'r1',
      hours: 1,
      minutes: 0,
      date: moment('2026-05-15').toDate(),
    })

    const state = useServiceReport.getState()
    const stored = state.serviceReports[2026][4][0]
    expectAnchoredCalendarDay(stored.date, '2026-05-15')
  })
})

describe('addDayPlan', () => {
  it('normalizes the day plan date', () => {
    const { addDayPlan } = useServiceReport.getState()
    addDayPlan({
      id: 'd1',
      date: moment('2026-05-15').toDate(),
      minutes: 60,
    })

    const stored = useServiceReport.getState().dayPlans[0]
    expectAnchoredCalendarDay(stored.date, '2026-05-15')
  })

  it('keeps multiple day plans on the same calendar day — they stack additively', () => {
    const { addDayPlan } = useServiceReport.getState()
    addDayPlan({
      id: 'd-standard',
      date: moment('2026-05-15').toDate(),
      minutes: 60,
    })
    // Same calendar day, different time-of-day → coexists, does not replace.
    addDayPlan({
      id: 'd-ldc',
      date: new Date('2026-05-15T22:30:00.000Z'),
      minutes: 180,
    })

    const plans = useServiceReport.getState().dayPlans
    expect(plans).toHaveLength(2)
    expect(plans.map((p) => p.minutes).sort((a, b) => a - b)).toEqual([60, 180])
    plans.forEach((p) => expectAnchoredCalendarDay(p.date, '2026-05-15'))
  })

  it('ignores a day plan whose id already exists', () => {
    const { addDayPlan } = useServiceReport.getState()
    addDayPlan({
      id: 'd-dupe',
      date: moment('2026-05-15').toDate(),
      minutes: 60,
    })
    addDayPlan({
      id: 'd-dupe',
      date: moment('2026-05-16').toDate(),
      minutes: 90,
    })

    const plans = useServiceReport.getState().dayPlans
    expect(plans).toHaveLength(1)
    expect(plans[0].minutes).toBe(60)
  })
})

describe('addRecurringPlan', () => {
  it('normalizes startDate, recurrence.endDate, and override dates', () => {
    const { addRecurringPlan, addRecurringPlanOverride } =
      useServiceReport.getState()

    const plan: RecurringPlan = {
      id: 'rp1',
      startDate: moment('2026-05-01').toDate(),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: moment('2026-12-01').toDate(),
      },
    }
    addRecurringPlan(plan)
    addRecurringPlanOverride('rp1', {
      date: moment('2026-05-08').toDate(),
      minutes: 90,
    })

    const stored = useServiceReport.getState().recurringPlans[0]
    expectAnchoredCalendarDay(stored.startDate, '2026-05-01')
    expectAnchoredCalendarDay(stored.recurrence.endDate as Date, '2026-12-01')
    expectAnchoredCalendarDay(stored.overrides![0].date, '2026-05-08')
  })
})

describe('deleteSingleEventFromRecurringPlan', () => {
  it('records the deleted date as a normalized calendar day', () => {
    const { addRecurringPlan, deleteSingleEventFromRecurringPlan } =
      useServiceReport.getState()
    addRecurringPlan({
      id: 'rp1',
      startDate: moment('2026-05-01').toDate(),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    })

    deleteSingleEventFromRecurringPlan(
      'rp1',
      new Date('2026-05-15T22:30:00.000Z')
    )

    const stored = useServiceReport.getState().recurringPlans[0]
    expect(stored.deletedDates).toHaveLength(1)
    expectAnchoredCalendarDay(stored.deletedDates![0], '2026-05-15')
  })
})

describe('cross-TZ scenario through the store', () => {
  it('a JST-authored May 1 report stays in May after the device switches to PST', () => {
    setTZ('Asia/Tokyo')
    const { addServiceReport } = useServiceReport.getState()
    addServiceReport({
      id: 'jst',
      hours: 1,
      minutes: 0,
      date: moment('2026-05-01').toDate(), // midnight JST
    })

    setTZ('America/Los_Angeles')
    const state = useServiceReport.getState()
    // Bucket index is the month chosen at write time (JST: month=4 May).
    // Reading the stored date in UTC must still say May 1.
    const buckets = state.serviceReports[2026]
    const monthsWithReports = Object.keys(buckets).filter(
      (k) => buckets[k].length > 0
    )
    expect(monthsWithReports).toEqual(['4'])
    const stored = buckets[4][0]
    expect(momentStoredDate(stored.date).format('YYYY-MM-DD')).toBe(
      '2026-05-01'
    )
  })
})
