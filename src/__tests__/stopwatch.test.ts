import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

const { capture, reset, getState } = vi.hoisted(() => ({
  capture: vi.fn(),
  reset: vi.fn(),
  getState: vi.fn(() => ({
    startedAt: null as number | null,
    accumulatedMs: 0,
    isRunning: false,
    updatedAt: 0,
  })),
}))

vi.mock('@/lib/analytics', () => ({ analytics: { capture } }))

vi.mock('../../modules/stopwatch-bridge', () => ({
  isAvailable: () => false,
  getState,
  areLiveActivitiesEnabled: () => false,
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  reset,
  onStateChange: () => ({ remove: () => {} }),
}))

import {
  computeElapsedMs,
  formatMs,
  isSameSession,
  resetStopwatchSession,
  sessionStartMs,
  splitElapsed,
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

describe('sessionStartMs', () => {
  it('is null for an empty timer', () => {
    expect(
      sessionStartMs({
        startedAt: null,
        accumulatedMs: 0,
        isRunning: false,
        updatedAt: 500,
      })
    ).toBeNull()
  })

  it('backs a running session off by its earlier segments', () => {
    expect(
      sessionStartMs(
        {
          startedAt: 1_000,
          accumulatedMs: 30_000,
          isRunning: true,
          updatedAt: 1_000,
        },
        1_090_000
      )
    ).toBe(970_000)
  })

  it('backs a paused session off from when it was paused', () => {
    const pausedAt = new Date(2026, 9, 18, 22, 30).getTime()
    const start = sessionStartMs(
      {
        startedAt: null,
        accumulatedMs: 3_600_000,
        isRunning: false,
        updatedAt: pausedAt / 1000,
      },
      new Date(2026, 9, 19, 8, 0).getTime()
    )
    expect(start).toBe(new Date(2026, 9, 18, 21, 30).getTime())
  })

  it('is null when a paused state has no timestamp', () => {
    expect(
      sessionStartMs({
        startedAt: null,
        accumulatedMs: 120_000,
        isRunning: false,
        updatedAt: 0,
      })
    ).toBeNull()
  })
})

describe('splitElapsed', () => {
  it('splits elapsed time into hours and leftover minutes', () => {
    expect(splitElapsed(0)).toEqual({ hours: 0, minutes: 0 })
    expect(splitElapsed(59_999)).toEqual({ hours: 0, minutes: 0 })
    expect(splitElapsed((62 * 60 + 30) * 1000)).toEqual({
      hours: 1,
      minutes: 2,
    })
    expect(splitElapsed(25 * 3600 * 1000)).toEqual({ hours: 25, minutes: 0 })
  })

  it('matches the floor-and-modulo split it replaced', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000 * 3600 * 1000 }), (ms) => {
        const total = Math.floor(ms / 60000)
        expect(splitElapsed(ms)).toEqual({
          hours: Math.floor(total / 60),
          minutes: total % 60,
        })
      })
    )
  })
})

describe('isSameSession', () => {
  it('matches the same start within float drift', () => {
    expect(isSameSession(970_000, 970_000)).toBe(true)
    expect(isSameSession(970_000, 971_500)).toBe(true)
  })

  it('tells a newer session apart', () => {
    expect(isSameSession(970_000, 1_090_000)).toBe(false)
    expect(isSameSession(970_000, null)).toBe(false)
  })
})

describe('resetStopwatchSession', () => {
  const running = {
    startedAt: 1_000,
    accumulatedMs: 30_000,
    isRunning: true,
    updatedAt: 1_000,
  }
  const savedStart = 970_000
  const zero = {
    startedAt: null,
    accumulatedMs: 0,
    isRunning: false,
    updatedAt: 1,
  }

  it('resets the session Add Time saved, and records it', async () => {
    getState.mockReturnValueOnce(running)
    reset.mockResolvedValueOnce(zero)
    await expect(resetStopwatchSession(savedStart)).resolves.toEqual(zero)
    expect(reset).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith('timer_action_completed', {
      action: 'reset',
    })
  })

  it('still resets it after a pause', async () => {
    getState.mockReturnValueOnce({
      startedAt: null,
      accumulatedMs: 120_000,
      isRunning: false,
      updatedAt: 1_090,
    })
    reset.mockClear()
    reset.mockResolvedValueOnce(zero)
    await resetStopwatchSession(savedStart)
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('leaves a session started after the save alone', async () => {
    getState.mockReturnValueOnce({
      startedAt: 2_000,
      accumulatedMs: 0,
      isRunning: true,
      updatedAt: 2_000,
    })
    reset.mockClear()
    await expect(resetStopwatchSession(savedStart)).resolves.toBeNull()
    expect(reset).not.toHaveBeenCalled()
  })

  it('records a failed reset instead of throwing', async () => {
    getState.mockReturnValueOnce(running)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    reset.mockRejectedValueOnce(new Error('native'))
    await expect(resetStopwatchSession(savedStart)).resolves.toBeNull()
    expect(capture).toHaveBeenCalledWith('timer_action_failed', {
      action: 'reset',
    })
    warn.mockRestore()
  })
})
