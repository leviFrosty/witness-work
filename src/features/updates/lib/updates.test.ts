import { beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  enabled: true,
  platform: 'ios',
  check: vi.fn(),
  alert: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
}))
vi.mock('react-native', () => ({
  Alert: { alert: runtime.alert },
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
}))
vi.mock('expo-updates', () => ({
  get isEnabled() {
    return runtime.enabled
  },
  checkForUpdateAsync: runtime.check,
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: runtime.captureException },
}))

import { fetchUpdate } from './updates'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('__DEV__', false)
  runtime.enabled = true
  runtime.platform = 'ios'
  runtime.check.mockResolvedValue({ isAvailable: false })
})

it('checks Expo and enters the existing Update screen only for an available update', async () => {
  runtime.check.mockResolvedValue({ isAvailable: true })
  const navigate = vi.fn()
  expect(await fetchUpdate(navigate, 'menu_bar')).toBe('available')
  expect(runtime.check).toHaveBeenCalledOnce()
  expect(navigate).toHaveBeenCalledWith('Update')
  expect(runtime.capture).toHaveBeenCalledWith('update_check_completed', {
    source: 'menu_bar',
    outcome: 'available',
  })
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
  let finish: (value: { isAvailable: boolean }) => void = () => {}
  runtime.check.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const pending = fetchUpdate(vi.fn(), 'settings')
  expect(await fetchUpdate(vi.fn(), 'menu_bar')).toBe('busy')
  expect(runtime.check).toHaveBeenCalledOnce()
  finish({ isAvailable: false })
  await pending
  expect(await fetchUpdate(vi.fn())).toBe('up_to_date')
})

it.each(['ios', 'android'])(
  'handles failures with %s store copy and bounded analytics',
  async (platform) => {
    runtime.platform = platform
    const error = new Error('private network details')
    runtime.check.mockRejectedValue(error)
    expect(await fetchUpdate(vi.fn(), 'menu_bar')).toBe('failed')
    expect(runtime.alert).toHaveBeenCalledWith(
      platform === 'android' ? 'updateViaTheStoreAndroid' : 'updateViaTheStore',
      'update_error'
    )
    expect(runtime.capture).toHaveBeenCalledWith('update_check_failed', {
      source: 'menu_bar',
      error_code: 'check_failed',
    })
    expect(runtime.captureException).toHaveBeenCalledWith(error)
  }
)
