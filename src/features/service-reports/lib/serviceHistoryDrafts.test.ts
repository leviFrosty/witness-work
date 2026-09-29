import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import { serviceYearMonths } from '@/lib/roleHistory'
import type { ServiceHistoryRow } from '@/features/service-reports/lib/serviceHistoryRows'
import {
  copiedFromPreviousMonth,
  dirtyServiceYears,
  discardDraft,
  draftRowsFor,
  rowHasChanges,
  saveServiceHistoryDrafts,
  updateDraft,
  withStatusAppliedToLaterMonths,
  type ServiceHistoryDrafts,
  type ServiceHistoryWriters,
} from '@/features/service-reports/lib/serviceHistoryDrafts'

/** Saved rows: every month a Regular Publisher with nothing logged. */
const build = (serviceYear: number): ServiceHistoryRow[] =>
  serviceYearMonths(serviceYear).map((target) => ({
    target,
    savedStatus: 'publisher',
    status: 'publisher',
    loggedMinutes: null,
    hours: '',
    creditHours: '',
    shared: false,
  }))

const patchMonth =
  (index: number, patch: Partial<ServiceHistoryRow>) =>
  (rows: ServiceHistoryRow[]) =>
    rows.map((r, i) => (i === index ? { ...r, ...patch } : r))

const writers = () => {
  let id = 0
  return {
    setMonthStatus: vi.fn(),
    addServiceReport: vi.fn(),
    newId: () => `id-${++id}`,
  } satisfies ServiceHistoryWriters
}

describe('Service History drafts', () => {
  it('shows the saved state for a year without a draft', () => {
    expect(draftRowsFor({}, 2023, build)).toEqual(build(2023))
  })

  it('keeps each year’s edits when switching between years', () => {
    let drafts: ServiceHistoryDrafts = {}
    drafts = updateDraft(drafts, 2023, build, patchMonth(0, { hours: '12' }))
    // Move to the next year and edit it too.
    drafts = updateDraft(
      drafts,
      2024,
      build,
      patchMonth(2, { status: 'regularAuxiliary' })
    )

    expect(draftRowsFor(drafts, 2023, build)[0].hours).toBe('12')
    expect(draftRowsFor(drafts, 2024, build)[2].status).toBe('regularAuxiliary')
    // A year never edited is still its saved state.
    expect(draftRowsFor(drafts, 2022, build)).toEqual(build(2022))
  })

  it('tracks which years have something to save', () => {
    let drafts: ServiceHistoryDrafts = {}
    drafts = updateDraft(drafts, 2024, build, patchMonth(0, { hours: '3' }))
    drafts = updateDraft(drafts, 2022, build, patchMonth(0, { shared: true }))
    // Edited back to its saved state: a draft, but nothing to save.
    drafts = updateDraft(drafts, 2023, build, patchMonth(0, { hours: '0' }))

    expect(dirtyServiceYears(drafts)).toEqual([2022, 2024])
    expect(rowHasChanges(drafts[2023][0])).toBe(false)
  })

  it('ignores entered time on months that already have time logged', () => {
    const row = { ...build(2023)[0], loggedMinutes: 60, hours: '5' }
    expect(rowHasChanges(row)).toBe(false)
    expect(rowHasChanges({ ...row, status: 'regularPioneer' })).toBe(true)
  })

  it('discards one year’s draft and leaves the others', () => {
    let drafts: ServiceHistoryDrafts = {}
    drafts = updateDraft(drafts, 2023, build, patchMonth(0, { hours: '1' }))
    drafts = updateDraft(drafts, 2024, build, patchMonth(0, { hours: '2' }))

    const after = discardDraft(drafts, 2023)
    expect(dirtyServiceYears(after)).toEqual([2024])
    expect(draftRowsFor(after, 2023, build)).toEqual(build(2023))
    expect(dirtyServiceYears(drafts)).toEqual([2023, 2024])
  })

  it('applies a status to the later months of the same year only', () => {
    let drafts: ServiceHistoryDrafts = {}
    drafts = updateDraft(drafts, 2023, build, (rows) =>
      withStatusAppliedToLaterMonths(
        patchMonth(9, { status: 'regularPioneer' })(rows),
        9
      )
    )
    expect(drafts[2023].map((r) => r.status)).toEqual([
      ...Array(9).fill('publisher'),
      'regularPioneer',
      'regularPioneer',
      'regularPioneer',
    ])
    expect(drafts[2024]).toBeUndefined()
  })

  it('copies September from the previous year’s August draft', () => {
    let drafts: ServiceHistoryDrafts = {}
    drafts = updateDraft(
      drafts,
      2023,
      build,
      patchMonth(11, { status: 'regularAuxiliary', hours: '30' })
    )
    expect(copiedFromPreviousMonth(drafts, 2024, 0, build)).toMatchObject({
      target: { year: 2024, month: 8 },
      status: 'regularAuxiliary',
      hours: '30',
    })
    // Within a year it copies the month before.
    drafts = updateDraft(drafts, 2024, build, patchMonth(0, { hours: '4' }))
    expect(copiedFromPreviousMonth(drafts, 2024, 1, build).hours).toBe('4')
  })
})

describe('saveServiceHistoryDrafts', () => {
  it('writes every dirty year and reports counts per year', () => {
    let drafts: ServiceHistoryDrafts = {}
    drafts = updateDraft(
      drafts,
      2024,
      build,
      patchMonth(0, { status: 'regularPioneer', hours: '50', creditHours: '5' })
    )
    drafts = updateDraft(drafts, 2022, build, (rows) =>
      patchMonth(1, { status: 'regularAuxiliary' })(
        patchMonth(0, { shared: true })(rows)
      )
    )
    // Opened and left untouched.
    drafts = updateDraft(drafts, 2023, build, (rows) => rows)

    const w = writers()
    const saved = saveServiceHistoryDrafts(drafts, w)

    expect(saved).toEqual([
      { serviceYear: 2022, monthsStatusChanged: 1, monthsTimeAdded: 1 },
      { serviceYear: 2024, monthsStatusChanged: 1, monthsTimeAdded: 1 },
    ])
    expect(w.setMonthStatus.mock.calls).toEqual([
      [{ year: 2022, month: 9 }, 'regularAuxiliary', 'month'],
      [{ year: 2024, month: 8 }, 'regularPioneer', 'month'],
    ])
    expect(w.addServiceReport.mock.calls.map(([r]) => r)).toEqual([
      // Checkbox month: the 0h "shared" marker.
      { id: 'id-1', date: new Date(2022, 8, 1, 12), hours: 0, minutes: 0 },
      {
        id: 'id-2',
        date: new Date(2024, 8, 1, 12),
        hours: 50,
        minutes: 0,
        credit: false,
      },
      {
        id: 'id-3',
        date: new Date(2024, 8, 1, 12),
        hours: 5,
        minutes: 0,
        categoryId: LDC_BUILTIN_CATEGORY_ID,
        credit: true,
      },
    ])
  })

  it('writes nothing without drafts', () => {
    const w = writers()
    expect(saveServiceHistoryDrafts({}, w)).toEqual([])
    expect(w.setMonthStatus).not.toHaveBeenCalled()
    expect(w.addServiceReport).not.toHaveBeenCalled()
  })
})
