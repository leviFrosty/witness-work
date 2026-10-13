import { beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  enabled: true,
  platform: 'ios',
  check: vi.fn(),
  alert: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
  knownOffline: false,
  prepared: false,
}))
vi.mock('react-native', () => ({
  Alert: { alert: runtime.alert },
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
}))
vi.mock('@/lib/hotUpdater', () => ({
  get otaEnabled() {
    return runtime.enabled && !__DEV__
  },
  checkHotUpdate: runtime.check,
  hasPreparedUpdate: async () => runtime.prepared,
  hotUpdater: { reload: vi.fn() },
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: runtime.captureException },
}))
vi.mock('@/lib/http/online', () => ({
  isKnownOffline: () => runtime.knownOffline,
}))

import { fetchUpdate } from './updates'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('__DEV__', false)
  runtime.enabled = true
  runtime.platform = 'ios'
  runtime.knownOffline = false
  runtime.prepared = false
  runtime.check.mockResolvedValue(null)
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
