import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StopwatchState } from '../../../../modules/stopwatch-bridge'

vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('../../../../modules/stopwatch-bridge', () => ({
  isAvailable: () => false,
  getState: vi.fn(),
  onStateChange: () => ({ remove: () => {} }),
}))

import {
  useElapsedMs,
  useElapsedReached,
} from '@/features/service-reports/hooks/useStopWatch'

const START_S = 1_000
const running: StopwatchState = {
  startedAt: START_S,
  accumulatedMs: 0,
  isRunning: true,
  updatedAt: START_S,
}

let root: ReactTestRenderer | undefined
let renders = 0
const seen: unknown[] = []

function Readout({ state, live }: { state: StopwatchState; live: boolean }) {
  renders++
  seen.push(useElapsedMs(state, live))
  return null
}
function Reached({ state }: { state: StopwatchState }) {
  renders++
  seen.push(useElapsedReached(state, 60_000))
  return null
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  renders = 0
  seen.length = 0
  vi.useRealTimers()
})

describe('useElapsedMs', () => {
  it('ticks every second while live, and stops while not', () => {
    vi.useFakeTimers()
    vi.setSystemTime(START_S * 1000 + 5_000)
    act(() => {
      root = create(<Readout state={running} live />)
    })
    expect(seen.at(-1)).toBe(5_000)
    advance(3_000)
    expect(seen.at(-1)).toBe(8_000)

    act(() => root!.update(<Readout state={running} live={false} />))
    const before = renders
    advance(10_000)
    expect(renders).toBe(before)

    // Back on screen: catches up at once.
    act(() => root!.update(<Readout state={running} live />))
    expect(seen.at(-1)).toBe(18_000)
  })

  it('stays still while paused', () => {
    vi.useFakeTimers()
    const paused = { ...running, startedAt: null, isRunning: false }
    act(() => {
      root = create(
        <Readout state={{ ...paused, accumulatedMs: 42_000 }} live />
      )
    })
    advance(5_000)
    expect(renders).toBe(1)
    expect(seen).toEqual([42_000])
  })
})

describe('useElapsedReached', () => {
  it('re-renders once, when a running timer reaches the threshold', () => {
    vi.useFakeTimers()
    vi.setSystemTime(START_S * 1000 + 20_000)
    act(() => {
      root = create(<Reached state={running} />)
    })
    expect(seen).toEqual([false])
    advance(39_000)
    expect(renders).toBe(1)
    advance(1_000)
    expect(seen).toEqual([false, true])
    advance(60_000)
    expect(renders).toBe(2)
  })

  it('reads a paused total without a timer', () => {
    vi.useFakeTimers()
    const paused = { ...running, startedAt: null, isRunning: false }
    act(() => {
      root = create(<Reached state={{ ...paused, accumulatedMs: 61_000 }} />)
    })
    expect(seen).toEqual([true])
    expect(vi.getTimerCount()).toBe(0)
  })
})
