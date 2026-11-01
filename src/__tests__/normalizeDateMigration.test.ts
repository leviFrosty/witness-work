import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import moment from 'moment'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import {
  PersistedServiceReportState,
  migrateNormalizeDates,
  momentStoredDate,
} from '@/lib/normalizeDate'
import { RecurringPlan, RecurringPlanFrequencies } from '@/lib/serviceReport'
import { DayPlan, TimeEntry } from '@/types/timeEntry'

const originalTZ = process.env.TZ
const setTZ = (tz: string) => {
  process.env.TZ = tz
}

beforeAll(() => setTZ('America/Los_Angeles'))
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

const emptyState = (): PersistedServiceReportState => ({
  serviceReports: {},
  dayPlans: [],
  recurringPlans: [],
})

describe('migrateNormalizeDates — service reports', () => {
  it('normalizes a service report date in place to noon UTC', () => {
    const report: TimeEntry = {
      id: 'r1',
      hours: 1,
      minutes: 0,

      date: moment('2026-05-15').toDate(),
    }

    const state: PersistedServiceReportState = {
      ...emptyState(),
      serviceReports: { 2026: { 4: [report] } },
    }

    const migrated = migrateNormalizeDates(state)

    const migratedReport = migrated.serviceReports[2026][4][0]
    const m = momentStoredDate(migratedReport.date)
    expect({ y: m.year(), mo: m.month(), d: m.date() }).toEqual({
      y: 2026,
      mo: 4,
      d: 15,
    })

    expect(migratedReport.date.getUTCHours()).toBe(12)
  })

  it('rebuckets reports whose stored bucket no longer matches their normalized date', () => {
    setTZ('America/Los_Angeles')
    const reportAuthoredInJST: TimeEntry = {
      id: 'orphan-1',
      hours: 1,
      minutes: 0,

      date: new Date('2026-04-30T15:00:00.000Z'),
    }
    const state: PersistedServiceReportState = {
      ...emptyState(),

      serviceReports: { 2026: { 4: [reportAuthoredInJST] } },
    }

    const migrated = migrateNormalizeDates(state)

    expect(migrated.serviceReports[2026]?.[4]).toBeUndefined()
    expect(migrated.serviceReports[2026][3]).toHaveLength(1)
    expect(migrated.serviceReports[2026][3][0].id).toBe('orphan-1')
  })

  it('merges into an existing bucket when re-bucketing', () => {
    setTZ('America/Los_Angeles')
    const existing: TimeEntry = {
      id: 'existing',
      hours: 2,
      minutes: 0,
      date: moment('2026-04-30').toDate(),
    }

    const orphan: TimeEntry = {
      id: 'orphan',
      hours: 1,
      minutes: 0,
      date: new Date('2026-04-30T15:00:00.000Z'),
    }
    const state: PersistedServiceReportState = {
      ...emptyState(),
      serviceReports: { 2026: { 3: [existing], 4: [orphan] } },
    }

    const migrated = migrateNormalizeDates(state)

    expect(migrated.serviceReports[2026][3]).toHaveLength(2)
    expect(migrated.serviceReports[2026][3].map((r) => r.id).sort()).toEqual([
      'existing',
      'orphan',
    ])
  })
})

describe('migrateNormalizeDates — day plans', () => {
  it('normalizes every DayPlan date', () => {
    const plans: DayPlan[] = [
      { id: 'd1', date: moment('2026-05-15').toDate(), minutes: 60 },
      { id: 'd2', date: new Date('2026-04-30T15:00:00.000Z'), minutes: 30 },
    ]
    const migrated = migrateNormalizeDates({ ...emptyState(), dayPlans: plans })

    expect(migrated.dayPlans).toHaveLength(2)
    for (const p of migrated.dayPlans) {
      expect(p.date.getUTCHours()).toBe(12)
    }
    expect(
      momentStoredDate(migrated.dayPlans[0].date).format('YYYY-MM-DD')
    ).toBe('2026-05-15')

    expect(
      momentStoredDate(migrated.dayPlans[1].date).format('YYYY-MM-DD')
    ).toBe('2026-04-30')
  })
})

describe('migrateNormalizeDates — recurring plans', () => {
  it('normalizes startDate, recurrence.endDate, deletedDates and overrides', () => {
    const plan: RecurringPlan = {
      id: 'rp1',
      startDate: moment('2026-05-01').toDate(),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: moment('2026-12-01').toDate(),
      },
      deletedDates: [
        moment('2026-05-15').toDate(),
        moment('2026-05-22').toDate(),
      ],
      overrides: [
        {
          date: moment('2026-05-08').toDate(),
          minutes: 90,
          note: 'extended',
        },
      ],
    }

    const migrated = migrateNormalizeDates({
      ...emptyState(),
      recurringPlans: [plan],
    })

    const out = migrated.recurringPlans[0]

    expect(out.startDate.getUTCHours()).toBe(12)
    expect(momentStoredDate(out.startDate).format('YYYY-MM-DD')).toBe(
      '2026-05-01'
    )

    expect(out.recurrence.endDate?.getUTCHours()).toBe(12)
    expect(
      momentStoredDate(out.recurrence.endDate as Date).format('YYYY-MM-DD')
    ).toBe('2026-12-01')

    expect(out.deletedDates?.map((d) => d.getUTCHours())).toEqual([12, 12])
    expect(
      out.deletedDates?.map((d) => momentStoredDate(d).format('YYYY-MM-DD'))
    ).toEqual(['2026-05-15', '2026-05-22'])

    expect(out.overrides?.[0].date.getUTCHours()).toBe(12)
    expect(momentStoredDate(out.overrides![0].date).format('YYYY-MM-DD')).toBe(
      '2026-05-08'
    )

    expect(out.overrides?.[0].minutes).toBe(90)
    expect(out.overrides?.[0].note).toBe('extended')
  })

  it('handles a recurring plan with no endDate, no overrides, no deletedDates', () => {
    const plan: RecurringPlan = {
      id: 'rp2',
      startDate: moment('2026-05-01').toDate(),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    }
    const migrated = migrateNormalizeDates({
      ...emptyState(),
      recurringPlans: [plan],
    })

    const out = migrated.recurringPlans[0]
    expect(out.recurrence.endDate).toBeNull()
    expect(out.deletedDates).toBeUndefined()
    expect(out.overrides).toBeUndefined()
  })
})

describe('migrateNormalizeDates — idempotency on full state', () => {
  it('running the migration twice yields the same result', () => {
    setTZ('America/Los_Angeles')
    const original: PersistedServiceReportState = {
      serviceReports: {
        2026: {
          4: [
            {
              id: 'r1',
              hours: 1,
              minutes: 30,
              date: moment('2026-05-15').toDate(),
            },
          ],
        },
      },
      dayPlans: [
        { id: 'd1', date: moment('2026-05-15').toDate(), minutes: 60 },
      ],
      recurringPlans: [
        {
          id: 'rp1',
          startDate: moment('2026-05-01').toDate(),
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: moment('2026-12-01').toDate(),
          },
          deletedDates: [moment('2026-05-15').toDate()],
          overrides: [{ date: moment('2026-05-08').toDate(), minutes: 90 }],
        },
      ],
    }

    const once = migrateNormalizeDates(original)
    const twice = migrateNormalizeDates(once)

    expect(JSON.stringify(twice)).toEqual(JSON.stringify(once))
  })
})
