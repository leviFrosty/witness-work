import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}))

import {
  earnedLabel,
  nextLevel,
  progressLabel,
  progressToward,
  progressUnitKey,
} from '@/features/badges/lib/badgeText'

describe('progressUnitKey', () => {
  it('counts service years for Year Round', () => {
    expect(progressUnitKey('yearRound')).toBe('badges_progressServiceYears')
  })

  it('counts months with one person for Keeping in Touch', () => {
    expect(progressUnitKey('keepingInTouch')).toBe(
      'badges_progressPersonMonths'
    )
  })

  it('counts reports for Reports Sent', () => {
    expect(progressUnitKey('reportSent')).toBe('badges_progressReports')
  })

  it('counts plain months for every other collection', () => {
    for (const art of [
      'monthsShared',
      'prepared',
      'conversations',
      'returnVisits',
      'nextTime',
      'together',
    ] as const)
      expect(progressUnitKey(art)).toBe('badges_progressMonths')
  })
})

describe('nextLevel', () => {
  it('points at Bronze before anything is earned', () => {
    expect(nextLevel(0)).toBe(1)
  })

  it('steps one level at a time', () => {
    expect(nextLevel(1)).toBe(2)
    expect(nextLevel(3)).toBe(4)
  })

  it('has nothing after Pearl', () => {
    expect(nextLevel(4)).toBeNull()
  })
})

describe('progressToward', () => {
  it('measures against the level threshold', () => {
    // Sharing the Good News: 1, 6, 24, 60 months.
    expect(progressToward('monthsShared', 4, 2)).toEqual({
      done: 4,
      total: 6,
      fraction: 4 / 6,
    })
  })

  it('caps at the threshold so a bar never overflows', () => {
    expect(progressToward('monthsShared', 30, 3)).toEqual({
      done: 24,
      total: 24,
      fraction: 1,
    })
  })

  it('never goes below zero', () => {
    expect(progressToward('yearRound', -2, 1).done).toBe(0)
  })

  it('uses each collection’s own thresholds', () => {
    // Keeping in Touch: 3, 6, 12, 24.
    expect(progressToward('keepingInTouch', 2, 1).total).toBe(3)
  })
})

describe('progressLabel', () => {
  it('pluralizes on the total and passes what is done', () => {
    expect(progressLabel('yearRound', 1, 3)).toBe(
      'badges_progressServiceYears {"count":3,"done":"1"}'
    )
  })
})

describe('earnedLabel', () => {
  it('names the month that reached the badge', () => {
    expect(earnedLabel({ at: Date.UTC(2026, 9, 6), month: '2026-03' })).toBe(
      'badges_earnedOn {"date":"March 2026"}'
    )
  })

  it('names the month a badge found in history reached it, when known', () => {
    expect(
      earnedLabel({ at: Date.UTC(2026, 9, 6), month: '2024-11', history: true })
    ).toBe('badges_earnedOn {"date":"November 2024"}')
  })

  it('says a badge was found in history when its month is unknown', () => {
    expect(earnedLabel({ at: Date.UTC(2026, 9, 6), history: true })).toBe(
      'badges_foundInHistory'
    )
  })

  it('falls back to when it was recorded', () => {
    expect(earnedLabel({ at: new Date(2026, 4, 15).getTime() })).toBe(
      'badges_earnedOn {"date":"May 2026"}'
    )
  })
})
