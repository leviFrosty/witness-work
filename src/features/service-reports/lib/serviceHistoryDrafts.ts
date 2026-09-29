import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { roleOfMonthStatus, type MonthStatus } from '@/lib/monthStatus'
import { getEntryMode } from '@/lib/publisherCapabilities'
import type { TimeEntry } from '@/types/timeEntry'
import {
  copiedFromPreviousRow,
  type ServiceHistoryRow,
} from '@/features/service-reports/lib/serviceHistoryRows'

/**
 * The Service History editor's unsaved form, keyed by Service Year (its start
 * year). A year gets a draft on its first edit; years without one show their
 * saved state. Switching years keeps every draft, and Save writes them all.
 */
export type ServiceHistoryDrafts = Readonly<Record<number, ServiceHistoryRow[]>>

/** Builds a Service Year's saved rows (no draft). */
export type BuildServiceHistoryRows = (
  serviceYear: number
) => ServiceHistoryRow[]

export const parseHours = (value: string): number => {
  const hours = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(hours) && hours > 0 ? hours : 0
}

/** Whether Save would write anything for this month. */
export const rowHasChanges = (row: ServiceHistoryRow): boolean =>
  row.status !== row.savedStatus ||
  (row.loggedMinutes === null &&
    (parseHours(row.hours) > 0 ||
      parseHours(row.creditHours) > 0 ||
      row.shared))

/** A Service Year's rows: its draft, or its saved state. */
export const draftRowsFor = (
  drafts: ServiceHistoryDrafts,
  serviceYear: number,
  build: BuildServiceHistoryRows
): ServiceHistoryRow[] => drafts[serviceYear] ?? build(serviceYear)

/** Service Years whose draft has something to save, oldest first. */
export const dirtyServiceYears = (drafts: ServiceHistoryDrafts): number[] =>
  Object.keys(drafts)
    .map(Number)
    .filter((serviceYear) => drafts[serviceYear].some(rowHasChanges))
    .sort((a, b) => a - b)

/** Replaces a Service Year's draft with `update` applied to its rows. */
export const updateDraft = (
  drafts: ServiceHistoryDrafts,
  serviceYear: number,
  build: BuildServiceHistoryRows,
  update: (rows: ServiceHistoryRow[]) => ServiceHistoryRow[]
): ServiceHistoryDrafts => ({
  ...drafts,
  [serviceYear]: update(draftRowsFor(drafts, serviceYear, build)),
})

/** Drops a Service Year's draft, e.g. after its time was deleted. */
export const discardDraft = (
  drafts: ServiceHistoryDrafts,
  serviceYear: number
): ServiceHistoryDrafts => {
  const next = { ...drafts }
  delete next[serviceYear]
  return next
}

/** Rows with every month after `index` set to that month's status. */
export const withStatusAppliedToLaterMonths = (
  rows: ServiceHistoryRow[],
  index: number
): ServiceHistoryRow[] =>
  rows.map((r, i) => (i > index ? { ...r, status: rows[index].status } : r))

/**
 * Month `index` of `serviceYear` copied from the month before it. September
 * copies August of the previous Service Year (its draft or saved state).
 */
export const copiedFromPreviousMonth = (
  drafts: ServiceHistoryDrafts,
  serviceYear: number,
  index: number,
  build: BuildServiceHistoryRows
): ServiceHistoryRow => {
  const rows = draftRowsFor(drafts, serviceYear, build)
  if (index > 0) return copiedFromPreviousRow(rows, index)
  const previousYear = draftRowsFor(drafts, serviceYear - 1, build)
  const previousAugust = previousYear[previousYear.length - 1]
  return previousAugust
    ? copiedFromPreviousRow([previousAugust, rows[index]], 1)
    : rows[index]
}

export type ServiceHistoryWriters = {
  setMonthStatus: (
    target: CalendarMonth,
    status: MonthStatus,
    scope: 'month'
  ) => void
  addServiceReport: (report: TimeEntry) => void
  newId: () => string
}

export type ServiceHistoryYearSaved = {
  serviceYear: number
  monthsStatusChanged: number
  monthsTimeAdded: number
}

/** Writes one Service Year's rows: changed statuses and time for empty months. */
export const saveServiceHistoryRows = (
  rows: ServiceHistoryRow[],
  { setMonthStatus, addServiceReport, newId }: ServiceHistoryWriters
): Omit<ServiceHistoryYearSaved, 'serviceYear'> => {
  let monthsStatusChanged = 0
  let monthsTimeAdded = 0

  for (const row of rows) {
    if (row.status !== row.savedStatus) {
      setMonthStatus(row.target, row.status, 'month')
      monthsStatusChanged++
    }
    if (row.loggedMinutes !== null) continue

    // The 1st at noon, like the Onboarding Backfill, so no time zone can
    // move the entry into the previous month.
    const date = new Date(row.target.year, row.target.month, 1, 12)
    const isCheckbox =
      getEntryMode(roleOfMonthStatus(row.status)) === 'checkbox'
    if (isCheckbox) {
      if (!row.shared) continue
      // A 0h Time Entry is the checkbox "shared" marker.
      addServiceReport({ id: newId(), date, hours: 0, minutes: 0 })
      monthsTimeAdded++
      continue
    }

    const hours = parseHours(row.hours)
    const creditHours = parseHours(row.creditHours)
    if (hours > 0) {
      addServiceReport({
        id: newId(),
        date,
        hours: Math.floor(hours),
        minutes: Math.round((hours % 1) * 60),
        credit: false,
      })
    }
    if (creditHours > 0) {
      // Same credit routing as the Onboarding Backfill: the LDC builtin
      // Category counts toward the credit bucket.
      addServiceReport({
        id: newId(),
        date,
        hours: Math.floor(creditHours),
        minutes: Math.round((creditHours % 1) * 60),
        categoryId: LDC_BUILTIN_CATEGORY_ID,
        credit: true,
      })
    }
    if (hours > 0 || creditHours > 0) monthsTimeAdded++
  }

  return { monthsStatusChanged, monthsTimeAdded }
}

/** Writes every Service Year with unsaved changes, oldest first. */
export const saveServiceHistoryDrafts = (
  drafts: ServiceHistoryDrafts,
  writers: ServiceHistoryWriters
): ServiceHistoryYearSaved[] =>
  dirtyServiceYears(drafts).map((serviceYear) => ({
    serviceYear,
    ...saveServiceHistoryRows(drafts[serviceYear], writers),
  }))
