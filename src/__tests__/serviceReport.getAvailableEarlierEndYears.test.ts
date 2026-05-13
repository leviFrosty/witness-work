import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import { getAvailableEarlierEndYears } from '@/lib/serviceReport'

describe('getAvailableEarlierEndYears', () => {
  it('returns years from (current - floor) up to (earliest - 1), descending, excluding any already-present year', () => {
    expect(getAvailableEarlierEndYears([2024, 2025, 2026], 2026, 5)).toEqual([
      2023, 2022, 2021,
    ])
  })

  it('returns empty array when earliest is already at or below the floor', () => {
    expect(
      getAvailableEarlierEndYears([2021, 2022, 2023, 2024, 2025, 2026], 2026, 5)
    ).toEqual([])
  })

  it('returns empty array when endYears is empty (no reports)', () => {
    expect(getAvailableEarlierEndYears([], 2026, 100)).toEqual([])
  })

  it('excludes interior years already present (defensive: span is normally continuous)', () => {
    expect(getAvailableEarlierEndYears([2020, 2026], 2026, 10)).toEqual([
      2019, 2018, 2017, 2016,
    ])
  })

  it('respects a 100-year floor', () => {
    expect(getAvailableEarlierEndYears([2026], 2026, 100).slice(0, 3)).toEqual([
      2025, 2024, 2023,
    ])
    expect(getAvailableEarlierEndYears([2026], 2026, 100).slice(-1)).toEqual([
      1926,
    ])
  })
})
