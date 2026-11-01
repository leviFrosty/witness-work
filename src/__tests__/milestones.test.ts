import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))

import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import { getMilestoneHitState, milestoneLabelRows } from '@/lib/milestones'
import { getTotalMinutesForServiceYear } from '@/lib/serviceReport'
import { getServiceYearReports } from '@/lib/serviceYear'
import { migrateTimeCachePersistedState } from '@/stores/timeCache'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'

const LADDER = [30, 50, 100, 200, 350, 600]

describe('milestoneLabelRows', () => {
  const positions = LADDER.map((value) => value / 600)

  it('drops a value that crowds its neighbor to the second row', () => {
    expect(milestoneLabelRows(positions, 0.06)).toEqual([0, 1, 0, 0, 0, 0])
  })

  it('leaves out a value that would crowd both rows', () => {
    expect(milestoneLabelRows(positions, 0.18)).toEqual([0, 1, null, 0, 0, 0])
  })
})

describe('getMilestoneHitState', () => {
  it("doesn't count 599h 57m as the 600-hour goal", () => {
    const state = getMilestoneHitState(LADDER, 599 * 60 + 57)
    expect(state.hit).toEqual([30, 50, 100, 200, 350])
    expect(state.next).toBe(600)
  })

  it('counts a milestone once the total reaches it exactly', () => {
    const state = getMilestoneHitState(LADDER, 600 * 60)
    expect(state.hit).toEqual(LADDER)
    expect(state.next).toBeNull()
    expect(state.totalHit).toBe(6)
  })
})

describe('Service Year total after an entry moves months', () => {
  const entry = (
    id: string,
    date: Date,
    hours: number,
    credit = false
  ): TimeEntry => ({
    id,
    date,
    hours,
    minutes: 0,
    ...(credit ? { categoryId: LDC_BUILTIN_CATEGORY_ID, credit: true } : {}),
  })

  const cardTotal = (reports: TimeEntriesByYear) =>
    getTotalMinutesForServiceYear(
      getServiceYearReports(reports, 2026),
      2026,
      () => 'regularPioneer'
    )

  it('lifts the per-month credit cap when the credit entry moves out', () => {
    const standard = entry('std', new Date(2026, 9, 10), 50)
    const ldc = entry('ldc', new Date(2026, 9, 20), 10, true)

    expect(cardTotal({ 2026: { 9: [standard, ldc] } })).toBe(55 * 60)

    const moved = { ...ldc, date: new Date(2026, 10, 1) }
    expect(cardTotal({ 2026: { 9: [standard], 10: [moved] } })).toBe(60 * 60)
  })
})

describe('plan-cache persist migration', () => {
  it('drops the old Service Year totals and keeps the daily-minutes map', () => {
    const dailyMinutes = {
      daily: { '2026-10-01': 90 },
      lastUpdated: 1,
      fingerprint: 'dm2:1:1',
    }
    expect(
      migrateTimeCachePersistedState({
        cache: {
          '2026-reports': {
            plannedMinutes: 33000,
            lastUpdated: 1,
            planHash: 'x',
          },
        },
        dailyMinutes,
      })
    ).toEqual({ dailyMinutes })
    expect(migrateTimeCachePersistedState(undefined)).toEqual({
      dailyMinutes: null,
    })
  })
})
