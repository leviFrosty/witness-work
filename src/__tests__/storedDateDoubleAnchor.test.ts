import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useServiceReport from '@/stores/serviceReport'
import { normalizeDateForUpdate, storedDayKey } from '@/lib/normalizeDate'
import { reconcileLinkedPlans } from '@/features/buddies/lib/linkedPlans'
import { hasSharedEventEnded } from '@/features/buddies/lib/shareTiming'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'

const originalTZ = process.env.TZ
const setTZ = (tz: string) => {
  process.env.TZ = tz
}
const tzs = [
  'Pacific/Auckland',
  'Pacific/Tongatapu',
  'UTC',
  'America/Los_Angeles',
  'Pacific/Honolulu',
]

afterEach(() => setTZ('America/Los_Angeles'))
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

const reset = () => {
  const store = useServiceReport.getState()
  store._WARNING_forceDeleteServiceReports()
  store._WARNING_forceDeleteDayPlans()
  store._WARNING_forceDeleteRecurringPlans()
  useServiceReport.setState({ deletedDayPlans: [] })
}
beforeEach(reset)

const asJson = <T>(value: T): T => JSON.parse(JSON.stringify(value))

describe('Buddies "Going" Plans', () => {
  const now = Date.parse('2026-10-19T00:00:00Z')
  const share = (m = 90) => ({
    from: 'buddy',
    shareId: 'share-1',
    type: 'plan' as const,
    rev: 1,
    details: { d: '2026-10-31', s: 600, m, title: 'Cart' },
    expiresAt: 0,
    receivedAt: 0,
    status: 'going' as const,
  })
  const syncLinkedPlans = (shares: ReturnType<typeof share>[]) => {
    const report = useServiceReport.getState()
    const changes = reconcileLinkedPlans(report.dayPlans, shares, { now })
    for (const plan of changes.add) report.addDayPlan(plan)
    for (const plan of changes.update) report.updateDayPlan(plan)
    return changes
  }
  const plannedDay = () =>
    storedDayKey(useServiceReport.getState().dayPlans[0].date)

  it('stores the buddy’s day and settles after one reconcile', () => {
    for (const tz of tzs) {
      setTZ(tz)
      reset()
      expect(syncLinkedPlans([share()]).add).toHaveLength(1)
      expect({ tz, day: plannedDay() }).toEqual({ tz, day: '2026-10-31' })

      expect({ tz, update: syncLinkedPlans([share()]).update }).toEqual({
        tz,
        update: [],
      })
      useServiceReport.setState(asJson(useServiceReport.getState()))
      expect({ tz, update: syncLinkedPlans([share()]).update }).toEqual({
        tz,
        update: [],
      })
    }
  })

  it('keeps the day when the buddy changes the Plan', () => {
    for (const tz of tzs) {
      setTZ(tz)
      reset()
      syncLinkedPlans([share()])
      expect(syncLinkedPlans([share(120)]).update).toHaveLength(1)
      expect({ tz, day: plannedDay() }).toEqual({ tz, day: '2026-10-31' })
      expect(useServiceReport.getState().dayPlans[0].minutes).toBe(120)
      expect(syncLinkedPlans([share(120)]).update).toEqual([])
    }
  })
})

describe('updateServiceReport', () => {
  const addAug31 = () =>
    useServiceReport.getState().addServiceReport({
      id: 'r',
      hours: 1,
      minutes: 0,
      date: new Date(2026, 7, 31, 12),
    })
  const stored = () => useServiceReport.getState().serviceReports[2026][7][0]
  const bucketed = () =>
    Object.entries(useServiceReport.getState().serviceReports).flatMap(
      ([year, months]) =>
        Object.entries(months).flatMap(([month, entries]) =>
          entries.map((r) => `${year}/${month}: ${storedDayKey(r.date)}`)
        )
    )

  it('keeps the entry on its day when the stored entry is spread back', () => {
    for (const tz of tzs) {
      setTZ(tz)
      reset()
      addAug31()
      for (let i = 0; i < 3; i++) {
        useServiceReport
          .getState()
          .updateServiceReport({ ...stored(), note: `note ${i}` })
      }
      expect({ tz, entries: bucketed() }).toEqual({
        tz,
        entries: ['2026/7: 2026-08-31'],
      })
      expect(stored().note).toBe('note 2')

      useServiceReport.setState(asJson(useServiceReport.getState()))
      useServiceReport
        .getState()
        .updateServiceReport({ ...stored(), note: 'rehydrated' })
      expect({ tz, entries: bucketed() }).toEqual({
        tz,
        entries: ['2026/7: 2026-08-31'],
      })
    }
  })

  it('still moves an entry to a newly picked local day', () => {
    for (const tz of tzs) {
      setTZ(tz)
      reset()
      addAug31()

      useServiceReport
        .getState()
        .updateServiceReport({ ...stored(), date: new Date(2026, 8, 1) })
      expect({ tz, entries: bucketed() }).toEqual({
        tz,
        entries: ['2026/8: 2026-09-01'],
      })
    }
  })

  it('still reads a stored anchor that is not the entry’s own as local input', () => {
    setTZ('Pacific/Auckland')
    addAug31()
    useServiceReport.getState().updateServiceReport({
      ...stored(),
      date: new Date(Date.UTC(2026, 7, 31, 12)),
    })

    expect(bucketed()).toEqual(['2026/8: 2026-09-01'])
  })
})

describe('updateDayPlan', () => {
  it('keeps the Plan on its day when the stored Plan is spread back', () => {
    for (const tz of tzs) {
      setTZ(tz)
      reset()
      const store = useServiceReport.getState()
      store.addDayPlan({ id: 'p', minutes: 60, date: new Date(2026, 7, 31) })
      for (let i = 0; i < 3; i++) {
        const plan = useServiceReport.getState().dayPlans[0]
        useServiceReport.getState().updateDayPlan({ ...plan, title: `t${i}` })
      }
      expect({
        tz,
        day: storedDayKey(useServiceReport.getState().dayPlans[0].date),
      }).toEqual({ tz, day: '2026-08-31' })
    }
  })
})

describe('updateRecurringPlan', () => {
  it('keeps stored dates that are spread back', () => {
    for (const tz of tzs) {
      setTZ(tz)
      reset()
      useServiceReport.getState().addRecurringPlan({
        id: 'rp',
        minutes: 60,
        startDate: new Date(2026, 7, 3, 12),
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: new Date(2026, 9, 26, 12),
        },
        deletedDates: [new Date(2026, 7, 10, 12)],
        overrides: [{ date: new Date(2026, 7, 17, 12), minutes: 30 }],
      })
      const plan = useServiceReport.getState().recurringPlans[0]
      useServiceReport.getState().updateRecurringPlan({ ...plan, minutes: 90 })
      useServiceReport.getState().updateRecurringPlanOverride('rp', {
        ...plan.overrides![0],
        minutes: 45,
      })
      const updated = useServiceReport.getState().recurringPlans[0]
      expect({
        tz,
        minutes: updated.minutes,
        start: storedDayKey(updated.startDate),
        end: storedDayKey(updated.recurrence.endDate!),
        deleted: updated.deletedDates!.map(storedDayKey),
        overrides: updated.overrides!.map((o) => [
          storedDayKey(o.date),
          o.minutes,
        ]),
      }).toEqual({
        tz,
        minutes: 90,
        start: '2026-08-03',
        end: '2026-10-26',
        deleted: ['2026-08-10'],
        overrides: [['2026-08-17', 45]],
      })
    }
  })
})

describe('normalizeDateForUpdate', () => {
  it('keeps only the stored value itself', () => {
    setTZ('Pacific/Auckland')
    const stored = new Date(Date.UTC(2026, 7, 31, 12))
    expect(storedDayKey(normalizeDateForUpdate(stored, stored))).toBe(
      '2026-08-31'
    )
    expect(
      storedDayKey(normalizeDateForUpdate(stored.toISOString(), stored))
    ).toBe('2026-08-31')
    expect(
      storedDayKey(normalizeDateForUpdate(stored, stored.toISOString()))
    ).toBe('2026-09-01')
    expect(storedDayKey(normalizeDateForUpdate(stored))).toBe('2026-09-01')
    expect(
      storedDayKey(normalizeDateForUpdate(new Date(2026, 7, 30, 12), stored))
    ).toBe('2026-08-30')
  })
})

describe('hasSharedEventEnded', () => {
  it('ends a shared Plan on its own day', () => {
    for (const tz of tzs) {
      setTZ(tz)
      const share = {
        type: 'plan' as const,
        details: { d: '2026-08-31', s: 600, m: 60 },
      }

      expect({
        tz,
        before: hasSharedEventEnded(share, new Date(2026, 7, 31, 9).getTime()),
        after: hasSharedEventEnded(share, new Date(2026, 7, 31, 11).getTime()),
      }).toEqual({ tz, before: false, after: true })
    }
  })
})
