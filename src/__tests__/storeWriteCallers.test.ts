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
import { storedDayKey } from '@/lib/normalizeDate'
import {
  generateRecommendation,
  proposedPlanLocalDay,
} from '@/lib/assistantRecommendation'
import { buildRolloverEntries } from '@/features/service-reports/lib/rollover'

// Store write actions take a _local_ day and anchor it at noon UTC themselves.
// These feed each non-form caller's real output through the real store, in the
// zones where handing over an already-anchored date shifts it a day.
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
  const s = useServiceReport.getState()
  s._WARNING_forceDeleteServiceReports()
  s._WARNING_forceDeleteDayPlans()
})

describe('rollover entries', () => {
  it('keep the month-end negative in the source month', () => {
    for (const tz of tzs) {
      setTZ(tz)
      useServiceReport.getState()._WARNING_forceDeleteServiceReports()
      let n = 0
      buildRolloverEntries({
        pending: [{ sourceYear: 2026, sourceMonth: 7, minutes: 30 }],
        today: moment('2026-09-03'),
        genId: () => `id-${n++}`,
      }).forEach((e) => useServiceReport.getState().addServiceReport(e))

      const byMonth = useServiceReport.getState().serviceReports[2026]
      expect({
        tz,
        aug: byMonth[7]?.map((r) => `${storedDayKey(r.date)} ${r.minutes}`),
        sep: byMonth[8]?.map((r) => `${storedDayKey(r.date)} ${r.minutes}`),
      }).toEqual({ tz, aug: ['2026-08-31 -30'], sep: ['2026-09-01 30'] })
    }
  })
})

describe('assistant recommendations', () => {
  it('add each proposed plan on the day the engine proposed', () => {
    for (const tz of tzs) {
      setTZ(tz)
      for (const today of [
        new Date(2026, 8, 20, 9), // mid-month: cursor starts at today's anchor
        new Date(2026, 7, 28, 9), // next month: cursor starts at UTC midnight
      ]) {
        const rec = generateRecommendation({
          year: 2026,
          month: 8,
          today,
          monthlyGoalHours: 50,
          standardGapMinutes: 10 * 60,
          dayPlans: [],
          recurringPlans: [],
          conversations: [],
          offDays: [],
          meetingDays: [],
          assistantHistory: [],
        })
        expect(rec?.plans.length).toBeGreaterThan(0)
        for (const p of rec!.plans) {
          useServiceReport.getState()._WARNING_forceDeleteDayPlans()
          useServiceReport.getState().addDayPlan({
            id: 'a',
            date: proposedPlanLocalDay(p),
            minutes: p.minutes,
          })
          const proposed = moment.utc(p.date).format('YYYY-MM-DD')
          const stored = storedDayKey(
            useServiceReport.getState().dayPlans[0].date
          )
          expect({ tz, stored }).toEqual({ tz, stored: proposed })
          expect({
            tz,
            preview: moment(proposedPlanLocalDay(p)).format('YYYY-MM-DD'),
          }).toEqual({ tz, preview: proposed })
        }
      }
    }
  })
})
