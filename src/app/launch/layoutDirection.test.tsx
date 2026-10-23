import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const appState = vi.hoisted(() => ({
  currentState: 'active',
  handlers: new Set<(state: string) => void>(),
}))
const launch = vi.hoisted(() => ({ mismatch: false, applied: [] as string[] }))
const storage = vi.hoisted(() => ({ locked: false }))
const reloadApp = vi.hoisted(() => vi.fn(async () => {}))
const handoff = vi.hoisted(() => ({
  calls: [] as string[],
}))
// Hot Updater's launch read, settled by each test.
const hotUpdater = vi.hoisted(() => {
  const value = {
    launchRead: Promise.resolve(),
    markLaunchRead: () => {},
    reset() {
      value.launchRead = new Promise<void>((resolve) => {
        value.markLaunchRead = resolve
      })
    },
  }
  return value
})

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return appState.currentState
    },
    addEventListener: (_: string, handler: (state: string) => void) => {
      appState.handlers.add(handler)
      return { remove: () => appState.handlers.delete(handler) }
    },
  },
}))
vi.mock('@/lib/locales', () => ({ _i18n: { locale: 'en-us' } }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/hotUpdater', () => ({
  reloadApp,
  get launchRead() {
    return hotUpdater.launchRead
  },
}))
vi.mock('@/app/launch/reloadHandoff', () => ({
  restoreLaunchAfterReload: () => handoff.calls.push('restore'),
  handOffLaunchBeforeReload: async () => {
    handoff.calls.push('handOff')
  },
  dropLaunchHandoff: () => handoff.calls.push('drop'),
}))
vi.mock('@/lib/rtl', () => ({
  applyLayoutDirectionAtLaunch: (locale: string, reload: () => void) => {
    launch.applied.push(locale)
    if (launch.mismatch) reload()
    return launch.mismatch
  },
}))
vi.mock('@/stores/mmkv', () => ({
  isStorageLocked: () => storage.locked,
}))

const emit = (state: string) => {
  appState.currentState = state
  appState.handlers.forEach((handler) => handler(state))
}

/** Settles Hot Updater's launch read and lets its callbacks run. */
const readLaunch = async () => {
  hotUpdater.markLaunchRead()
  await act(async () => {})
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  appState.currentState = 'active'
  appState.handlers.clear()
  launch.mismatch = false
  launch.applied.length = 0
  storage.locked = false
  hotUpdater.reset()
  reloadApp.mockReset()
  reloadApp.mockResolvedValue(undefined)
  reloadApp.mockImplementation(async () => {
    handoff.calls.push('reload')
  })
  handoff.calls.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('isLayoutDirectionReloadDue', () => {
  it('is false when the direction matches', async () => {
    const { isLayoutDirectionReloadDue } = await import('./layoutDirection')
    expect(isLayoutDirectionReloadDue()).toBe(false)
  })

  it('is true when the launch has to reload', async () => {
    launch.mismatch = true
    const { isLayoutDirectionReloadDue } = await import('./layoutDirection')
    expect(isLayoutDirectionReloadDue()).toBe(true)
  })

  it('leaves the direction alone before the first unlock', async () => {
    // The Language is only the device's then, and storage refuses writes.
    storage.locked = true
    launch.mismatch = true
    const { isLayoutDirectionReloadDue } = await import('./layoutDirection')
    expect(launch.applied).toEqual([])
    expect(isLayoutDirectionReloadDue()).toBe(false)
  })

  it('sets the direction from the app Language once unlocked', async () => {
    await import('./layoutDirection')
    expect(launch.applied).toEqual(['en-us'])
  })
})

describe('reloadWhenReady', () => {
  async function start() {
    const mod = await import('./layoutDirection')
    const reload = vi.fn(async () => {})
    const showApp = vi.fn()
    const cleanup = mod.reloadWhenReady(reload, hotUpdater.launchRead, showApp)
    return { reload, showApp, cleanup, giveUpMs: mod.RELOAD_GIVE_UP_MS }
  }

  it('waits for Hot Updater to read the launch before reloading', async () => {
    const { reload } = await start()
    await act(async () => {})
    expect(reload).not.toHaveBeenCalled()
    await readLaunch()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(appState.handlers.size).toBe(0)
  })

  it('waits for the foreground after a background launch', async () => {
    appState.currentState = 'background'
    const { reload } = await start()
    await readLaunch()
    expect(reload).not.toHaveBeenCalled()
    emit('inactive')
    expect(reload).not.toHaveBeenCalled()
    emit('active')
    expect(reload).toHaveBeenCalledTimes(1)
    // Reloads once, and stops listening.
    emit('background')
    emit('active')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(appState.handlers.size).toBe(0)
  })

  it('needs both the foreground and the launch read', async () => {
    appState.currentState = 'background'
    const { reload } = await start()
    emit('active')
    expect(reload).not.toHaveBeenCalled()
    await readLaunch()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('shows the app if the active event never comes', async () => {
    appState.currentState = 'unknown'
    const { reload, showApp, giveUpMs } = await start()
    await readLaunch()
    vi.advanceTimersByTime(giveUpMs - 1)
    expect(showApp).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(showApp).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
    // Stops waiting: a late active event doesn't reload under the user.
    emit('active')
    expect(reload).not.toHaveBeenCalled()
    expect(appState.handlers.size).toBe(0)
  })

  it('shows the app if the launch read never ends', async () => {
    const { reload, showApp, giveUpMs } = await start()
    vi.advanceTimersByTime(giveUpMs)
    expect(showApp).toHaveBeenCalledTimes(1)
    await readLaunch()
    expect(reload).not.toHaveBeenCalled()
  })

  it('doesn’t count time in the background', async () => {
    appState.currentState = 'background'
    const { reload, showApp, giveUpMs } = await start()
    vi.advanceTimersByTime(giveUpMs * 10)
    expect(showApp).not.toHaveBeenCalled()
    // Counts from when it could be on screen.
    emit('inactive')
    vi.advanceTimersByTime(giveUpMs - 1)
    emit('background')
    vi.advanceTimersByTime(giveUpMs)
    expect(showApp).not.toHaveBeenCalled()
    await readLaunch()
    emit('active')
    expect(reload).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(giveUpMs)
    expect(showApp).not.toHaveBeenCalled()
  })

  it('stops waiting when cleaned up', async () => {
    appState.currentState = 'background'
    const { reload, showApp, cleanup, giveUpMs } = await start()
    cleanup()
    await readLaunch()
    emit('active')
    vi.advanceTimersByTime(giveUpMs)
    expect(reload).not.toHaveBeenCalled()
    expect(showApp).not.toHaveBeenCalled()
  })

  it('shows the app if the reload fails', async () => {
    const mod = await import('./layoutDirection')
    const showApp = vi.fn()
    mod.reloadWhenReady(
      () => Promise.reject(new Error('no')),
      hotUpdater.launchRead,
      showApp
    )
    await readLaunch()
    expect(showApp).toHaveBeenCalledTimes(1)
  })
})

describe('useLayoutDirectionReload', () => {
  let renderer: ReactTestRenderer | undefined
  const seen: boolean[] = []
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
    seen.length = 0
  })

  async function mount() {
    const { useLayoutDirectionReload } = await import('./layoutDirection')
    const Harness = () => {
      seen.push(useLayoutDirectionReload())
      return null
    }
    act(() => {
      renderer = create(<Harness />)
    })
  }

  it('does nothing when the direction already matches', async () => {
    await mount()
    await readLaunch()
    expect(seen.at(-1)).toBe(false)
    expect(reloadApp).not.toHaveBeenCalled()
  })

  it('keeps the splash up and reloads once the launch is read', async () => {
    launch.mismatch = true
    await mount()
    expect(seen.at(-1)).toBe(true)
    expect(reloadApp).not.toHaveBeenCalled()
    await readLaunch()
    expect(seen.at(-1)).toBe(true)
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('holds a background launch’s reload until the app comes forward', async () => {
    launch.mismatch = true
    appState.currentState = 'background'
    await mount()
    await readLaunch()
    expect(seen.at(-1)).toBe(true)
    expect(reloadApp).not.toHaveBeenCalled()
    await act(async () => emit('active'))
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('hands what launched the app to the reloaded launch', async () => {
    launch.mismatch = true
    await mount()
    await readLaunch()
    // Picked up first on every launch, then saved just before the reload.
    expect(handoff.calls).toEqual(['restore', 'handOff', 'reload'])
  })

  it('shows the app if the reload fails', async () => {
    launch.mismatch = true
    reloadApp.mockRejectedValue(new Error('no'))
    await mount()
    await readLaunch()
    expect(seen.at(-1)).toBe(false)
    // This launch opens the tap itself, so the next one mustn't again.
    expect(handoff.calls).toContain('drop')
  })

  it('shows the app if it gives up waiting', async () => {
    launch.mismatch = true
    appState.currentState = 'unknown'
    const { RELOAD_GIVE_UP_MS } = await import('./layoutDirection')
    await mount()
    await readLaunch()
    expect(seen.at(-1)).toBe(true)
    act(() => {
      vi.advanceTimersByTime(RELOAD_GIVE_UP_MS)
    })
    expect(seen.at(-1)).toBe(false)
    expect(reloadApp).not.toHaveBeenCalled()
  })
})
