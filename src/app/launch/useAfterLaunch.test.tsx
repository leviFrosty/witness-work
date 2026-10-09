import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const idle = vi.hoisted(() => ({ callbacks: [] as (() => void)[] }))

let markLaunched: () => void
let useAfterLaunch: typeof import('./useAfterLaunch').useAfterLaunch
let LAUNCH_IDLE_TIMEOUT_MS: number

const seen: Record<string, boolean[]> = {}
const Harness = () => {
  seen.firstScreen.push(useAfterLaunch('firstScreen'))
  seen.idle.push(useAfterLaunch('idle'))
  seen.delayed.push(useAfterLaunch(2_000))
  return null
}
const IdlePair = () => {
  seen.idle.push(useAfterLaunch('idle'))
  seen.secondIdle.push(useAfterLaunch('idle'))
  return null
}
const latest = (key: string) => seen[key][seen[key].length - 1]

let renderer: ReactTestRenderer | undefined
beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  idle.callbacks = []
  vi.stubGlobal(
    'requestIdleCallback',
    (callback: () => void, options?: { timeout?: number }) => {
      idle.callbacks.push(callback)
      return setTimeout(callback, options?.timeout ?? 0)
    }
  )
  vi.stubGlobal('cancelIdleCallback', (handle: number) => clearTimeout(handle))
  ;({ markLaunched } = await import('./launchState'))
  ;({ useAfterLaunch, LAUNCH_IDLE_TIMEOUT_MS } = await import(
    './useAfterLaunch'
  ))
  seen.firstScreen = []
  seen.idle = []
  seen.secondIdle = []
  seen.delayed = []
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('holds launch work until the first screen is up', async () => {
  await act(async () => {
    renderer = create(<Harness />)
  })
  await act(async () => {
    vi.advanceTimersByTime(5_000)
  })
  expect(latest('firstScreen')).toBe(false)
  expect(latest('idle')).toBe(false)
  expect(latest('delayed')).toBe(false)
})

it('starts each stage in turn after the first screen', async () => {
  await act(async () => {
    renderer = create(<Harness />)
  })
  await act(async () => markLaunched())
  expect(latest('firstScreen')).toBe(true)
  expect(latest('idle')).toBe(false)

  await act(async () => idle.callbacks.forEach((callback) => callback()))
  expect(latest('idle')).toBe(true)
  expect(latest('delayed')).toBe(false)

  await act(async () => {
    vi.advanceTimersByTime(2_000)
  })
  expect(latest('delayed')).toBe(true)
})

it('starts idle work by the timeout even if the JS thread stays busy', async () => {
  await act(async () => {
    renderer = create(<Harness />)
  })
  await act(async () => markLaunched())
  await act(async () => {
    vi.advanceTimersByTime(LAUNCH_IDLE_TIMEOUT_MS)
  })
  expect(latest('idle')).toBe(true)
})

it('starts each idle piece in its own idle period', async () => {
  await act(async () => {
    renderer = create(<IdlePair />)
  })
  await act(async () => markLaunched())
  const fireIdle = async () => {
    const pending = idle.callbacks
    idle.callbacks = []
    await act(async () => {
      pending.forEach((callback) => callback())
      vi.advanceTimersByTime(0)
    })
  }
  await fireIdle()
  expect(latest('idle')).toBe(true)
  expect(latest('secondIdle')).toBe(false)
  await fireIdle()
  expect(latest('secondIdle')).toBe(true)
})
