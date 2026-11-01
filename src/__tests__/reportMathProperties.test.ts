import fc from 'fast-check'
import moment from 'moment'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Publisher } from '@/types/publisher'
import type { TimeEntry, TimeEntriesByYear } from '@/types/timeEntry'
import { entryMinutes } from '@/lib/entryMinutes'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { hasCategory, isLdcEntry } from '@/lib/serviceReportCategory'
import {
  adjustedMinutesForSpecificMonth,
  getLifetimeMinutes,
  getMonthsReports,
  getServiceYearTotalsByEndYear,
  getTotalMinutesDetailedForSpecificMonth,
  getTotalMinutesForServiceYear,
  monthCreditCapMinutes,
} from '@/lib/serviceReport'
import { getServiceYearReports, serviceYearOf } from '@/lib/serviceYear'
import {
  applyRollover,
  computePendingRollovers,
} from '@/features/service-reports/lib/rollover'
import {
  bucketEntries,
  fcSeed,
  flattenEntries,
  timeEntryArb,
} from '@/__tests__/helpers/dataArbitraries'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const runs = { numRuns: 200, seed: fcSeed }

const ROLES: Publisher[] = [
  'publisher',
  'regularAuxiliary',
  'regularPioneer',
  'circuitOverseer',
  'specialPioneer',
  'custom',
]
const roleArb = fc.constantFrom(...ROLES)
const overrideArb = fc.option(
  fc.record({
    enabled: fc.boolean(),
    customLimitHours: fc.constantFrom(0, 1, 30, 55, 80),
  }),
  { nil: undefined }
)

const TIME_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Havana',
  'America/Santiago',
  'Pacific/Auckland',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
  'Asia/Kolkata',
]
const originalTZ = process.env.TZ
afterEach(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

const entriesArb = fc
  .tuple(
    fc.uniqueArray(timeEntryArb(fc.uuid()), {
      maxLength: 40,
      selector: (e) => e.id,
    }),
    fc.array(
      fc.record({
        id: fc.uuid(),
        minutes: fc.integer({ min: -59, max: 59 }),
        date: timeEntryArb().map((e) => e.date as unknown as string),
      }),
      { maxLength: 4 }
    )
  )
  .map(([entries, rollovers]) => [
    ...entries,
    ...rollovers.map(
      (r) =>
        ({
          id: r.id,
          hours: 0,
          minutes: r.minutes,
          date: r.date,
          rollover: true,
          rolloverGroupId: `group-${r.id}`,
        }) as unknown as TimeEntry
    ),
  ])

const monthsOf = (reports: TimeEntriesByYear) =>
  Object.entries(reports).flatMap(([year, months]) =>
    Object.keys(months).map((month) => ({
      year: Number(year),
      month: Number(month),
    }))
  )

describe('month totals', () => {
  it('standard plus credit is the sum of the month’s entries', () => {
    fc.assert(
      fc.property(entriesArb, fc.constantFrom(...TIME_ZONES), (entries, tz) => {
        process.env.TZ = tz
        const reports = bucketEntries(entries)
        for (const { year, month } of monthsOf(reports)) {
          const monthEntries = getMonthsReports(reports, month, year)
          const detailed = getTotalMinutesDetailedForSpecificMonth(
            monthEntries,
            month,
            year
          )
          const sum = monthEntries.reduce((t, e) => t + entryMinutes(e), 0)
          const credit = monthEntries
            .filter((e) => isLdcEntry(e) || (hasCategory(e) && e.credit))
            .reduce((t, e) => t + entryMinutes(e), 0)
          expect(detailed.standard + detailed.credit).toBeCloseTo(sum, 9)
          expect(detailed.credit).toBeCloseTo(credit, 9)
        }
      }),
      runs
    )
  })

  it('lifetime and per-Service-Year raw totals add up every entry', () => {
    fc.assert(
      fc.property(entriesArb, fc.constantFrom(...TIME_ZONES), (entries, tz) => {
        process.env.TZ = tz
        const sum = entries.reduce((t, e) => t + entryMinutes(e), 0)
        expect(getLifetimeMinutes(entries)).toBeCloseTo(sum, 9)
        const byYear = getServiceYearTotalsByEndYear(entries)
        let total = 0
        let count = 0
        for (const { minutes, reportCount } of byYear.values()) {
          total += minutes
          count += reportCount
        }
        expect(total).toBeCloseTo(sum, 9)
        expect(count).toBe(entries.length)

        for (const entry of entries) {
          const date = new Date(entry.date)
          const endYear =
            serviceYearOf({
              year: date.getUTCFullYear(),
              month: date.getUTCMonth(),
            }) + 1
          expect(byYear.has(endYear)).toBe(true)
        }
      }),
      runs
    )
  })
})

describe('credit cap (#825)', () => {
  it('counted credit never passes the cap, and standard always counts in full', () => {
    fc.assert(
      fc.property(
        entriesArb,
        roleArb,
        overrideArb,
        (entries, role, override) => {
          const reports = bucketEntries(entries)
          const cap = monthCreditCapMinutes(role, override)
          for (const { year, month } of monthsOf(reports)) {
            const monthEntries = getMonthsReports(reports, month, year)
            const raw = getTotalMinutesDetailedForSpecificMonth(
              monthEntries,
              month,
              year
            )
            const adjusted = adjustedMinutesForSpecificMonth(
              monthEntries,
              month,
              year,
              role,
              override
            )
            expect(adjusted.standard).toBe(raw.standard)
            expect(adjusted.credit + adjusted.creditOverage).toBeCloseTo(
              raw.credit,
              9
            )
            expect(adjusted.credit).toBeGreaterThanOrEqual(0)
            expect(adjusted.creditOverage).toBeGreaterThanOrEqual(-1e-9)
            if (cap === null) {
              expect(adjusted.value).toBeCloseTo(raw.standard + raw.credit, 9)
              expect(adjusted.creditOverage).toBeCloseTo(0, 9)
            } else {
              expect(adjusted.value).toBeLessThanOrEqual(
                Math.max(raw.standard, cap) + 1e-9
              )

              expect(adjusted.credit).toBeLessThanOrEqual(
                Math.max(0, cap - raw.standard) + 1e-9
              )
            }
          }
        }
      ),
      runs
    )
  })
})

describe('Service Year totals', () => {
  it('equal the sum of their months, each capped by its own role', () => {
    fc.assert(
      fc.property(
        entriesArb,
        fc.array(roleArb, { minLength: 12, maxLength: 12 }),
        overrideArb,
        fc.constantFrom(2024, 2025, 2026),
        fc.constantFrom(...TIME_ZONES),
        (entries, roles, override, serviceYear, tz) => {
          process.env.TZ = tz
          const reports = bucketEntries(entries)
          const roleFor = ({ year, month }: { year: number; month: number }) =>
            roles[(year * 12 + month) % 12]
          const year = getTotalMinutesForServiceYear(
            getServiceYearReports(reports, serviceYear),
            serviceYear,
            roleFor,
            override
          )
          let months = 0
          for (let i = 0; i < 12; i++) {
            const m = moment
              .utc({ year: serviceYear, month: 8 })
              .add(i, 'month')
            const target = { year: m.year(), month: m.month() }
            months += adjustedMinutesForSpecificMonth(
              getMonthsReports(reports, target.month, target.year),
              target.month,
              target.year,
              roleFor(target),
              override
            ).value
          }
          expect(year).toBeCloseTo(months, 9)
        }
      ),
      runs
    )
  })
})

describe('Time Rollover', () => {
  const withEntries = (reports: TimeEntriesByYear, added: TimeEntry[]) =>
    bucketEntries([
      ...flattenEntries(reports),
      ...added.map((e) => ({
        ...e,
        date: normalizeDateForStorage(e.date).toISOString() as unknown as Date,
      })),
    ])

  it('is idempotent: once applied, there is nothing left to roll', () => {
    let applied = 0
    fc.assert(
      fc.property(
        entriesArb,
        roleArb,
        roleArb,
        overrideArb,
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom(
          '2026-01-15',
          '2026-03-01',
          '2026-04-30',
          '2026-09-01',
          '2026-10-25',
          '2026-11-01',
          '2027-01-01'
        ),
        fc.constantFrom(...TIME_ZONES),
        (
          entries,
          publisher,
          destinationPublisher,
          override,
          includeCredit,
          hasAnnualGoal,
          day,
          tz
        ) => {
          process.env.TZ = tz
          const today = moment(`${day}T09:00:00`)

          const source = today.clone().subtract(1, 'month')
          const placed = entries.map((entry, i) => {
            const month = i % 2 ? today : source
            const day = (i % month.daysInMonth()) + 1
            return {
              ...entry,
              date: new Date(
                Date.UTC(month.year(), month.month(), day, 12)
              ).toISOString() as unknown as Date,
            }
          })
          const input = {
            serviceReports: bucketEntries(placed),
            today,
            hasAnnualGoal,
            lastRolloverYearMonth: null,
            publisher,
            destinationPublisher,
            creditLimitOverride: override,
            includeCredit,
          }
          const first = applyRollover(input)
          if (!first) return
          const after = withEntries(input.serviceReports, first.entries)
          applied++

          const [out, into] = first.entries.map((e) =>
            moment.utc(normalizeDateForStorage(e.date))
          )
          expect([out.year(), out.month()]).toEqual([
            source.year(),
            source.month(),
          ])
          expect([into.year(), into.month()]).toEqual([
            today.year(),
            today.month(),
          ])
          expect(
            computePendingRollovers({
              ...input,
              serviceReports: after,
              ignoreMarker: true,
            })
          ).toEqual([])
          expect(applyRollover({ ...input, serviceReports: after })).toBeNull()
        }
      ),
      runs
    )

    expect(applied).toBeGreaterThan(runs.numRuns / 4)
  })
})
