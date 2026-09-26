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
  it('lists the last 12 months newest first with the selection checked', () => {
    const menu = buildReportMonthMenu({
      now,
      earliest: null,
      selected: { year: 2026, month: 7 },
    })
    expect(menu).toHaveLength(12)
    expect(menu[0]).toMatchObject({ id: '2026-09', state: 'off' })
    expect(menu[1]).toMatchObject({ id: '2026-08', state: 'on' })
    expect(menu[11].id).toBe('2025-10')
  })

  it('nests older months under a submenu per year', () => {
    const menu = buildReportMonthMenu({
      now,
      earliest: { year: 2024, month: 10 },
      selected: { year: 2025, month: 1 },
    })
    const older = menu[12]
    expect(older.displayInline).toBe(true)
    expect(older.subactions?.map((a) => a.title)).toEqual(['2025', '2024'])
    const [y2025, y2024] = older.subactions!
    expect(y2025.state).toBe('on')
    expect(y2025.subactions?.map((a) => a.id)).toEqual([
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
    expect(y2024.subactions?.map((a) => a.id)).toEqual(['2024-12', '2024-11'])
  })

  it('reaches back to a selected month older than any entry', () => {
    const menu = buildReportMonthMenu({
      now,
      earliest: null,
      selected: { year: 2025, month: 8 },
    })
    expect(menu[12].subactions?.[0].subactions?.map((a) => a.id)).toEqual([
      '2025-09',
    ])
  })
})
