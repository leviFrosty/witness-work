import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  enabled: true,
  platform: 'ios',
  check: vi.fn(),
  alert: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
  knownOffline: false,
  prepared: false,
  calls: [] as string[],
  appState: 'active',
  appStateListeners: [] as ((state: string) => void)[],
  launchRead: Promise.resolve(),
}))
vi.mock('react-native', () => ({
  Alert: { alert: runtime.alert },
  AppState: {
    get currentState() {
      return runtime.appState
    },
    addEventListener(_: string, listener: (state: string) => void) {
      runtime.appStateListeners.push(listener)
      return { remove: vi.fn() }
    },
  },
  Platform: {
    get OS() {
      return runtime.platform
    },
    select(specifics: Record<string, unknown>) {
      return this.OS in specifics ? specifics[this.OS] : specifics.default
    },
  },
}))
vi.mock('@/lib/hotUpdater', () => ({
  get otaEnabled() {
    return runtime.enabled && !__DEV__
  },
  get launchRead() {
    return runtime.launchRead
  },
  checkHotUpdate: runtime.check,
  hasPreparedUpdate: async () => runtime.prepared,
  preparedUpdateId: async () => (runtime.prepared ? 'staged' : null),
  reloadApp: async () => {
    runtime.calls.push('reload')
  },
  hotUpdater: { reload: vi.fn() },
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({
  analytics: {
    capture: runtime.capture,
    flush: async () => {
      runtime.calls.push('flush')
    },
  },
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: runtime.captureException },
}))
vi.mock('@/lib/http/online', () => ({
  isKnownOffline: () => runtime.knownOffline,
}))

import { usePendingUpdate } from '@/features/updates/stores/pendingUpdate'
import {
  applyPendingUpdate,
  checkForUpdateInBackground,
  fetchUpdate,
} from './updates'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('__DEV__', false)
  runtime.enabled = true
  runtime.platform = 'ios'
  runtime.knownOffline = false
  runtime.prepared = false
  runtime.calls = []
  runtime.check.mockResolvedValue(null)
  usePendingUpdate.setState({ bundleId: null })
})

it('checks Hot Updater and enters the existing Update screen only for an available update', async () => {
  runtime.check.mockResolvedValue({ id: 'test-update', updateBundle: vi.fn() })
  const navigate = vi.fn()
  expect(await fetchUpdate(navigate)).toBe('available')
  expect(runtime.check).toHaveBeenCalledOnce()
  expect(navigate).toHaveBeenCalledWith('Update')
  expect(runtime.capture).not.toHaveBeenCalled()
})

it('reports up-to-date without opening the download screen', async () => {
  const navigate = vi.fn()
  expect(await fetchUpdate(navigate)).toBe('up_to_date')
  expect(navigate).not.toHaveBeenCalled()
  expect(runtime.alert).toHaveBeenCalledWith('noUpdateAvailable')
})

it.each(['development', 'disabled'])(
  'avoids unsupported checks in a %s build',
  async (build) => {
    vi.stubGlobal('__DEV__', build === 'development')
    runtime.enabled = build !== 'disabled'
    expect(await fetchUpdate(vi.fn())).toBe('unavailable')
    expect(runtime.check).not.toHaveBeenCalled()
    expect(runtime.alert).toHaveBeenCalledWith('updatesUnavailable')
  }
)

it('prevents simultaneous checks from Settings and the menu bar', async () => {
  let finish: (value: null) => void = () => {}
  runtime.check.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const pending = fetchUpdate(vi.fn())
  expect(await fetchUpdate(vi.fn())).toBe('busy')
  expect(runtime.check).toHaveBeenCalledOnce()
  finish(null)
  await pending
  expect(await fetchUpdate(vi.fn())).toBe('up_to_date')
})

it.each(['ios', 'android'])(
  'handles failures with %s store copy and bounded analytics',
  async (platform) => {
    runtime.platform = platform
    const error = new Error('private network details')
    runtime.check.mockRejectedValue(error)
    expect(await fetchUpdate(vi.fn())).toBe('failed')
    expect(runtime.alert).toHaveBeenCalledWith(
      platform === 'android' ? 'updateViaTheStoreAndroid' : 'updateViaTheStore',
      'update_error'
    )
    expect(runtime.capture).not.toHaveBeenCalled()
    expect(runtime.captureException).toHaveBeenCalledWith(error)
  }
)

it('tells an offline user to connect instead of updating through the store', async () => {
  runtime.check.mockRejectedValue(
    new Error('The Internet connection appears to be offline.')
  )
  expect(await fetchUpdate(vi.fn())).toBe('offline')
  expect(runtime.alert).toHaveBeenCalledWith(
    'common_offlineTitle',
    'update_offline'
  )
  expect(runtime.captureException).not.toHaveBeenCalled()
})

it('skips the check when the OS already reports no connection', async () => {
  runtime.knownOffline = true
  expect(await fetchUpdate(vi.fn())).toBe('offline')
  expect(runtime.check).not.toHaveBeenCalled()
})

it('restarts into an already staged startup update instead of saying up to date', async () => {
  runtime.prepared = true
  const navigate = vi.fn()
  expect(await fetchUpdate(navigate)).toBe('available')
  expect(navigate).toHaveBeenCalledWith('Update')
  expect(runtime.alert).not.toHaveBeenCalled()
})

it('adopts metadata for the running artifact without requesting a restart', async () => {
  const updateBundle = vi.fn().mockResolvedValue(true)
  runtime.check.mockResolvedValue({
    transitionKind: 'ADOPT_RELEASE',
    updateBundle,
  })
  const navigate = vi.fn()
  expect(await fetchUpdate(navigate)).toBe('up_to_date')
  expect(updateBundle).toHaveBeenCalledOnce()
  expect(navigate).not.toHaveBeenCalled()
})

it('lists an update a background check downloaded in the tray', async () => {
  const updateBundle = vi.fn().mockImplementation(async () => {
    runtime.prepared = true
    return true
  })
  runtime.check.mockResolvedValue({ transitionKind: 'INSTALL', updateBundle })
  await checkForUpdateInBackground()
  expect(updateBundle).toHaveBeenCalledOnce()
  expect(usePendingUpdate.getState().bundleId).toBe('staged')
})

it('keeps an update the Update screen downloaded in the tray', async () => {
  runtime.prepared = true
  runtime.check.mockResolvedValue({ updateBundle: async () => true })
  const navigate = vi.fn()
  expect(await fetchUpdate(navigate)).toBe('available')
  const { downloadSelectedUpdate } = await import('./updates')
  expect(await downloadSelectedUpdate()).toBe(true)
  expect(usePendingUpdate.getState().bundleId).toBe('staged')
})

it('sends Update Now before the restart can drop it', async () => {
  runtime.capture.mockImplementation((event: string) =>
    runtime.calls.push(event)
  )
  await applyPendingUpdate()
  expect(runtime.calls).toEqual(['pending_update_applied', 'flush', 'reload'])
})

it('skips a background check while offline or while the Update screen downloads', async () => {
  runtime.knownOffline = true
  await checkForUpdateInBackground()
  expect(runtime.check).not.toHaveBeenCalled()
  runtime.knownOffline = false

  let finish: (value: boolean) => void = () => {}
  const updateBundle = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
  )
  runtime.check.mockResolvedValueOnce({ updateBundle })
  const { downloadSelectedUpdate } = await import('./updates')
  const download = downloadSelectedUpdate()
  await vi.waitFor(() => expect(updateBundle).toHaveBeenCalledOnce())
  await checkForUpdateInBackground()
  expect(runtime.check).toHaveBeenCalledOnce()
  finish(true)
  await download
})

it('shares one background check between callers', async () => {
  let finish: (value: null) => void = () => {}
  runtime.check.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const first = checkForUpdateInBackground()
  const second = checkForUpdateInBackground()
  finish(null)
  await Promise.all([first, second])
  expect(runtime.check).toHaveBeenCalledOnce()
})

describe('background check failures', () => {
  beforeEach(() => vi.resetModules())

  it('stay silent and report once per run', async () => {
    const { checkForUpdateInBackground: check } = await import('./updates')
    runtime.check.mockRejectedValue(new Error('stale catalog'))
    await check()
    await check()
    expect(runtime.check).toHaveBeenCalledTimes(2)
    expect(runtime.captureException).toHaveBeenCalledOnce()
    expect(runtime.alert).not.toHaveBeenCalled()
  })

  it('never report a lost connection', async () => {
    const { checkForUpdateInBackground: check } = await import('./updates')
    runtime.check.mockRejectedValue(
      new Error('The Internet connection appears to be offline.')
    )
    await check()
    expect(runtime.captureException).not.toHaveBeenCalled()
  })
})

describe('startUpdateChecks', () => {
  const MINUTE = 60_000
  const changeAppState = (state: string) => {
    runtime.appState = state
    runtime.appStateListeners.forEach((listener) => listener(state))
  }
  const startChecks = async () => {
    vi.resetModules()
    const { startUpdateChecks } = await import('./updates')
    startUpdateChecks()
    return startUpdateChecks
  }

  beforeEach(() => {
    vi.useFakeTimers()
    runtime.appState = 'active'
    runtime.appStateListeners = []
    runtime.launchRead = Promise.resolve()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('checks once the launch is confirmed, not before', async () => {
    let confirmLaunch = () => {}
    runtime.launchRead = new Promise((resolve) => {
      confirmLaunch = resolve
    })
    const start = await startChecks()
    start()
    await vi.advanceTimersByTimeAsync(9_000)
    expect(runtime.check).not.toHaveBeenCalled()
    confirmLaunch()
    await vi.advanceTimersByTimeAsync(2_999)
    expect(runtime.check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.check).toHaveBeenCalledOnce()
  })

  it('still checks when the launch is never confirmed', async () => {
    runtime.launchRead = new Promise(() => {})
    await startChecks()
    await vi.advanceTimersByTimeAsync(13_000)
    expect(runtime.check).toHaveBeenCalledOnce()
  })

  it('polls every 4 minutes in the foreground', async () => {
    await startChecks()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(runtime.check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4 * MINUTE)
    expect(runtime.check).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(4 * MINUTE)
    expect(runtime.check).toHaveBeenCalledTimes(3)
  })

  it('stops polling in the background and checks on return once due', async () => {
    await startChecks()
    await vi.advanceTimersByTimeAsync(3_000)
    changeAppState('background')
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(runtime.check).toHaveBeenCalledTimes(1)
    changeAppState('active')
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.check).toHaveBeenCalledTimes(2)
  })

  it('does not check on a quick return to the app', async () => {
    await startChecks()
    await vi.advanceTimersByTimeAsync(3_000)
    changeAppState('background')
    await vi.advanceTimersByTimeAsync(MINUTE)
    changeAppState('active')
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.check).toHaveBeenCalledTimes(1)
  })

  it('waits for the app to open after a launch in the background', async () => {
    runtime.appState = 'background'
    await startChecks()
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(runtime.check).not.toHaveBeenCalled()
    changeAppState('active')
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.check).toHaveBeenCalledOnce()
  })

  it('does nothing in a build without OTA', async () => {
    runtime.enabled = false
    await startChecks()
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(runtime.check).not.toHaveBeenCalled()
    expect(runtime.appStateListeners).toEqual([])
  })
})
