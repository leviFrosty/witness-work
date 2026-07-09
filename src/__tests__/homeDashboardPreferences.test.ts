import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({ DeviceType: { TABLET: 2 }, deviceType: 1 }))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))
vi.mock('@/shaders/registry', () => ({
  DEFAULT_SHADER_ID: 'holographic',
}))

import {
  DEFAULT_HOME_DASHBOARD_CARD_ORDER,
  DEFAULT_HOME_SCREEN_ELEMENTS_ORDER,
  getEffectiveHomeDashboardCards,
  getEffectiveHomeScreenOrder,
  MAX_VISIBLE_HOME_DASHBOARD_CARDS,
} from '@/stores/preferences'

describe('Home dashboard preferences', () => {
  it('uses three defaults for a new User', () => {
    const result = getEffectiveHomeDashboardCards(undefined, undefined)

    expect(result.order).toEqual(DEFAULT_HOME_DASHBOARD_CARD_ORDER)
    expect(result.order.filter((key) => result.visibility[key])).toEqual([
      'schedulePace',
      'projectedMonth',
      'remainingToGoal',
    ])
  })

  it('preserves a valid custom order and appends newly introduced cards', () => {
    const result = getEffectiveHomeDashboardCards(
      ['plannedTotal', 'schedulePace'],
      { plannedTotal: true }
    )

    expect(result.order.slice(0, 2)).toEqual(['plannedTotal', 'schedulePace'])
    expect(result.order).toHaveLength(DEFAULT_HOME_DASHBOARD_CARD_ORDER.length)
  })

  it('drops unknown and duplicate keys from persisted state', () => {
    const result = getEffectiveHomeDashboardCards(
      ['unknown', 'creditTime', 'creditTime'],
      { creditTime: true }
    )

    expect(result.order[0]).toBe('creditTime')
    expect(result.order).not.toContain('unknown')
    expect(new Set(result.order).size).toBe(result.order.length)
  })

  it('caps malformed persisted visibility at five cards in stored order', () => {
    const allVisible = Object.fromEntries(
      DEFAULT_HOME_DASHBOARD_CARD_ORDER.map((key) => [key, true])
    )
    const result = getEffectiveHomeDashboardCards(
      DEFAULT_HOME_DASHBOARD_CARD_ORDER,
      allVisible
    )

    expect(result.order.filter((key) => result.visibility[key])).toHaveLength(
      MAX_VISIBLE_HOME_DASHBOARD_CARDS
    )
    expect(result.visibility.creditTime).toBe(false)
  })

  it('preserves a valid selection instead of resetting toggled cards', () => {
    const result = getEffectiveHomeDashboardCards(
      [
        'schedulePace',
        'projectedMonth',
        'remainingToGoal',
        'plannedTotal',
        'serviceYearProgress',
        'creditTime',
      ],
      {
        schedulePace: true,
        projectedMonth: true,
        remainingToGoal: true,
        plannedTotal: true,
        serviceYearProgress: false,
        creditTime: false,
      }
    )

    expect(result.visibility.plannedTotal).toBe(true)
    expect(result.order.filter((key) => result.visibility[key])).toHaveLength(4)
  })

  it('preserves an all-disabled selection so the editor can add cards again', () => {
    const visibility = Object.fromEntries(
      DEFAULT_HOME_DASHBOARD_CARD_ORDER.map((key) => [key, false])
    )
    const result = getEffectiveHomeDashboardCards(
      DEFAULT_HOME_DASHBOARD_CARD_ORDER,
      visibility
    )

    expect(result.order.some((key) => result.visibility[key])).toBe(false)
  })

  it('moves the dashboard below This Week for the previous PR preview', () => {
    const result = getEffectiveHomeScreenOrder([
      'approachingConversations',
      'tabletServiceYearSummary',
      'ministryDashboard',
      'serviceReport',
      'thisWeek',
      'timer',
      'didYouKnow',
    ])

    expect(result).toEqual(DEFAULT_HOME_SCREEN_ELEMENTS_ORDER)
    expect(result.indexOf('ministryDashboard')).toBe(
      result.indexOf('thisWeek') + 1
    )
    expect(result.at(-1)).toBe('didYouKnow')
  })
})
