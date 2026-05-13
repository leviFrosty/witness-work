import { describe, expect, it, vi } from 'vitest'

// Mock the native module so vitest doesn't try to resolve `expo-modules-core`.
vi.mock('../../modules/stopwatch-bridge', () => ({
  isAvailable: () => false,
  getState: () => ({
    startedAt: null,
    accumulatedMs: 0,
    isRunning: false,
    updatedAt: 0,
  }),
  areLiveActivitiesEnabled: () => false,
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
  onStateChange: () => ({ remove: () => {} }),
}))

import {
  computeElapsedMs,
  formatMs,
} from '@/features/service-reports/hooks/useStopWatch'

describe('formatMs', () => {
  it('pads hours/minutes/seconds', () => {
    expect(formatMs(0)).toBe('00:00:00')
    expect(formatMs(1000)).toBe('00:00:01')
    expect(formatMs(61 * 1000)).toBe('00:01:01')
    expect(formatMs(3600 * 1000)).toBe('01:00:00')
    expect(formatMs(3661 * 1000)).toBe('01:01:01')
  })

  it('does not roll hours at 24h', () => {
    expect(formatMs(25 * 3600 * 1000)).toBe('25:00:00')
  })
})

describe('computeElapsedMs', () => {
  it('returns accumulated when not running', () => {
    expect(
      computeElapsedMs(
        {
          startedAt: null,
          accumulatedMs: 5000,
          isRunning: false,
          updatedAt: 0,
        },
        1_000_000
      )
    ).toBe(5000)
  })

  it('adds current segment when running', () => {
    // startedAt is unix seconds; nowMs is unix ms.
    // startedAt = 100s, now = 105_000ms → 5000ms segment + accumulated.
    expect(
      computeElapsedMs(
        {
          startedAt: 100,
          accumulatedMs: 2000,
          isRunning: true,
          updatedAt: 0,
        },
        105_000
      )
    ).toBe(7000)
  })

  it('clamps negative segment to zero (clock skew)', () => {
    expect(
      computeElapsedMs(
        {
          startedAt: 200,
          accumulatedMs: 1000,
          isRunning: true,
          updatedAt: 0,
        },
        100_000
      )
    ).toBe(1000)
  })

  it('treats missing startedAt as paused', () => {
    expect(
      computeElapsedMs(
        {
          startedAt: null,
          accumulatedMs: 42,
          isRunning: true,
          updatedAt: 0,
        },
        999_999
      )
    ).toBe(42)
  })
})
