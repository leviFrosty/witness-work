import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'
import { ServiceReport, ServiceReportsByYears } from '../types/serviceReport'
import {
  applyRollover,
  buildRolloverEntries,
  computePendingRollovers,
} from '../lib/rollover'
import { normalizeDateForStorage } from '../lib/normalizeDate'

vi.mock('../lib/logger', () => import('./mocks/logger'))

const reports = (
  year: number,
  month: number,
  entries: Partial<ServiceReport>[]
): ServiceReportsByYears => ({
  [year]: {
    [month]: entries.map((e, i) => ({
      id: e.id ?? `id-${year}-${month}-${i}`,
      hours: e.hours ?? 0,
      minutes: e.minutes ?? 0,
      date: e.date ?? new Date(year, month, 15, 12, 0, 0),
      ...e,
    })),
  },
})

const merge = (...all: ServiceReportsByYears[]): ServiceReportsByYears => {
  const out: ServiceReportsByYears = {}
  for (const part of all) {
    for (const y of Object.keys(part)) {
      out[y] = { ...(out[y] ?? {}), ...part[y] }
    }
  }
  return out
}

describe('computePendingRollovers', () => {
  it('returns one pending rollover when previous month has fractional adjusted minutes', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [
      { hours: 1, minutes: 24 }, // 84 min total → fractional 24
    ])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([{ sourceYear: 2026, sourceMonth: 2, minutes: 24 }])
  })

  it('returns no rollovers when previous month has whole-hour adjusted minutes', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [
      { hours: 2, minutes: 0 },
      { hours: 1, minutes: 60 }, // 60m → 1h, total 4h flat
    ])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([])
  })

  it('returns no rollovers when current month is already marked processed', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 24 }])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: '2026-04',
    })

    expect(result).toEqual([])
  })

  it('ignores the marker when ignoreMarker=true (used by inline UI)', () => {
    // Same fixture as the previous test — marker set for current month — but
    // with ignoreMarker on we still surface the fractional source so a UI
    // can offer a "Rollover previous month?" card after Not now / delete.
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 24 }])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: '2026-04',
      ignoreMarker: true,
    })

    expect(result).toEqual([{ sourceYear: 2026, sourceMonth: 2, minutes: 24 }])
  })

  it('rolls over for non-annual-goal publishers (e.g. auxiliary pioneer)', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 24 }])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: false,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([{ sourceYear: 2026, sourceMonth: 2, minutes: 24 }])
  })

  it('returns only the nearest prior month with fractional minutes', () => {
    // today = March 3, 2026. Both Jan and Feb have fractional minutes.
    // We should pick ONLY Feb (the nearest) and ignore Jan — rollover never
    // accumulates across months, the moved value is always < 60.
    const today = moment('2026-03-03')
    const serviceReports = merge(
      reports(2026, 0, [{ hours: 1, minutes: 24 }]),
      reports(2026, 1, [{ hours: 1, minutes: 30 }])
    )

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([{ sourceYear: 2026, sourceMonth: 1, minutes: 30 }])
  })

  it('does not look further back than the immediate previous month', () => {
    // today = April. March = whole hours, Feb = fractional. We must NOT walk
    // past March into Feb — rollover only ever considers the single most
    // recent month, otherwise an already-handled month could be re-offered.
    const today = moment('2026-04-15')
    const serviceReports = merge(
      reports(2026, 1, [{ hours: 1, minutes: 30 }]), // Feb: fractional
      reports(2026, 2, [{ hours: 2, minutes: 0 }]) // March: whole
    )

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([])
  })

  it('skips a prior service year for annual-goal publishers (Aug → Sep)', () => {
    // today = Sep 5 2026 → service year 2026 (Sep 2026 - Aug 2027)
    // Aug 2026 in SY 2025 → must be excluded for annual-goal publishers
    // because crossing into a new annual cycle would distort progress.
    const today = moment('2026-09-05')
    const serviceReports = reports(2026, 7, [{ hours: 1, minutes: 24 }])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([])
  })

  it('still crosses the SY boundary for non-annual-goal publishers (Aug → Sep)', () => {
    // Same scenario, but auxiliary pioneer (no annual goal). They track per
    // month, not per service year — fractional hours should still roll forward.
    const today = moment('2026-09-05')
    const serviceReports = reports(2026, 7, [{ hours: 1, minutes: 24 }])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: false,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([{ sourceYear: 2026, sourceMonth: 7, minutes: 24 }])
  })

  it('rolls over from a prior month within the same service year (Sep)', () => {
    // today = Oct 5 2026 → SY 2026. Sep 2026 also SY 2026 → include.
    const today = moment('2026-10-05')
    const serviceReports = reports(2026, 8, [{ hours: 1, minutes: 24 }])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([{ sourceYear: 2026, sourceMonth: 8, minutes: 24 }])
  })

  it('returns nothing when only older months (not the immediate previous) have fractional minutes', () => {
    // Reports from 13 months ago, no immediate-previous-month data → empty.
    const today = moment('2026-04-15')
    const serviceReports = reports(2025, 2, [{ hours: 1, minutes: 24 }])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: false,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([])
  })
})

describe('buildRolloverEntries', () => {
  it('produces a negative entry on each source month last day plus a combined positive entry on current month first day, with a shared rolloverGroupId', () => {
    const today = moment('2026-03-03')
    const pending = [
      { sourceYear: 2026, sourceMonth: 0, minutes: 24 },
      { sourceYear: 2026, sourceMonth: 1, minutes: 30 },
    ]
    let n = 0
    const entries = buildRolloverEntries({
      pending,
      today,
      genId: () => `id-${n++}`,
    })

    // First genId() reserved for the shared group id; subsequent calls assign
    // entry ids in order.
    expect(entries).toEqual([
      {
        id: 'id-1',
        hours: 0,
        minutes: -24,
        date: normalizeDateForStorage(new Date(2026, 0, 31)),
        rollover: true,
        rolloverGroupId: 'id-0',
      },
      {
        id: 'id-2',
        hours: 0,
        minutes: -30,
        date: normalizeDateForStorage(new Date(2026, 1, 28)),
        rollover: true,
        rolloverGroupId: 'id-0',
      },
      {
        id: 'id-3',
        hours: 0,
        minutes: 54,
        date: normalizeDateForStorage(new Date(2026, 2, 1)),
        rollover: true,
        rolloverGroupId: 'id-0',
      },
    ])
  })
})

describe('applyRollover', () => {
  it('returns entries and the marker key when rollover is pending', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 24 }])
    let n = 0

    const result = applyRollover({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
      genId: () => `id-${n++}`,
    })

    expect(result).not.toBeNull()
    expect(result?.markerKey).toBe('2026-04')
    expect(result?.entries).toHaveLength(2)
    expect(result?.entries[0].minutes).toBe(-24)
    expect(result?.entries[1].minutes).toBe(24)
  })

  it('returns null when no rollover is pending', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [{ hours: 2, minutes: 0 }])

    const result = applyRollover({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
      genId: () => 'id',
    })

    expect(result).toBeNull()
  })
})
