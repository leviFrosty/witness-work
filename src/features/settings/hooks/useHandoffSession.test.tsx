import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appState: 'active',
  listeners: new Set<(state: string) => void>(),
}))

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mocks.appState
    },
    addEventListener: (_: string, listener: (state: string) => void) => {
      mocks.listeners.add(listener)
      return { remove: () => mocks.listeners.delete(listener) }
    },
  },
}))
vi.mock('@react-navigation/native', () => ({ useIsFocused: () => true }))
vi.mock('@/lib/syncClock', () => ({ syncNow: () => Date.now() }))

import { useHandoffCountdown } from '@/features/settings/hooks/useHandoffSession'

const START = new Date('2026-10-22T09:00:00Z').getTime()
const left: (number | null)[] = []

function Countdown({ expiresAt }: { expiresAt: number }) {
  left.push(useHandoffCountdown(expiresAt))
  return null
}

const setAppState = (state: string) =>
  act(() => {
    mocks.appState = state
    mocks.listeners.forEach((listener) => listener(state))
  })

let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  vi.setSystemTime(START)
  mocks.appState = 'active'
  mocks.listeners.clear()
  left.length = 0
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

it('counts down each second, pauses in the background, and catches up on return', () => {
  act(() => {
    renderer = create(<Countdown expiresAt={START + 300_000} />)
  })
  act(() => {
    vi.advanceTimersByTime(2000)
  })
  expect(left.at(-1)).toBe(298_000)

  setAppState('background')
  const renders = left.length
  act(() => {
    vi.advanceTimersByTime(60_000)
  })
  expect(left.length).toBe(renders)
  expect(vi.getTimerCount()).toBe(0)

  setAppState('active')
  expect(left.at(-1)).toBe(238_000)
  act(() => renderer?.unmount())
  renderer = undefined
  expect(mocks.listeners.size).toBe(0)
})
