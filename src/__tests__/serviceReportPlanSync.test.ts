import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import moment from 'moment'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useServiceReport from '@/stores/serviceReport'
import { MmkvStorage } from '@/stores/mmkv'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'
import { deletePlan } from '@/lib/confirmDeletePlan'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

// What iCloud sync needs from the store's Plan actions: every removal leaves a
// tombstone (or another device's copy brings the Plan back), and every edit
// stamps `updatedAt` (or last-writer-wins keeps each device's own copy).

const T0 = Date.parse('2026-09-01T12:00:00Z')

const dayPlan = (id: string): DayPlan => ({
  id,
  date: moment('2026-10-05').toDate(),
  minutes: 60,
})

const recurringPlan = (id: string, start = '2026-10-05'): RecurringPlan => ({
  id,
  startDate: moment(start).toDate(),
  minutes: 90,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
})

const store = () => useServiceReport.getState()
const at = (ms: number) => vi.setSystemTime(T0 + ms)

beforeEach(() => {
  vi.useFakeTimers()
  at(0)
  useServiceReport.setState({
    dayPlans: [],
    recurringPlans: [],
    deletedDayPlans: [],
    deletedRecurringPlans: [],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Plan tombstones', () => {
  it('deleting a Day Plan tombstones it', () => {
    store().addDayPlan(dayPlan('d1'))
    at(1_000)
    store().deleteDayPlan('d1')

    expect(store().dayPlans).toEqual([])
    expect(store().deletedDayPlans).toEqual([
      { id: 'd1', deletedAt: T0 + 1_000 },
    ])
  })

  it('deleting a Recurring Plan tombstones it', () => {
    store().addRecurringPlan(recurringPlan('r1'))
    at(1_000)
    store().deleteRecurringPlan('r1')

    expect(store().recurringPlans).toEqual([])
    expect(store().deletedRecurringPlans).toEqual([
      { id: 'r1', deletedAt: T0 + 1_000 },
    ])
  })

  it('writes nothing for a Plan that is already gone', () => {
    store().deleteDayPlan('missing')
    store().deleteRecurringPlan('missing')

    expect(store().deletedDayPlans).toEqual([])
    expect(store().deletedRecurringPlans).toEqual([])
  })

  it('keeps one tombstone per id, the newest', () => {
    store().addDayPlan(dayPlan('d1'))
    store().deleteDayPlan('d1')
    at(1_000)
    store().addDayPlan(dayPlan('d1'))
    at(2_000)
    store().deleteDayPlan('d1')

    expect(store().deletedDayPlans).toEqual([
      { id: 'd1', deletedAt: T0 + 2_000 },
    ])
  })

  it('re-adding a removed id clears its tombstone', () => {
    store().addDayPlan(dayPlan('d1'))
    store().deleteDayPlan('d1')
    store().addRecurringPlan(recurringPlan('r1'))
    store().deleteRecurringPlan('r1')

    store().addDayPlan(dayPlan('d1'))
    store().addRecurringPlan(recurringPlan('r1'))

    expect(store().deletedDayPlans).toEqual([])
    expect(store().deletedRecurringPlans).toEqual([])
  })

  it('updating a Plan clears a tombstone a merge left beside it', () => {
    // A merge keeps a tombstone older than the Plan edit that outlived it.
    useServiceReport.setState({
      dayPlans: [{ ...dayPlan('d1'), updatedAt: T0 }],
      recurringPlans: [{ ...recurringPlan('r1'), updatedAt: T0 }],
      deletedDayPlans: [{ id: 'd1', deletedAt: T0 - 1 }],
      deletedRecurringPlans: [{ id: 'r1', deletedAt: T0 - 1 }],
    })

    store().updateDayPlan({ id: 'd1', minutes: 30 })
    store().updateRecurringPlan({ id: 'r1', minutes: 30 })

    expect(store().deletedDayPlans).toEqual([])
    expect(store().deletedRecurringPlans).toEqual([])
  })

  it('updating a Plan removed meanwhile keeps its tombstone', () => {
    store().addDayPlan(dayPlan('d1'))
    store().deleteDayPlan('d1')
    store().addRecurringPlan(recurringPlan('r1'))
    store().deleteRecurringPlan('r1')

    // e.g. saving an edit screen after a pull removed the Plan
    store().updateDayPlan({ id: 'd1', minutes: 30 })
    store().updateRecurringPlan({ id: 'r1', minutes: 30 })

    expect(store().dayPlans).toEqual([])
    expect(store().deletedDayPlans.map((t) => t.id)).toEqual(['d1'])
    expect(store().deletedRecurringPlans.map((t) => t.id)).toEqual(['r1'])
  })

  it('every delete scope either tombstones the Plan or stamps it', () => {
    const date = moment('2026-10-12').toDate()
    store().addDayPlan(dayPlan('d1'))
    store().addRecurringPlan(recurringPlan('r1'))
    store().addRecurringPlan(recurringPlan('r2'))
    store().addRecurringPlan(recurringPlan('r3'))
    at(1_000)

    deletePlan({ kind: 'day', planId: 'd1' })
    deletePlan({ kind: 'recurring', planId: 'r1', date }, 'instance')
    deletePlan({ kind: 'recurring', planId: 'r2', date }, 'future')
    deletePlan({ kind: 'recurring', planId: 'r3', date }, 'all')

    expect(store().deletedDayPlans.map((t) => t.id)).toEqual(['d1'])
    expect(store().deletedRecurringPlans.map((t) => t.id)).toEqual(['r3'])
    // Occurrence deletes keep the Plan, stamped so the edit wins the merge.
    expect(store().recurringPlans.map((p) => [p.id, p.updatedAt])).toEqual([
      ['r1', T0 + 1_000],
      ['r2', T0 + 1_000],
    ])
  })

  it('starts existing installs with no tombstones', async () => {
    vi.spyOn(MmkvStorage, 'getItem').mockReturnValueOnce(
      JSON.stringify({
        state: {
          serviceReports: {},
          dayPlans: [{ ...dayPlan('d1'), updatedAt: T0 }],
          recurringPlans: [],
          deletedServiceReports: [],
        },
        version: 4,
      })
    )
    useServiceReport.setState(useServiceReport.getInitialState(), true)

    await useServiceReport.persist.rehydrate()

    expect(store().dayPlans.map((p) => p.id)).toEqual(['d1'])
    expect(store().deletedDayPlans).toEqual([])
    expect(store().deletedRecurringPlans).toEqual([])
  })
})

describe('Recurring Plan edits stamp updatedAt', () => {
  const date = moment('2026-10-12').toDate()

  // Each edit at T0 + 1s on a Plan last stamped at T0.
  const edits: [string, () => void][] = [
    [
      'addRecurringPlanOverride',
      () => store().addRecurringPlanOverride('r1', { date, minutes: 30 }),
    ],
    [
      'updateRecurringPlanOverride',
      () => store().updateRecurringPlanOverride('r1', { date, minutes: 45 }),
    ],
    [
      'removeRecurringPlanOverride',
      () => store().removeRecurringPlanOverride('r1', date),
    ],
    [
      'restoreRecurringPlanInstance',
      () => store().restoreRecurringPlanInstance('r1', date),
    ],
    [
      'deleteSingleEventFromRecurringPlan',
      () => store().deleteSingleEventFromRecurringPlan('r1', date),
    ],
    [
      'deleteEventAndFutureEvents',
      () => store().deleteEventAndFutureEvents('r1', date),
    ],
  ]

  it.each(edits)('%s', (_name, edit) => {
    store().addRecurringPlan(recurringPlan('r1'))
    store().addRecurringPlan(recurringPlan('r2', '2026-11-02'))
    store().addRecurringPlanOverride('r1', { date, minutes: 30 })
    store().deleteSingleEventFromRecurringPlan('r1', date)
    useServiceReport.setState({
      recurringPlans: store().recurringPlans.map((p) => ({
        ...p,
        updatedAt: T0,
      })),
    })
    at(1_000)

    edit()

    const [r1, r2] = store().recurringPlans
    expect(r1.updatedAt).toBe(T0 + 1_000)
    // Only the edited Plan.
    expect(r2.updatedAt).toBe(T0)
  })
})
