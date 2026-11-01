import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  offline: true,

  cached: false,

  identified: false,
  appStateListeners: [] as Array<(state: string) => void>,
  reconnectListeners: new Set<() => void>(),
  links: [] as unknown[],
}))

const offlineError = () =>
  new Error('The Internet connection appears to be offline.')

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appStateListeners.push(listener)
      return { remove: () => {} }
    },
  },
}))
vi.mock('react-native-purchases', () => ({
  default: {
    configure: vi.fn(),
    setLogLevel: vi.fn(),
    logIn: vi.fn(async () => {
      if (runtime.offline) throw offlineError()
      runtime.identified = true
      return {
        customerInfo: { entitlements: { active: {} } },
        created: false,
      }
    }),
    getCustomerInfo: vi.fn(async () => {
      if (runtime.offline && !runtime.cached) throw offlineError()
      return { entitlements: { active: {} } }
    }),
    isAnonymous: vi.fn(async () => !runtime.identified),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
}))
vi.mock('@/lib/http/online', () => ({
  addReconnectListener: (listener: () => void) => {
    runtime.reconnectListeners.add(listener)
    return { remove: () => runtime.reconnectListeners.delete(listener) }
  },
}))
vi.mock('@/lib/syncTransport', () => ({ hasSyncTransport: () => false }))
vi.mock('@/lib/installId', () => {
  class InstallIdUnavailableError extends Error {}
  return { InstallIdUnavailableError }
})
vi.mock('@/lib/account', () => ({
  getOrCreateAccountId: () => 'install-a',
  adoptAccountId: vi.fn(),
  readAccountFile: vi.fn(),
  writeAccountFile: vi.fn(),
}))
vi.mock('@/lib/iCloudIdentity', () => ({ checkICloudIdentity: () => true }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), addBreadcrumb: vi.fn() },
}))
vi.mock('@/lib/serverAccount/revenueCatLinkRuntime', () => ({
  ensureRevenueCatLinked: async (options: unknown) => {
    runtime.links.push(options)
  },
}))

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

const reconnect = async () => {
  runtime.offline = false
  await act(async () => runtime.reconnectListeners.forEach((l) => l()))
  await settle()
}

const foreground = async () => {
  await act(async () => {
    for (const state of ['background', 'active'])
      runtime.appStateListeners.forEach((listener) => listener(state))
  })
  await settle()
}

const forcedLinks = () =>
  runtime.links.filter((link) => (link as { force?: boolean }).force)

let renderer: ReactTestRenderer | null = null

const mount = async () => {
  const { default: CustomerProvider } = await import('./CustomerProvider')
  const { default: AccountProvider } = await import('./AccountProvider')
  const { default: Purchases } = await import('react-native-purchases')
  const { errorTracking } = await import('@/lib/errorTracking')
  await act(async () => {
    renderer = create(
      <CustomerProvider>
        <AccountProvider />
      </CustomerProvider>
    )
  })
  await settle()
  return { Purchases, errorTracking }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY', 'appl_test')
  vi.stubGlobal('__DEV__', false)
  runtime.offline = true
  runtime.cached = false
  runtime.identified = false
  runtime.appStateListeners = []
  runtime.reconnectListeners = new Set()
  runtime.links = []
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('a first launch offline', () => {
  it('logs in and links once when the connection comes back', async () => {
    const { Purchases, errorTracking } = await mount()
    expect(Purchases.logIn).toHaveBeenCalledTimes(1)
    expect(runtime.identified).toBe(false)

    await reconnect()

    expect(Purchases.logIn).toHaveBeenCalledTimes(2)
    expect(Purchases.logIn).toHaveBeenLastCalledWith('install-a')
    expect(runtime.identified).toBe(true)
    expect(forcedLinks()).toEqual([{ force: true, reason: 'adopted' }])
    expect(errorTracking.captureException).not.toHaveBeenCalled()

    runtime.offline = true
    await reconnect()
    await foreground()
    expect(Purchases.logIn).toHaveBeenCalledTimes(2)
    expect(forcedLinks()).toHaveLength(1)
  })

  it('logs in on the next return to the app when the SDK had a cached customer', async () => {
    runtime.cached = true
    const { Purchases, errorTracking } = await mount()

    expect(Purchases.logIn).toHaveBeenCalledTimes(2)

    await foreground()
    expect(Purchases.logIn).toHaveBeenCalledTimes(3)
    expect(runtime.identified).toBe(false)

    runtime.offline = false
    await foreground()
    expect(Purchases.logIn).toHaveBeenCalledTimes(4)
    expect(runtime.identified).toBe(true)

    await foreground()
    expect(Purchases.logIn).toHaveBeenCalledTimes(4)
    expect(errorTracking.captureException).not.toHaveBeenCalled()
    expect(forcedLinks()).toEqual([{ force: true, reason: 'adopted' }])
  })

  it('does not log in again after an online launch', async () => {
    runtime.offline = false
    const { Purchases } = await mount()
    await foreground()
    await reconnect()

    expect(Purchases.logIn).toHaveBeenCalledTimes(1)
    expect(forcedLinks()).toEqual([])
  })
})
