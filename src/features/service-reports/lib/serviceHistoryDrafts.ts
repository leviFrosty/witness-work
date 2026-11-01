import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import { normalizeNumericInput } from '@/lib/digits'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { roleOfMonthStatus, type MonthStatus } from '@/lib/monthStatus'
import { getEntryMode } from '@/lib/publisherCapabilities'
import type { TimeEntry } from '@/types/timeEntry'
import {
  copiedFromPreviousRow,
  type ServiceHistoryRow,
} from '@/features/service-reports/lib/serviceHistoryRows'

export type ServiceHistoryDrafts = Readonly<Record<number, ServiceHistoryRow[]>>

export type BuildServiceHistoryRows = (
  serviceYear: number
) => ServiceHistoryRow[]

export const parseHours = (value: string): number => {
  const hours = Number.parseFloat(
    normalizeNumericInput(value).replace(',', '.')
  )
  return Number.isFinite(hours) && hours > 0 ? hours : 0
}

export const rowHasChanges = (row: ServiceHistoryRow): boolean =>
  row.status !== row.savedStatus ||
  (row.loggedMinutes === null &&
    (parseHours(row.hours) > 0 ||
      parseHours(row.creditHours) > 0 ||
      row.shared))

export const draftRowsFor = (
  drafts: ServiceHistoryDrafts,
  serviceYear: number,
  build: BuildServiceHistoryRows
): ServiceHistoryRow[] => drafts[serviceYear] ?? build(serviceYear)

export const dirtyServiceYears = (drafts: ServiceHistoryDrafts): number[] =>
  Object.keys(drafts)
    .map(Number)
    .filter((serviceYear) => drafts[serviceYear].some(rowHasChanges))
    .sort((a, b) => a - b)

export const updateDraft = (
  drafts: ServiceHistoryDrafts,
  serviceYear: number,
  build: BuildServiceHistoryRows,
  update: (rows: ServiceHistoryRow[]) => ServiceHistoryRow[]
): ServiceHistoryDrafts => ({
  ...drafts,
  [serviceYear]: update(draftRowsFor(drafts, serviceYear, build)),
})

export const discardDraft = (
  drafts: ServiceHistoryDrafts,
  serviceYear: number
): ServiceHistoryDrafts => {
  const next = { ...drafts }
  delete next[serviceYear]
  return next
}

export const withStatusAppliedToLaterMonths = (
  rows: ServiceHistoryRow[],
  index: number
): ServiceHistoryRow[] =>
  rows.map((r, i) => (i > index ? { ...r, status: rows[index].status } : r))

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

    const date = new Date(row.target.year, row.target.month, 1, 12)
    const isCheckbox =
      getEntryMode(roleOfMonthStatus(row.status)) === 'checkbox'
    if (isCheckbox) {
      if (!row.shared) continue

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

export const saveServiceHistoryDrafts = (
  drafts: ServiceHistoryDrafts,
  writers: ServiceHistoryWriters
): ServiceHistoryYearSaved[] =>
  dirtyServiceYears(drafts).map((serviceYear) => ({
    serviceYear,
    ...saveServiceHistoryRows(drafts[serviceYear], writers),
  }))
