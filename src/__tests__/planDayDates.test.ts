import {
  afterAll,
  afterEach,
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
  combineDateAndStartTime,
  isStoredDateOnLocalDay,
  preserveOrNormalizeStoredDate,
  storedDateToLocalDate,
  storedDayKey,
} from '@/lib/normalizeDate'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'
import {
  planDayFromRouteDate,
  splitPlanDate,
} from '@/features/plans/lib/planDayDates'

const originalTZ = process.env.TZ
const setTZ = (tz: string) => {
  process.env.TZ = tz
}

afterEach(() => setTZ('America/Los_Angeles'))
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

beforeEach(() => {
  const s = useServiceReport.getState()
  s._WARNING_forceDeleteDayPlans()
  s._WARNING_forceDeleteRecurringPlans()
})

// NZST (UTC+12) — where local midnight is coincidentally noon UTC of the prior
// day — NZDT (UTC+13), a UTC+14 zone, and negative/zero-offset guards.
const tzs = [
  { tz: 'Pacific/Auckland', day: '2026-09-25' },
  { tz: 'Pacific/Auckland', day: '2026-10-15' },
  { tz: 'Pacific/Kiritimati', day: '2026-09-25' },
  { tz: 'UTC', day: '2026-09-25' },
  { tz: 'America/Los_Angeles', day: '2026-09-25' },
  { tz: 'Etc/GMT+12', day: '2026-09-25' },
]

/** What a tapped calendar cell hands PlanDay: its local midnight, as ISO. */
const tappedRouteDate = (day: string) => moment(day).toDate().toISOString()

/** The picker value PlanDay seeds for a new plan on a tapped day. */
const seededPickerValue = (day: string) =>
  combineDateAndStartTime(
    preserveOrNormalizeStoredDate(planDayFromRouteDate(tappedRouteDate(day))),
    undefined
  )

describe('PlanDay one-time plans', () => {
  it('seeds the picker on the tapped calendar day', () => {
    for (const { tz, day } of tzs) {
      setTZ(tz)
      expect({
        tz,
        day: moment(seededPickerValue(day)).format('YYYY-MM-DD'),
      }).toEqual({ tz, day })
    }
  })

  it('saves a plan on the tapped day onto that calendar cell', () => {
    for (const { tz, day } of tzs) {
      setTZ(tz)
      useServiceReport.getState()._WARNING_forceDeleteDayPlans()
      const { date, startTimeInMinutes } = splitPlanDate(seededPickerValue(day))
      useServiceReport
        .getState()
        .addDayPlan({ id: 'p', date, startTimeInMinutes, minutes: 60 })

      const stored = useServiceReport.getState().dayPlans[0]
      expect({ tz, day: storedDayKey(stored.date) }).toEqual({ tz, day })
      expect({ tz, onCell: isStoredDateOnLocalDay(stored.date, day) }).toEqual({
        tz,
        onCell: true,
      })
    }
  })

  it('saves a plan on the day picked in the date picker, at any start time', () => {
    for (const { tz, day } of tzs) {
      setTZ(tz)
      for (const time of ['00:00', '09:30', '23:45']) {
        useServiceReport.getState()._WARNING_forceDeleteDayPlans()
        const picked = moment(`${day} ${time}`, 'YYYY-MM-DD HH:mm').toDate()
        const { date, startTimeInMinutes } = splitPlanDate(picked)
        useServiceReport
          .getState()
          .addDayPlan({ id: 'p', date, startTimeInMinutes, minutes: 60 })

        const stored = useServiceReport.getState().dayPlans[0]
        expect({ tz, time, day: storedDayKey(stored.date) }).toEqual({
          tz,
          time,
          day,
        })
        expect(
          moment(
            combineDateAndStartTime(stored.date, stored.startTimeInMinutes)
          ).format('YYYY-MM-DD HH:mm')
        ).toBe(`${day} ${time}`)
      }
    }
  })

  it('keeps an edited plan on its day across repeated saves', () => {
    setTZ('Pacific/Auckland')
    const { addDayPlan, updateDayPlan } = useServiceReport.getState()
    addDayPlan({
      id: 'p',
      ...splitPlanDate(seededPickerValue('2026-09-25')),
      minutes: 60,
    })
    for (let i = 0; i < 3; i++) {
      const existing = useServiceReport.getState().dayPlans[0]
      updateDayPlan({
        id: 'p',
        ...splitPlanDate(
          combineDateAndStartTime(existing.date, existing.startTimeInMinutes)
        ),
      })
    }
    expect(storedDayKey(useServiceReport.getState().dayPlans[0].date)).toBe(
      '2026-09-25'
    )
  })
})

describe('PlanDay recurring plans', () => {
  it('starts a recurring plan on the picked day', () => {
    for (const { tz, day } of tzs) {
      setTZ(tz)
      useServiceReport.getState()._WARNING_forceDeleteRecurringPlans()
      const { date, startTimeInMinutes } = splitPlanDate(seededPickerValue(day))
      useServiceReport.getState().addRecurringPlan({
        id: 'r',
        startDate: date,
        startTimeInMinutes,
        minutes: 60,
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: null,
        },
      })
      const stored = useServiceReport.getState().recurringPlans[0]
      expect({ tz, day: storedDayKey(stored.startDate) }).toEqual({ tz, day })
    }
  })

  it('keeps existing overrides and deleted dates on their days when passed back through updateRecurringPlan', () => {
    setTZ('Pacific/Auckland')
    const { addRecurringPlan, addRecurringPlanOverride, updateRecurringPlan } =
      useServiceReport.getState()
    addRecurringPlan({
      id: 'r',
      startDate: moment('2026-09-01').toDate(),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
      deletedDates: [moment('2026-09-15').toDate()],
    })
    addRecurringPlanOverride('r', {
      date: moment('2026-09-08').toDate(),
      minutes: 30,
    })

    const plan = useServiceReport.getState().recurringPlans[0]
    updateRecurringPlan({
      id: 'r',
      overrides: plan.overrides?.map((o) => ({
        ...o,
        date: storedDateToLocalDate(o.date),
      })),
      deletedDates: plan.deletedDates?.map(storedDateToLocalDate),
    })

    const updated = useServiceReport.getState().recurringPlans[0]
    expect(updated.overrides?.map((o) => storedDayKey(o.date))).toEqual([
      '2026-09-08',
    ])
    expect(updated.deletedDates?.map(storedDayKey)).toEqual(['2026-09-15'])
  })
})
