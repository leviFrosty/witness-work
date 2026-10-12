import { describe, expect, it } from 'vitest'

import {
  buildReportMonthMenu,
  getEarliestReportMonth,
  parseReportMonthId,
  reportMonthId,
} from '@/features/service-reports/lib/reportMonthMenu'
import type { TimeEntry } from '@/types/timeEntry'

const now = new Date(2026, 8, 26)
const entry = {} as TimeEntry

describe('getEarliestReportMonth', () => {
  it('returns null with no entries', () => {
    expect(getEarliestReportMonth({})).toBeNull()
    expect(getEarliestReportMonth({ 2026: { 3: [] } })).toBeNull()
  })

  it('finds the oldest non-empty month', () => {
    expect(
      getEarliestReportMonth({
        2026: { 1: [entry] },
        2024: { 10: [entry], 2: [] },
        2025: { 0: [entry] },
      })
    ).toEqual({ year: 2024, month: 10 })
  })
})

describe('reportMonthId', () => {
  it('round-trips a 0-indexed month', () => {
    expect(reportMonthId({ year: 2026, month: 0 })).toBe('2026-01')
    expect(parseReportMonthId('2026-01')).toEqual({ year: 2026, month: 0 })
  })
})

describe('buildReportMonthMenu', () => {
  const onSelect = () => {}

  it('lists the last 12 months newest first with the selection checked', () => {
    const [recent, older] = buildReportMonthMenu({
      now,
      earliest: null,
      selected: { year: 2026, month: 7 },
      onSelect,
    })
    expect(recent).toHaveLength(12)
    expect(older).toEqual([])
    expect(recent[0]).toMatchObject({ id: '2026-09', checked: false })
    expect(recent[1]).toMatchObject({ id: '2026-08', checked: true })
    expect(recent[11].id).toBe('2025-10')
  })

  it('nests older months under a submenu per year', () => {
    const [, older] = buildReportMonthMenu({
      now,
      earliest: { year: 2024, month: 10 },
      selected: { year: 2025, month: 1 },
      onSelect,
    })
    expect(older.map((year) => year.title)).toEqual(['2025', '2024'])
    const [y2025, y2024] = older
    expect(y2025.actions.map((a) => a.id)).toEqual([
      '2025-09',
      '2025-08',
      '2025-07',
      '2025-06',
      '2025-05',
      '2025-04',
      '2025-03',
      '2025-02',
      '2025-01',
    ])
    expect(y2025.actions.find((a) => a.checked)?.id).toBe('2025-02')
    expect(y2024.actions.map((a) => a.id)).toEqual(['2024-12', '2024-11'])
  })

  it('reaches back to a selected month older than any entry', () => {
    const [, older] = buildReportMonthMenu({
      now,
      earliest: null,
      selected: { year: 2025, month: 8 },
      onSelect,
    })
    expect(older[0].actions.map((a) => a.id)).toEqual(['2025-09'])
  })

  it('selects the chosen month, 0-indexed', () => {
    const chosen: unknown[] = []
    const [recent, older] = buildReportMonthMenu({
      now,
      earliest: { year: 2024, month: 10 },
      selected: { year: 2026, month: 8 },
      onSelect: (month) => chosen.push(month),
    })
    recent[2].onPress()
    older[1].actions[0].onPress()
    expect(chosen).toEqual([
      { year: 2026, month: 6 },
      { year: 2024, month: 11 },
    ])
  })
})
