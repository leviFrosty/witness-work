import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  appState: new Set<(state: string) => void>(),
}))

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appState.add(listener)
      return { remove: () => runtime.appState.delete(listener) }
    },
  },
}))

import useNow from '@/hooks/useNow'

let root: ReactTestRenderer | undefined
const seen: number[] = []

function Probe() {
  seen.push(useNow().now)
  return null
}

const emit = (state: string) =>
  act(() => runtime.appState.forEach((listener) => listener(state)))
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
  seen.length = 0
  vi.useRealTimers()
})

describe('useNow', () => {
  it('shares one minute clock between readers', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'))
    act(() => {
      root = create(
        <>
          <Probe />
          <Probe />
          <Probe />
        </>
      )
    })
    expect(vi.getTimerCount()).toBe(1)
    expect(runtime.appState.size).toBe(1)
    advance(60_000)
    expect(seen.slice(-3)).toEqual(Array(3).fill(Date.now()))
  })

  it('stops in the background and catches up on return', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'))
    act(() => {
      root = create(<Probe />)
    })
    emit('background')
    expect(vi.getTimerCount()).toBe(0)
    const renders = seen.length
    advance(10 * 60_000)
    expect(seen).toHaveLength(renders)

    emit('active')
    expect(seen.at(-1)).toBe(Date.now())
    expect(vi.getTimerCount()).toBe(1)
  })

  it('lets go of the clock when the last reader unmounts', () => {
    vi.useFakeTimers()
    act(() => {
      root = create(<Probe />)
    })
    act(() => root?.unmount())
    root = undefined
    expect(vi.getTimerCount()).toBe(0)
    expect(runtime.appState.size).toBe(0)
  })

  it('gives a new reader the time now', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'))
    act(() => {
      root = create(<Probe />)
    })
    act(() => root?.unmount())
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    act(() => {
      root = create(<Probe />)
    })
    expect(seen.at(-1)).toBe(Date.now())
  })
})
