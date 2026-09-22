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

import useServiceReport, {
  migrateServiceReportPersistedState,
} from '@/stores/serviceReport'
import {
  migrateNormalizeDates,
  normalizeDateForStorage,
  preserveOrNormalizeStoredDate,
  storedDayKey,
  type PersistedServiceReportState,
} from '@/lib/normalizeDate'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'
import { getPeriodTense } from '@/lib/projectedTotalCopy'
import { mapNotesImport } from '@/features/notes-import/lib/mapNotesImport'

// Regressions for stored calendar days drifting at UTC+12 and beyond, where
// noon UTC is already the next local day and local midnight is noon UTC of the
// prior day.
const originalTZ = process.env.TZ
const setTZ = (tz: string) => {
  process.env.TZ = tz
}
const tzs = [
  'Pacific/Auckland',
  'Pacific/Kiritimati',
  'UTC',
  'America/Los_Angeles',
  'Etc/GMT+12',
]

afterEach(() => setTZ('America/Los_Angeles'))
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

beforeEach(() => {
  useServiceReport.getState()._WARNING_forceDeleteServiceReports()
})

const anchor = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d, 12))

/** Persisted/synced state is JSON with no reviver: every Date is a string. */
const asJson = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const storedState = (): PersistedServiceReportState => ({
  serviceReports: {
    2026: {
      7: [{ id: 'r', hours: 1, minutes: 0, date: anchor(2026, 7, 31) }],
    },
  },
  dayPlans: [{ id: 'p', minutes: 60, date: anchor(2026, 8, 25) }],
  recurringPlans: [
    {
      id: 'rp',
      minutes: 60,
      startDate: anchor(2026, 8, 1),
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: anchor(2026, 9, 27),
      },
      deletedDates: [anchor(2026, 8, 15)],
      overrides: [{ date: anchor(2026, 8, 8), minutes: 30 }],
    },
  ],
})

const dayKeys = (s: PersistedServiceReportState) => ({
  buckets: Object.entries(s.serviceReports).flatMap(([y, months]) =>
    Object.entries(months).map(
      ([m, rs]) => `${y}-${m}: ${rs.map((r) => storedDayKey(r.date))}`
    )
  ),
  plan: storedDayKey(s.dayPlans[0].date),
  start: storedDayKey(s.recurringPlans[0].startDate),
  end: storedDayKey(s.recurringPlans[0].recurrence.endDate!),
  deleted: s.recurringPlans[0].deletedDates!.map(storedDayKey),
  override: s.recurringPlans[0].overrides!.map((o) => storedDayKey(o.date)),
})

const expectedKeys = {
  buckets: ['2026-7: 2026-08-31'],
  plan: '2026-09-25',
  start: '2026-09-01',
  end: '2026-10-27',
  deleted: ['2026-09-15'],
  override: ['2026-09-08'],
}

describe('iCloud merge / restore normalization', () => {
  it('preserves a stored anchor that arrives as an ISO string', () => {
    for (const tz of tzs) {
      setTZ(tz)
      expect({
        tz,
        day: storedDayKey(
          preserveOrNormalizeStoredDate('2026-08-31T12:00:00.000Z')
        ),
      }).toEqual({ tz, day: '2026-08-31' })
    }
  })

  it('keeps every stored day and month bucket across repeated syncs of rehydrated state', () => {
    for (const tz of tzs) {
      setTZ(tz)
      let state = storedState()
      for (let i = 0; i < 3; i++) state = migrateNormalizeDates(asJson(state))
      expect({ tz, ...dayKeys(state) }).toEqual({ tz, ...expectedKeys })
    }
  })

  it('still reads pre-v2 persisted dates as the local day they were authored on', () => {
    setTZ('Pacific/Auckland')
    // Pre-normalization data stored raw local midnights — at NZST that's
    // noon UTC of the prior day, which must not be taken for an anchor.
    const legacy = asJson({
      serviceReports: {
        2026: {
          7: [
            {
              id: 'r',
              hours: 1,
              minutes: 0,
              date: moment('2026-08-19').toDate(),
            },
          ],
        },
      },
      dayPlans: [{ id: 'p', minutes: 60, date: moment('2026-08-20').toDate() }],
      recurringPlans: [],
    })
    const migrated = migrateServiceReportPersistedState(legacy, 1)
    expect(storedDayKey(migrated.serviceReports[2026][7][0].date)).toBe(
      '2026-08-19'
    )
    expect(storedDayKey(migrated.dayPlans[0].date)).toBe('2026-08-20')
  })
})

describe('Notes import', () => {
  it('stores a date-only time entry on its day and in its month', () => {
    for (const tz of tzs) {
      setTZ(tz)
      useServiceReport.getState()._WARNING_forceDeleteServiceReports()
      const mapped = mapNotesImport(
        {
          contacts: [],
          visits: [],
          timeEntries: [{ date: '2026-08-31', hours: 1, minutes: 0 }],
          categories: [],
          publisher: null,
          warnings: [],
          summary: '',
          assistantMessage: '',
        },
        { contentHash: 'h', importedAt: new Date() }
      )
      mapped.timeEntries.forEach((e) =>
        useServiceReport.getState().addServiceReport(e)
      )
      const aug = useServiceReport.getState().serviceReports[2026]?.[7] ?? []
      expect({ tz, aug: aug.map((r) => storedDayKey(r.date)) }).toEqual({
        tz,
        aug: ['2026-08-31'],
      })
      expect({
        tz,
        preview: moment(mapped.timeEntries[0].date).format('YYYY-MM-DD'),
      }).toEqual({ tz, preview: '2026-08-31' })
    }
  })
})

describe('getPeriodTense', () => {
  it("uses today's local day, not its UTC day", () => {
    setTZ('Pacific/Auckland')
    const morningOfSep1 = new Date(2026, 8, 1, 9)
    expect(
      getPeriodTense({ kind: 'month', year: 2026, month: 8 }, morningOfSep1)
    ).toBe('present')
    expect(
      getPeriodTense({ kind: 'month', year: 2026, month: 7 }, morningOfSep1)
    ).toBe('past')

    setTZ('America/Los_Angeles')
    const eveningOfAug31 = new Date(2026, 7, 31, 21)
    expect(
      getPeriodTense({ kind: 'month', year: 2026, month: 7 }, eveningOfAug31)
    ).toBe('present')
    expect(normalizeDateForStorage(eveningOfAug31).getUTCDate()).toBe(31)
  })
})
