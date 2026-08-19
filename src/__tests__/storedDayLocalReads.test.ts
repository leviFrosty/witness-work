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
import { getMonthsReports } from '@/lib/serviceReport'
import {
  isStoredDateOnLocalDay,
  normalizeDateForStorage,
  storedDateToLocalDate,
  storedDayKey,
} from '@/lib/normalizeDate'
import { flattenDailyMinutes } from '@/features/profile/lib/profileStats'

const originalTZ = process.env.TZ
const setTZ = (tz: string) => {
  process.env.TZ = tz
}

beforeAll(() => setTZ('Pacific/Auckland'))
afterAll(() => {
  vi.useRealTimers()
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

beforeEach(() => {
  vi.useRealTimers()
  const s = useServiceReport.getState()
  s._WARNING_forceDeleteServiceReports()
  s._WARNING_forceDeleteDayPlans()
  s._WARNING_forceDeleteRecurringPlans()
})

// Regression suite for the NZ (UTC≥+12) day-shift report: a stored noon-UTC
// anchor is already 00:00/01:00 of the *next* local day there, so any
// local-mode read of `TimeEntry.date` / `DayPlan.date` paints the entry one
// cell late on the calendar and one day late in day-keyed stats.
describe('calendar day reads at UTC>=+12', () => {
  it('a report logged for Aug 19 in NZST lands in the Aug 19 calendar cell, not Aug 20', () => {
    setTZ('Pacific/Auckland') // August = NZST, UTC+12
    useServiceReport.getState().addServiceReport({
      id: 'nz-aug-19',
      hours: 2,
      minutes: 0,
      date: moment('2026-08-19').toDate(), // what the Add Time picker hands over
    })

    const monthsReports = getMonthsReports(
      useServiceReport.getState().serviceReports,
      7,
      2026
    )
    expect(monthsReports).toHaveLength(1)

    // CalendarDay's per-cell filter, keyed by react-native-calendars'
    // `dateString`.
    expect(isStoredDateOnLocalDay(monthsReports[0].date, '2026-08-19')).toBe(
      true
    )
    expect(isStoredDateOnLocalDay(monthsReports[0].date, '2026-08-20')).toBe(
      false
    )
  })

  it('a report logged for the last day of July stays on Jul 31 and inside the July bucket', () => {
    setTZ('Pacific/Auckland')
    useServiceReport.getState().addServiceReport({
      id: 'nz-jul-31',
      hours: 1,
      minutes: 0,
      date: moment('2026-07-31').toDate(),
    })

    const state = useServiceReport.getState()
    const julyReports = getMonthsReports(state.serviceReports, 6, 2026)
    expect(julyReports).toHaveLength(1)
    expect(isStoredDateOnLocalDay(julyReports[0].date, '2026-07-31')).toBe(true)

    // Must NOT leak into August — the user's "vanishing across the month
    // boundary" symptom was the entry rendering on a local Aug 1 that the
    // August page (which reads only the August bucket) never receives.
    expect(getMonthsReports(state.serviceReports, 7, 2026)).toHaveLength(0)
    expect(isStoredDateOnLocalDay(julyReports[0].date, '2026-08-01')).toBe(
      false
    )
  })

  it('day plans match their authored local day in NZST', () => {
    setTZ('Pacific/Auckland')
    useServiceReport.getState().addDayPlan({
      id: 'nz-plan',
      date: moment('2026-08-19').toDate(),
      minutes: 240,
    })

    const { dayPlans } = useServiceReport.getState()
    expect(isStoredDateOnLocalDay(dayPlans[0].date, '2026-08-19')).toBe(true)
    expect(isStoredDateOnLocalDay(dayPlans[0].date, '2026-08-20')).toBe(false)
  })

  it('seeding the edit form does not advance the stored day (the "+2 days" report)', () => {
    setTZ('Pacific/Auckland')
    const stored = normalizeDateForStorage(moment('2026-08-19').toDate())

    // AddTimeScreen seeds its picker from the stored anchor; saving re-runs
    // normalizeDateForStorage on the picker value. The round trip must be
    // stable or every edit shifts the entry another day.
    const pickerValue = storedDateToLocalDate(stored)
    expect(moment(pickerValue).format('YYYY-MM-DD')).toBe('2026-08-19')
    expect(normalizeDateForStorage(pickerValue).toISOString()).toBe(
      stored.toISOString()
    )
  })

  it('recognizes a report logged this morning as "today" (widget publisher state)', () => {
    setTZ('Pacific/Auckland')
    // Aug 19, 10:00 NZST — a local morning that is still Aug 18 in UTC, the
    // sharpest edge for mixed-mode day comparison.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-18T22:00:00.000Z'))

    const stored = normalizeDateForStorage(new Date())
    expect(storedDayKey(stored)).toBe('2026-08-19')
    expect(isStoredDateOnLocalDay(stored, moment())).toBe(true)
  })

  it('flattenDailyMinutes keys minutes by the authored local day in NZST', () => {
    setTZ('Pacific/Auckland')
    useServiceReport.getState().addServiceReport({
      id: 'nz-streak',
      hours: 2,
      minutes: 0,
      date: moment('2026-08-19').toDate(),
    })

    const daily = flattenDailyMinutes(
      useServiceReport.getState().serviceReports
    )
    expect(daily.get('2026-08-19')).toBe(120)
    expect(daily.get('2026-08-20')).toBeUndefined()
  })

  it.each([
    ['Pacific/Auckland (NZDT, UTC+13)', 'Pacific/Auckland', '2026-01-15'],
    ['Pacific/Kiritimati (UTC+14)', 'Pacific/Kiritimati', '2026-08-19'],
    ['America/Los_Angeles (UTC-7/-8)', 'America/Los_Angeles', '2026-08-19'],
    ['UTC', 'UTC', '2026-08-19'],
  ])('predicate matches the authored day in %s', (_label, tz, day) => {
    setTZ(tz)
    const stored = normalizeDateForStorage(moment(day).toDate())
    expect(storedDayKey(stored)).toBe(day)
    expect(isStoredDateOnLocalDay(stored, day)).toBe(true)
    expect(isStoredDateOnLocalDay(stored, moment(day).add(1, 'day'))).toBe(
      false
    )
    expect(isStoredDateOnLocalDay(stored, moment(day).subtract(1, 'day'))).toBe(
      false
    )

    const pickerValue = storedDateToLocalDate(stored)
    expect(moment(pickerValue).format('YYYY-MM-DD')).toBe(day)
    expect(normalizeDateForStorage(pickerValue).toISOString()).toBe(
      stored.toISOString()
    )
  })
})
