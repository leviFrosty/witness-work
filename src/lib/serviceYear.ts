import moment from 'moment'
import { TimeEntriesByMonth, TimeEntriesByYear } from '@/types/timeEntry'

/**
 * Period a Projected Total is scoped to. Defined structurally here so this
 * low-level calendar module owns no dependency on the higher-level projection
 * module — `ProjectedTotalScope` in `lib/projectedTotal.ts` is the identical
 * shape and is assignable to this. (Importing the type from there would create
 * an import cycle the repo's `madge -c` check rejects.)
 */
export type PeriodScope =
  | { kind: 'month'; year: number; month: number }
  | { kind: 'serviceYear'; serviceYear: number }

// ---------------------------------------------------------------------------
// Service Year calendar: the JW service year runs Sept 1 → Aug 31. This module
// owns the boundary math and month iteration so the Sept/Aug seam is computed
// in exactly one place. Callers must not re-derive `month < 8` / `month >= 8`
// or rebuild Sep 1 / Aug 31 by hand — use the helpers below.
//
// Convention: a Service Year is named by its START year (2025 = Sep 2025 →
// Aug 2026). Surfaces that key by the END year (the Year tab, YearMilestone
// card) convert explicitly with `+ 1` / `- 1` at the call site. Months are
// 0-indexed (`8` = September), matching moment and `Date`.
// ---------------------------------------------------------------------------

/** A calendar month; `month` is 0-indexed (0 = January). */
type YearMonth = { year: number; month: number }

/** The Service Year (start year) a calendar month belongs to. */
export const serviceYearOf = ({ year, month }: YearMonth): number =>
  month < 8 ? year - 1 : year

/** The Service Year (start year) a date falls in, read in its own zone. */
export const getServiceYearFromDate = (date: moment.Moment | Date): number => {
  const m = moment.isMoment(date) ? date : moment(date)
  return serviceYearOf({ year: m.year(), month: m.month() })
}

/**
 * Local-time bounds of a Service Year: `start` is Sep 1 00:00 of `serviceYear`,
 * `end` is Aug 31 23:59:59.999 of `serviceYear + 1`. Returns fresh moments, so
 * callers may mutate them.
 */
export const serviceYearBounds = (
  serviceYear: number
): { start: moment.Moment; end: moment.Moment } => ({
  start: moment({ year: serviceYear, month: 8, day: 1 }),
  end: moment({ year: serviceYear + 1, month: 7, day: 31 }).endOf('day'),
})

/** Whether a date falls inside the given Service Year (start year). */
export const isInServiceYear = (
  date: moment.Moment | Date,
  serviceYear: number
): boolean => getServiceYearFromDate(date) === serviceYear

/**
 * Position of a calendar month within a Service Year: September is 0 and August
 * is 11. Not clamped — months before the year are negative and months after it
 * are 12 or more, so callers can tell past from future.
 */
export const serviceYearMonthIndex = (
  { year, month }: YearMonth,
  serviceYear: number
): number => (year - serviceYear) * 12 + month - 8

export const getServiceYearReports = (
  serviceReports: TimeEntriesByYear,
  serviceYear: number
): TimeEntriesByYear => {
  const result: TimeEntriesByYear = {}
  const first = serviceReports[serviceYear]
  const firstYear: TimeEntriesByMonth = {}

  for (let month = 8; month < 12; month++) {
    if (first?.[month]) {
      firstYear[month] = first[month]
    }
  }
  result[serviceYear] = firstYear

  const second = serviceReports[serviceYear + 1]
  const secondYear: TimeEntriesByMonth = {}
  for (let month = 0; month < 8; month++) {
    if (second?.[month]) {
      secondYear[month] = second[month]
    }
  }
  result[serviceYear + 1] = secondYear

  return result
}

/**
 * Canonical period-bounds for the Projected Total. Both `projectedTotal.ts` and
 * `projectedTotalCopy.ts` previously held a VERBATIM copy of this — they are
 * now redirected here so the month/service-year seam can never drift between
 * the two.
 *
 * Both copies anchored their bounds in **UTC** (`moment.utc`), and both callers
 * compare a UTC-read `today` against them, so a single UTC implementation
 * preserves every caller's timezone behavior exactly. There is no
 * local-anchored caller, so no anchoring option is exposed; add one only if a
 * genuinely local-anchored caller appears.
 */
export const periodBounds = (
  scope: PeriodScope
): { start: moment.Moment; end: moment.Moment } => {
  if (scope.kind === 'month') {
    const m = moment.utc({ year: scope.year, month: scope.month, day: 1 })
    return { start: m.clone().startOf('month'), end: m.clone().endOf('month') }
  }
  const start = moment.utc({ year: scope.serviceYear, month: 8, day: 1 })
  const end = moment
    .utc({ year: scope.serviceYear + 1, month: 7, day: 1 })
    .endOf('month')
  return { start, end }
}
