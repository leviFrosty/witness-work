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
// in exactly one place (it was previously re-derived in ≥6 spots, some with
// local moments and some with UTC moments — a latent inconsistency).
// ---------------------------------------------------------------------------

export const serviceYearsDateRange = (serviceYear: number) => {
  const minDate = moment().month(8).year(serviceYear).startOf('month')
  const maxDate = moment()
    .month(7)
    .year(serviceYear + 1)
    .endOf('month')

  return { minDate, maxDate }
}

export const getServiceYearFromDate = (moment: moment.Moment) => {
  const month = moment.month()
  const year = moment.year()

  if (month < 8) {
    return year - 1
  }

  return year
}

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
