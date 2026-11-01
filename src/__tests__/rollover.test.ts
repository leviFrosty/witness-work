import moment from 'moment'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { TimeEntry, TimeEntriesByYear } from '@/types/timeEntry'
import type { Publisher } from '@/types/publisher'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import {
  applyRollover,
  buildRolloverEntries,
  computeExcludedCreditMinutes,
  computePendingRollovers,
  rolloverIds,
  rolloverRole,
  rolloverSourceMonth,
} from '@/features/service-reports/lib/rollover'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  getTotalMinutesForServiceYear,
} from '@/lib/serviceReport'
import {
  publisherCapabilitiesForMonth,
  type RolePreferences,
} from '@/lib/roleHistory'

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
    const serviceReports = reports(2026, 2, [{ hours: 1, minutes: 24 }])

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
      { hours: 1, minutes: 60 },
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
    const today = moment('2026-04-15')
    const serviceReports = merge(
      reports(2026, 1, [{ hours: 1, minutes: 30 }]),
      reports(2026, 2, [{ hours: 2, minutes: 0 }])
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

    expect(result).toEqual([{ sourceYear: 2026, sourceMonth: 2, minutes: 54 }])
  })
})

describe('rollover at the credit cap', () => {
  const capped = reports(2026, 2, [
    { hours: 54, minutes: 30 },
    { hours: 1, minutes: 0, ldc: true } as Partial<TimeEntry>,
  ])
  const source = {
    serviceReports: capped,
    today: moment('2026-04-15'),
    hasAnnualGoal: true,
    publisher: 'regularPioneer' as const,
  }

  it('offers nothing when the cap already makes the month whole', () => {
    expect(
      computePendingRollovers({ ...source, lastRolloverYearMonth: null })
    ).toEqual([])
  })

  it('reports no partial credit hour when the month is whole', () => {
    expect(computeExcludedCreditMinutes(source)).toBe(0)
  })

  it('rolls only what credit leaves short of the hour', () => {
    const serviceReports = reports(2026, 2, [
      { hours: 1, minutes: 50 },
      { hours: 0, minutes: 20, ldc: true } as Partial<TimeEntry>,
    ])
    const input = { ...source, serviceReports }

    expect(
      computePendingRollovers({ ...input, lastRolloverYearMonth: null })
    ).toEqual([{ sourceYear: 2026, sourceMonth: 2, minutes: 10 }])
    expect(computeExcludedCreditMinutes(input)).toBe(0)
  })

  it('rolls the standard fraction when standard alone is over the cap', () => {
    const serviceReports = reports(2026, 2, [
      { hours: 56, minutes: 20 },
      { hours: 3, minutes: 0, ldc: true } as Partial<TimeEntry>,
    ])

    expect(
      computePendingRollovers({
        ...source,
        serviceReports,
        lastRolloverYearMonth: null,
      })
    ).toEqual([{ sourceYear: 2026, sourceMonth: 2, minutes: 20 }])
  })

  it('rolls nothing into a month the cap already holds with credit', () => {
    const serviceReports = merge(
      reports(2026, 2, [{ hours: 10, minutes: 30 }]),
      reports(2026, 3, [
        { hours: 54, minutes: 0 },
        { hours: 5, minutes: 0, ldc: true } as Partial<TimeEntry>,
      ])
    )

    expect(
      computePendingRollovers({
        ...source,
        serviceReports,
        lastRolloverYearMonth: null,
      })
    ).toEqual([])
  })

  it('rolls only what fits under the cap in this month', () => {
    const serviceReports = merge(
      reports(2026, 2, [{ hours: 10, minutes: 30 }]),
      reports(2026, 3, [
        { hours: 54, minutes: 0 },
        { hours: 0, minutes: 50, ldc: true } as Partial<TimeEntry>,
      ])
    )

    expect(
      computePendingRollovers({
        ...source,
        serviceReports,
        lastRolloverYearMonth: null,
      })
    ).toEqual([{ sourceYear: 2026, sourceMonth: 2, minutes: 10 }])
  })

  it("caps this month by this month's role", () => {
    const serviceReports = merge(
      reports(2026, 2, [{ hours: 10, minutes: 30 }]),
      reports(2026, 3, [
        { hours: 54, minutes: 0 },
        { hours: 5, minutes: 0, ldc: true } as Partial<TimeEntry>,
      ])
    )

    expect(
      computePendingRollovers({
        ...source,
        serviceReports,
        destinationPublisher: 'specialPioneer',
        lastRolloverYearMonth: null,
      })
    ).toEqual([{ sourceYear: 2026, sourceMonth: 2, minutes: 30 }])
  })

  it("never changes the Service Year total or the month's partial credit hour", () => {
    const today = moment('2026-04-15')
    const entry = (
      month: number,
      minutes: number,
      ldc: boolean
    ): Partial<TimeEntry> => ({
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
      categoryId: ldc ? LDC_BUILTIN_CATEGORY_ID : undefined,
      date: new Date(2026, month, 10, 12),
    })
    const role = fc.constantFrom<Publisher>(
      'publisher',
      'regularAuxiliary',
      'regularPioneer',
      'circuitOverseer',
      'specialPioneer',
      'custom'
    )

    fc.assert(
      fc.property(
        role,
        role,
        fc.boolean(),
        fc.record({
          enabled: fc.boolean(),
          customLimitHours: fc.integer({ min: 0, max: 80 }),
        }),

        fc.array(fc.integer({ min: 0, max: 80 * 60 }), {
          minLength: 6,
          maxLength: 6,
        }),
        (
          publisher,
          destinationPublisher,
          includeCredit,
          override,
          [febStd, febCr, marStd, marCr, aprStd, aprCr]
        ) => {
          const serviceReports = merge(
            reports(2026, 1, [entry(1, febStd, false), entry(1, febCr, true)]),
            reports(2026, 2, [entry(2, marStd, false), entry(2, marCr, true)]),
            reports(2026, 3, [entry(3, aprStd, false), entry(3, aprCr, true)])
          )
          const roleFor = ({ month }: { month: number }) =>
            month === 3 ? destinationPublisher : publisher
          const input = {
            serviceReports,
            today,
            hasAnnualGoal: true,
            publisher,
            creditLimitOverride: override,
            includeCredit,
          }
          const excluded = computeExcludedCreditMinutes(input)
          const result = applyRollover({
            ...input,
            destinationPublisher,
            lastRolloverYearMonth: null,
          })
          if (!result) return

          const after = merge(serviceReports)
          for (const rolled of result.entries) {
            const month = rolled.date.getMonth()
            after[2026] = {
              ...after[2026],
              [month]: [...(after[2026][month] ?? []), rolled],
            }
          }
          const march = (reports: TimeEntriesByYear) =>
            adjustedMinutesForSpecificMonth(
              getMonthsReports(reports, 2, 2026),
              2,
              2026,
              publisher,
              override
            ).value
          const rolledMinutes =
            result.entries[result.entries.length - 1].minutes

          expect(
            getTotalMinutesForServiceYear(after, 2025, roleFor, override)
          ).toBe(
            getTotalMinutesForServiceYear(
              serviceReports,
              2025,
              roleFor,
              override
            )
          )
          expect(march(serviceReports) - march(after)).toBe(rolledMinutes)

          if (aprCr === 0) expect(march(after) % 60).toBe(excluded)
        }
      )
    )
  })
})

describe('rolloverRole', () => {
  const prefs: RolePreferences = {
    role: 'regularPioneer',
    roleHistory: {
      initial: 'specialPioneer',
      changes: { '2026-03': 'regularPioneer' },
    },
    publisherHours: {
      publisher: 0,
      regularAuxiliary: 30,
      regularPioneer: 50,
      circuitOverseer: 50,
      specialPioneer: 100,
      custom: 50,
    },
    userSpecifiedHasAnnualGoal: 'default',
    milestoneOverrides: null,
    overrideCreditLimit: false,
    customCreditLimitHours: 0,
    logsHours: false,
  }
  const roleOn = (today: moment.Moment) =>
    rolloverRole({
      source: publisherCapabilitiesForMonth(prefs, rolloverSourceMonth(today)),
      destination: publisherCapabilitiesForMonth(prefs, {
        year: today.year(),
        month: today.month(),
      }),
    })

  it("caps last month by last month's role", () => {
    const today = moment('2026-03-05')
    const serviceReports = reports(2026, 1, [
      { hours: 50, minutes: 30 },
      { hours: 20, minutes: 0, ldc: true } as Partial<TimeEntry>,
    ])

    expect(roleOn(today).publisher).toBe('specialPioneer')
    expect(
      computePendingRollovers({
        serviceReports,
        today,
        lastRolloverYearMonth: null,
        includeCredit: true,
        ...roleOn(today),
      })
    ).toEqual([{ sourceYear: 2026, sourceMonth: 1, minutes: 30 }])
  })

  it('holds the Service Year guard when either month has an annual goal', () => {
    const intoPioneering: RolePreferences = {
      ...prefs,
      roleHistory: {
        initial: 'regularAuxiliary',
        changes: { '2026-09': 'regularPioneer' },
      },
    }
    const backToPublisher: RolePreferences = {
      ...prefs,
      role: 'publisher',
      roleHistory: {
        initial: 'regularPioneer',
        changes: { '2026-09': 'publisher' },
      },
    }
    const today = moment('2026-09-05')
    for (const p of [intoPioneering, backToPublisher]) {
      expect(
        rolloverRole({
          source: publisherCapabilitiesForMonth(p, rolloverSourceMonth(today)),
          destination: publisherCapabilitiesForMonth(p, {
            year: 2026,
            month: 8,
          }),
        }).hasAnnualGoal
      ).toBe(true)
    }
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
