import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  platform: 'android',
  native: null as Record<string, unknown> | null,
  persisted: new Map<string, string>(),
  foregroundListeners: new Set<(state: string) => void>(),
  storageInstances: 0,
}))

vi.mock('expo-modules-core', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
  requireOptionalNativeModule: () => runtime.native,
}))

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      runtime.foregroundListeners.add(listener)
      return { remove: () => runtime.foregroundListeners.delete(listener) }
    },
  },
}))

vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    constructor() {
      runtime.storageInstances += 1
    }
    getString(key: string) {
      return runtime.persisted.get(key)
    }
    set(key: string, value: string) {
      runtime.persisted.set(key, value)
    }
  },
}))

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  runtime.platform = 'android'
  runtime.native = null
  runtime.persisted.clear()
  runtime.foregroundListeners.clear()
  runtime.storageInstances = 0
})

afterEach(() => vi.useRealTimers())

describe('Android stopwatch', () => {
  it('is available without an iOS native module or Live Activities', async () => {
    const stopwatch = await import('./index')
    expect(stopwatch.isAvailable()).toBe(true)
    expect(stopwatch.areLiveActivitiesEnabled()).toBe(false)
  })

  it('accumulates running segments across pause, resume and stop', async () => {
    const stopwatch = await import('./index')
    expect(await stopwatch.start()).toMatchObject({
      isRunning: true,
      startedAt: 100,
      accumulatedMs: 0,
    })
    vi.setSystemTime(110_500)
    expect(await stopwatch.pause()).toMatchObject({
      isRunning: false,
      startedAt: null,
      accumulatedMs: 10_500,
    })
    vi.setSystemTime(120_000)
    expect(await stopwatch.resume()).toMatchObject({
      isRunning: true,
      startedAt: 120,
      accumulatedMs: 10_500,
    })
    vi.setSystemTime(125_000)
    expect(await stopwatch.stop()).toMatchObject({
      isRunning: false,
      accumulatedMs: 15_500,
    })
    expect(stopwatch.getState().accumulatedMs).toBe(15_500)
  })

  it('does not restart an active segment or accrue time while paused', async () => {
    const stopwatch = await import('./index')
    const started = await stopwatch.start()
    vi.setSystemTime(105_000)
    expect(await stopwatch.start()).toEqual(started)
    expect(await stopwatch.resume()).toEqual(started)
    const paused = await stopwatch.pause()
    expect(paused.accumulatedMs).toBe(5_000)
    vi.setSystemTime(200_000)
    expect(await stopwatch.pause()).toEqual(paused)
    expect(await stopwatch.stop()).toEqual(paused)
  })

  it('restores a running timer after process restart without background ticks', async () => {
    let stopwatch = await import('./index')
    await stopwatch.start()
    vi.resetModules()
    vi.setSystemTime(3_700_000)
    stopwatch = await import('./index')
    expect(stopwatch.getState()).toMatchObject({
      isRunning: true,
      startedAt: 100,
    })
    expect((await stopwatch.pause()).accumulatedMs).toBe(3_600_000)
    await stopwatch.reset()
    vi.resetModules()
    stopwatch = await import('./index')
    expect(stopwatch.getState()).toEqual({
      isRunning: false,
      startedAt: null,
      accumulatedMs: 0,
      updatedAt: 3_700,
    })
  })

  it('clamps elapsed time if the clock moves backward', async () => {
    const stopwatch = await import('./index')
    await stopwatch.start()
    vi.setSystemTime(90_000)
    expect((await stopwatch.pause()).accumulatedMs).toBe(0)
    vi.setSystemTime(110_000)
    await stopwatch.resume()
    vi.setSystemTime(115_000)
    expect((await stopwatch.stop()).accumulatedMs).toBe(5_000)
  })

  it.each(['invalid JSON', '{"isRunning":true}'])(
    'can start again when persisted data is damaged: %s',
    async (encoded) => {
      let stopwatch = await import('./index')
      await stopwatch.start()
      for (const key of runtime.persisted.keys()) {
        runtime.persisted.set(key, encoded)
      }
      vi.resetModules()
      stopwatch = await import('./index')
      expect(stopwatch.getState().isRunning).toBe(false)
      expect((await stopwatch.start()).isRunning).toBe(true)
    }
  )

  it('notifies active subscribers on commands and foreground, then unsubscribes', async () => {
    const stopwatch = await import('./index')
    const listener = vi.fn()
    const otherListener = vi.fn()
    const subscription = stopwatch.onStateChange(listener)
    const otherSubscription = stopwatch.onStateChange(otherListener)
    const started = await stopwatch.start()
    expect(listener).toHaveBeenLastCalledWith(started)
    expect(otherListener).toHaveBeenLastCalledWith(started)
    subscription.remove()
    vi.setSystemTime(105_000)
    const paused = await stopwatch.pause()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(otherListener).toHaveBeenLastCalledWith(paused)
    for (const foreground of runtime.foregroundListeners) foreground('active')
    expect(otherListener).toHaveBeenCalledTimes(3)
    otherSubscription.remove()
    expect(runtime.foregroundListeners.size).toBe(0)
    await stopwatch.reset()
    expect(otherListener).toHaveBeenCalledTimes(3)
  })
})

describe('iOS stopwatch', () => {
  it('preserves the unavailable state when the native module is absent', async () => {
    runtime.platform = 'ios'
    const stopwatch = await import('./index')
    expect(stopwatch.isAvailable()).toBe(false)
    expect(stopwatch.areLiveActivitiesEnabled()).toBe(false)
    expect((await stopwatch.start()).isRunning).toBe(false)
    expect(runtime.storageInstances).toBe(0)
  })

  it('continues delegating state, commands and Live Activities to the native module', async () => {
    runtime.platform = 'ios'
    const state = {
      startedAt: 80,
      accumulatedMs: 5_000,
      isRunning: true,
      updatedAt: 80,
    }
    const remove = vi.fn()
    const native = {
      getState: vi.fn(() => state),
      areLiveActivitiesEnabled: vi.fn(() => true),
      start: vi.fn(async () => state),
      pause: vi.fn(async () => state),
      resume: vi.fn(async () => state),
      stop: vi.fn(async () => state),
      reset: vi.fn(async () => state),
      addListener: vi.fn(() => ({ remove })),
    }
    runtime.native = native
    const stopwatch = await import('./index')
    expect(stopwatch.isAvailable()).toBe(true)
    expect(stopwatch.getState()).toBe(state)
    expect(stopwatch.areLiveActivitiesEnabled()).toBe(true)
    for (const command of [
      'start',
      'pause',
      'resume',
      'stop',
      'reset',
    ] as const) {
      expect(await stopwatch[command]()).toBe(state)
      expect(native[command]).toHaveBeenCalledOnce()
    }
    const listener = vi.fn()
    stopwatch.onStateChange(listener).remove()
    expect(native.addListener).toHaveBeenCalledWith('onStateChange', listener)
    expect(remove).toHaveBeenCalledOnce()
    expect(runtime.storageInstances).toBe(0)
  })
})
