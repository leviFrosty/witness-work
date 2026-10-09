import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import moment from 'moment'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import { migrateServiceReportPersistedState } from '@/stores/serviceReport'
import { momentStoredDate } from '@/lib/normalizeDate'
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

describe('persist migrate v1 → v2', () => {
  it('normalizes every Date when called from version 1', () => {
    const v1State = {
      serviceReports: {
        2026: {
          4: [
            {
              id: 'r1',
              hours: 1,
              minutes: 0,
              // Pre-fix midnight-local date (PST): 2026-05-15T07:00:00Z.
              date: moment('2026-05-15').toDate(),
            } as TimeEntry,
          ],
        },
      },
      dayPlans: [
        {
          id: 'd1',
          date: moment('2026-05-15').toDate(),
          minutes: 60,
        } as DayPlan,
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
        } as RecurringPlan,
      ],
    }

    const migrated = migrateServiceReportPersistedState(v1State, 1)

    const report = migrated.serviceReports[2026][4][0]
    expect(report.date.getUTCHours()).toBe(12)
    expect(momentStoredDate(report.date).format('YYYY-MM-DD')).toBe(
      '2026-05-15'
    )

    expect(migrated.dayPlans[0].date.getUTCHours()).toBe(12)
    expect(migrated.recurringPlans[0].startDate.getUTCHours()).toBe(12)
    expect(migrated.recurringPlans[0].recurrence.endDate?.getUTCHours()).toBe(
      12
    )
    expect(migrated.recurringPlans[0].deletedDates?.[0].getUTCHours()).toBe(12)
    expect(migrated.recurringPlans[0].overrides?.[0].date.getUTCHours()).toBe(
      12
    )
  })

  it('also runs the v0 → v1 path before normalizing when called from version 0', () => {
    // v0 stored serviceReports as a flat TimeEntry[]; v1 reshaped that into
    // TimeEntriesByYear via `migrateServiceReports`. v2 then normalizes.
    // A migration starting at v0 should chain both: rebucket THEN normalize.
    const v0State = {
      serviceReports: [
        {
          id: 'legacy-1',
          hours: 1,
          minutes: 0,
          date: moment('2026-05-15').toDate(),
        },
      ],
      dayPlans: [],
      recurringPlans: [],
    }

    const migrated = migrateServiceReportPersistedState(v0State, 0)

    expect(migrated.serviceReports[2026][4]).toHaveLength(1)
    expect(migrated.serviceReports[2026][4][0].id).toBe('legacy-1')
    expect(migrated.serviceReports[2026][4][0].date.getUTCHours()).toBe(12)
  })

  it('is a no-op on a v2 state (idempotent re-migration)', () => {
    // Once a state has been normalized and stored as v2, re-running migrate
    // (e.g. after a downgrade-then-upgrade) must not drift.
    const v1Source = {
      serviceReports: {
        2026: {
          4: [
            {
              id: 'r1',
              hours: 1,
              minutes: 0,
              date: moment('2026-05-15').toDate(),
            } as TimeEntry,
          ],
        },
      },
      dayPlans: [],
      recurringPlans: [],
    }
    const v2State = migrateServiceReportPersistedState(v1Source, 1)
    const v2Again = migrateServiceReportPersistedState(v2State, 2)

    expect(JSON.stringify(v2Again)).toEqual(JSON.stringify(v2State))
  })
})

describe('persist migrate v4 → v5', () => {
  // Plans used to resolve with a Day Plan hiding every recurring instance on
  // its date. Plans now add up, so the migration skips those instances to keep
  // every forecast as it was. Persisted Dates arrive as JSON strings.
  const persisted = (state: object) => JSON.parse(JSON.stringify(state))
  const at = (day: string) => new Date(`${day}T12:00:00.000Z`)
  const weekly = (id: string, start: string, extra?: Partial<RecurringPlan>) =>
    ({
      id,
      startDate: at(start),
      minutes: 120,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
      updatedAt: 1,
      ...extra,
    }) as RecurringPlan

  const run = () => {
    const migrated = migrateServiceReportPersistedState(
      persisted({
        serviceReports: {},
        dayPlans: [
          { id: 'cart', date: at('2026-10-09'), minutes: 60 },
          { id: 'day-off', date: at('2026-10-16'), minutes: 0 },
          { id: 'thursday', date: at('2026-10-15'), minutes: 60 },
        ],
        recurringPlans: [
          weekly('morning', '2026-10-02'),
          weekly('study', '2026-10-02', {
            deletedDates: [at('2026-10-09')],
          }),
          weekly('monday', '2026-10-05'),
        ],
      }),
      4
    )
    const byId = (id: string) =>
      migrated.recurringPlans.find((plan: RecurringPlan) => plan.id === id)
    return { migrated, byId }
  }

  it('skips each recurring instance a Day Plan hid', () => {
    const { byId } = run()
    expect(
      byId('morning').deletedDates.map((date: Date) =>
        momentStoredDate(date).format('YYYY-MM-DD')
      )
    ).toEqual(['2026-10-09', '2026-10-16'])
    expect(byId('morning').updatedAt).toBeGreaterThan(1)
  })

  it("doesn't skip an instance twice or touch Plans no Day Plan hid", () => {
    const { byId } = run()
    expect(
      byId('study').deletedDates.map((date: Date | string) =>
        momentStoredDate(date).format('YYYY-MM-DD')
      )
    ).toEqual(['2026-10-09', '2026-10-16'])
    expect(byId('monday').deletedDates).toBeUndefined()
    expect(byId('monday').updatedAt).toBe(1)
  })

  it('reads stored days the same far east of UTC', () => {
    setTZ('Pacific/Kiritimati')
    try {
      const { byId } = run()
      expect(
        byId('morning').deletedDates.map((date: Date) =>
          momentStoredDate(date).format('YYYY-MM-DD')
        )
      ).toEqual(['2026-10-09', '2026-10-16'])
    } finally {
      setTZ('America/Los_Angeles')
    }
  })

  it('leaves a v5 state alone', () => {
    const state = persisted({
      serviceReports: {},
      dayPlans: [{ id: 'cart', date: at('2026-10-09'), minutes: 60 }],
      recurringPlans: [weekly('morning', '2026-10-02')],
    })
    expect(migrateServiceReportPersistedState(state, 5)).toEqual(state)
  })
})
