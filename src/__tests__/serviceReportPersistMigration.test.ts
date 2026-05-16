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
