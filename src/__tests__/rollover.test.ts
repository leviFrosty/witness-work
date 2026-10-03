import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'
import { TimeEntry, TimeEntriesByYear } from '@/types/timeEntry'
import {
  applyRollover,
  buildRolloverEntries,
  computeExcludedCreditMinutes,
  computePendingRollovers,
  restampOverTombstones,
  rolloverIds,
} from '@/features/service-reports/lib/rollover'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const reports = (
  year: number,
  month: number,
  entries: Partial<TimeEntry>[]
): TimeEntriesByYear => ({
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

const merge = (...all: TimeEntriesByYear[]): TimeEntriesByYear => {
  const out: TimeEntriesByYear = {}
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

  it('excludes credit time by default — credit-only fraction produces no rollover', () => {
    // 5h20m of LDC credit, standard time whole. Credit isn't eligible for
    // rollover (issue #393), so nothing is pending.
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [
      { hours: 10, minutes: 0 },
      { hours: 5, minutes: 20, ldc: true } as Partial<TimeEntry>,
    ])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([])
  })

  it('rolls only the standard fraction when both standard and credit are fractional', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [
      { hours: 1, minutes: 24 },
      { hours: 0, minutes: 30, ldc: true } as Partial<TimeEntry>,
    ])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    })

    expect(result).toEqual([{ sourceYear: 2026, sourceMonth: 2, minutes: 24 }])
  })

  it('includes credit in the fraction when includeCredit is on (legacy behavior)', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [
      { hours: 1, minutes: 24 },
      { hours: 0, minutes: 30, ldc: true } as Partial<TimeEntry>,
    ])

    const result = computePendingRollovers({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
      includeCredit: true,
    })

    // (84 + 30) % 60 = 54
    expect(result).toEqual([{ sourceYear: 2026, sourceMonth: 2, minutes: 54 }])
  })
})

describe('computeExcludedCreditMinutes', () => {
  it('reports the fractional credit minutes excluded from rollover', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [
      { hours: 10, minutes: 0 },
      { hours: 5, minutes: 20, ldc: true } as Partial<TimeEntry>,
    ])

    expect(
      computeExcludedCreditMinutes({
        serviceReports,
        today,
        hasAnnualGoal: true,
      })
    ).toBe(20)
  })

  it('returns 0 when includeCredit is on', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [
      { hours: 5, minutes: 20, ldc: true } as Partial<TimeEntry>,
    ])

    expect(
      computeExcludedCreditMinutes({
        serviceReports,
        today,
        hasAnnualGoal: true,
        includeCredit: true,
      })
    ).toBe(0)
  })

  it('returns 0 when credit is whole-hour', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [
      { hours: 1, minutes: 24 },
      { hours: 5, minutes: 0, ldc: true } as Partial<TimeEntry>,
    ])

    expect(
      computeExcludedCreditMinutes({
        serviceReports,
        today,
        hasAnnualGoal: true,
      })
    ).toBe(0)
  })
})

describe('buildRolloverEntries', () => {
  it('produces a negative entry on each source month last day plus a combined positive entry on current month first day, with a shared rolloverGroupId', () => {
    const today = moment('2026-03-03')
    const pending = [
      { sourceYear: 2026, sourceMonth: 0, minutes: 24 },
      { sourceYear: 2026, sourceMonth: 1, minutes: 30 },
    ]
    const entries = buildRolloverEntries({
      pending,
      today,
      serviceReports: {},
    })

    const group = 'rollover-2026-01_2026-02-to-2026-03'
    expect(entries).toEqual([
      {
        id: `${group}-src-2026-01`,
        hours: 0,
        minutes: -24,
        date: new Date(2026, 0, 31, 12),
        rollover: true,
        rolloverGroupId: group,
      },
      {
        id: `${group}-src-2026-02`,
        hours: 0,
        minutes: -30,
        date: new Date(2026, 1, 28, 12),
        rollover: true,
        rolloverGroupId: group,
      },
      {
        id: `${group}-dst`,
        hours: 0,
        minutes: 54,
        date: new Date(2026, 2, 1, 12),
        rollover: true,
        rolloverGroupId: group,
      },
    ])
  })
})

describe('rolloverIds', () => {
  const pending = [{ sourceYear: 2026, sourceMonth: 8, minutes: 30 }]
  const today = moment('2026-10-01T09:00:00')
  const base = 'rollover-2026-09-to-2026-10'
  const liveEntry = (id: string, rolloverGroupId?: string): TimeEntry => ({
    id,
    hours: 0,
    minutes: 30,
    date: new Date(2026, 8, 30, 12),
    rollover: true,
    rolloverGroupId,
  })

  it('derives the ids from the source and destination months', () => {
    expect(rolloverIds({ pending, today, serviceReports: {} })).toEqual({
      groupId: base,
      sourceIds: [`${base}-src`],
      destinationId: `${base}-dst`,
    })
  })

  it('ignores live entries that use other ids', () => {
    const serviceReports = reports(2026, 8, [{ id: 'sep-entry' }])
    expect(rolloverIds({ pending, today, serviceReports }).groupId).toBe(base)
  })

  it('adds an ordinal only while a live entry uses one of the ids', () => {
    const first = merge(
      reports(2026, 8, [liveEntry(`${base}-src`, base)]),
      reports(2026, 9, [liveEntry(`${base}-dst`, base)])
    )
    expect(rolloverIds({ pending, today, serviceReports: first })).toEqual({
      groupId: `${base}-2`,
      sourceIds: [`${base}-2-src`],
      destinationId: `${base}-2-dst`,
    })

    const second = merge(
      first,
      reports(2026, 7, [liveEntry(`${base}-2-dst`, `${base}-2`)])
    )
    expect(
      rolloverIds({ pending, today, serviceReports: second }).groupId
    ).toBe(`${base}-3`)
  })

  it('treats a live group id as taken, so deleting one pair spares the other', () => {
    const serviceReports = reports(2026, 8, [liveEntry('legacy-id', base)])
    expect(rolloverIds({ pending, today, serviceReports }).groupId).toBe(
      `${base}-2`
    )
  })
})

describe('restampOverTombstones', () => {
  const entry = (id: string, updatedAt: number): TimeEntry => ({
    id,
    hours: 0,
    minutes: 30,
    date: new Date(2026, 8, 30, 12),
    updatedAt,
  })

  it('stamps a reused id strictly newer than its tombstone', () => {
    const serviceReports = reports(2026, 8, [
      entry('reused', 1_000),
      entry('other', 1_000),
    ])

    // From a device whose clock runs ahead of this one.
    const deletedAt = Date.now() + 60_000
    const result = restampOverTombstones({
      serviceReports,
      ids: ['reused', 'other'],
      tombstones: [{ id: 'reused', deletedAt }],
    })

    expect(result.changed).toBe(true)
    const [reused, other] = result.serviceReports[2026][8]
    expect(reused.updatedAt).toBeGreaterThan(deletedAt)
    expect(other).toBe(serviceReports[2026][8][1])
  })

  it('leaves entries already newer than the tombstone, and other ids, alone', () => {
    const serviceReports = reports(2026, 8, [entry('fresh', 2_000)])

    for (const tombstones of [
      [{ id: 'fresh', deletedAt: 1_999 }],
      [{ id: 'unrelated', deletedAt: 9_999 }],
    ]) {
      const result = restampOverTombstones({
        serviceReports,
        ids: ['fresh'],
        tombstones,
      })
      expect(result.changed).toBe(false)
      expect(result.serviceReports).toBe(serviceReports)
    }
  })
})

describe('applyRollover', () => {
  it('returns entries and the marker key when rollover is pending', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 24 }])

    const result = applyRollover({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    })

    expect(result).not.toBeNull()
    expect(result?.markerKey).toBe('2026-04')
    expect(result?.entries).toHaveLength(2)
    expect(result?.entries[0].minutes).toBe(-24)
    expect(result?.entries[1].minutes).toBe(24)
    expect(result?.entries.map((e) => e.id)).toEqual([
      'rollover-2026-03-to-2026-04-src',
      'rollover-2026-03-to-2026-04-dst',
    ])
  })

  it('produces identical entries on two devices with the same data', () => {
    const input = {
      serviceReports: reports(2026, 2, [{ hours: 1, minutes: 24 }]),
      today: moment('2026-04-01T08:00:00'),
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    }

    const phone = applyRollover(input)
    const tablet = applyRollover({
      ...input,
      today: moment('2026-04-01T21:30:00'),
    })

    expect(phone?.entries).toHaveLength(2)
    expect(tablet?.entries).toEqual(phone?.entries)
  })

  it('returns null when no rollover is pending', () => {
    const today = moment('2026-04-15')
    const serviceReports = reports(2026, 2, [{ hours: 2, minutes: 0 }])

    const result = applyRollover({
      serviceReports,
      today,
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
    })

    expect(result).toBeNull()
  })
})
