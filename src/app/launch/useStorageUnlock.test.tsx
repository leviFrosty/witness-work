import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  appState: 'background',
  listeners: new Set<(state: string) => void>(),
  locked: true,
  simulated: false,
  reopens: true,
  steps: [] as string[],
  reloadApp: vi.fn(async () => {
    runtime.steps.push('reload')
  }),
  handOffLaunchBeforeReload: vi.fn(async () => {
    runtime.steps.push('handoff')
  }),
  dropLaunchHandoff: vi.fn(),
  releaseStorageLock: vi.fn(),
}))

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return runtime.appState
    },
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.listeners.add(listener)
      return { remove: () => runtime.listeners.delete(listener) }
    },
  },
}))
vi.mock('@/stores/mmkv', () => ({
  isStorageLocked: () => runtime.locked,
  isLockedLaunchSimulated: () => runtime.simulated,
  reopenLockedStorage: () => runtime.reopens,
  releaseStorageLock: runtime.releaseStorageLock,
}))
vi.mock('@/lib/hotUpdater', () => ({ reloadApp: runtime.reloadApp }))
vi.mock('@/app/launch/reloadHandoff', () => ({
  handOffLaunchBeforeReload: runtime.handOffLaunchBeforeReload,
  dropLaunchHandoff: runtime.dropLaunchHandoff,
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { useStorageUnlock } from './useStorageUnlock'

const seen: boolean[] = []
const Harness = () => {
  seen.push(useStorageUnlock())
  return null
}
const ready = () => seen[seen.length - 1]
const becomeActive = () =>
  act(async () => {
    runtime.appState = 'active'
    for (const listener of runtime.listeners) listener('active')
  })

let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  vi.clearAllMocks()
  seen.length = 0
  runtime.steps.length = 0
  runtime.appState = 'background'
  runtime.listeners.clear()
  runtime.locked = true
  runtime.simulated = false
  runtime.reopens = true
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

it('is ready straight away when storage is open', () => {
  runtime.locked = false
  act(() => {
    renderer = create(<Harness />)
  })
  expect(ready()).toBe(true)
  expect(runtime.listeners.size).toBe(0)
})

it('waits in the background, then reloads when the unlocked app opens', async () => {
  act(() => {
    renderer = create(<Harness />)
  })
  expect(ready()).toBe(false)
  expect(runtime.reloadApp).not.toHaveBeenCalled()

  act(() => {
    for (const listener of runtime.listeners) listener('inactive')
  })
  expect(runtime.reloadApp).not.toHaveBeenCalled()

  await becomeActive()
  expect(runtime.reloadApp).toHaveBeenCalledOnce()
  expect(runtime.releaseStorageLock).not.toHaveBeenCalled()
  expect(ready()).toBe(false)
})

it('hands the tap or link that opened the app to the reloaded launch', async () => {
  act(() => {
    renderer = create(<Harness />)
  })
  await becomeActive()
  // The reloaded launch opens what brought the app up; this one only showed
  // the splash.
  expect(runtime.steps).toEqual(['handoff', 'reload'])
  expect(runtime.dropLaunchHandoff).not.toHaveBeenCalled()
})

it('forgets the handoff when the reload fails', async () => {
  runtime.reloadApp.mockRejectedValueOnce(new Error('no bridge'))
  act(() => {
    renderer = create(<Harness />)
  })
  await becomeActive()
  expect(runtime.dropLaunchHandoff).toHaveBeenCalledOnce()
  expect(ready()).toBe(false)
})

it('carries on without the data when storage still fails in the open app', () => {
  runtime.reopens = false
  runtime.appState = 'active'
  act(() => {
    renderer = create(<Harness />)
  })
  expect(runtime.reloadApp).not.toHaveBeenCalled()
  expect(runtime.releaseStorageLock).toHaveBeenCalledOnce()
  expect(ready()).toBe(true)
})

it('keeps a simulated locked launch until the app comes back', async () => {
  runtime.simulated = true
  runtime.appState = 'active'
  act(() => {
    renderer = create(<Harness />)
  })
  expect(ready()).toBe(false)
  expect(runtime.reloadApp).not.toHaveBeenCalled()

  await becomeActive()
  expect(runtime.reloadApp).toHaveBeenCalledOnce()
})
