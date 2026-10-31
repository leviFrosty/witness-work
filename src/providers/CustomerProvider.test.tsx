import React, { useContext, useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  reconnect: new Set<() => void>(),
  customer: null as unknown,
  context: null as { ready: boolean; unavailable: boolean } | null,
  os: 'ios',
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
}))
vi.mock('react-native-purchases', () => ({
  default: {
    configure: vi.fn(),
    setLogLevel: vi.fn(),
    logIn: vi.fn(async () => {
      throw new Error('The Internet connection appears to be offline.')
    }),
    getCustomerInfo: vi.fn(),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
}))
vi.mock('@/lib/account', () => ({ getOrCreateAccountId: () => 'install-a' }))
vi.mock('@/lib/installId', () => ({
  InstallIdUnavailableError: class extends Error {},
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('@/lib/serverAccount/revenueCatLinkRuntime', () => ({
  ensureRevenueCatLinked: async () => {},
}))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: () => ({ remove: () => {} }),
}))
vi.mock('@/lib/http/online', () => ({
  addReconnectListener: (listener: () => void) => {
    runtime.reconnect.add(listener)
    return { remove: () => runtime.reconnect.delete(listener) }
  },
}))

import Purchases from 'react-native-purchases'
import { errorTracking } from '@/lib/errorTracking'
import { CustomerContext } from '@/contexts/customer'
import CustomerProvider from '@/providers/CustomerProvider'

const supporter = { entitlements: { active: { pro: {} } } }
const lapsed = { entitlements: { active: {} } }

function Reader() {
  const context = useContext(CustomerContext)
  const customer = context?.customer
  useEffect(() => {
    runtime.customer = customer
    runtime.context = context
      ? { ready: context.ready, unavailable: context.unavailable }
      : null
  })
  return null
}

let renderer: ReactTestRenderer | null = null
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY', 'appl_test')
  vi.stubGlobal('__DEV__', false)
  runtime.reconnect.clear()
  runtime.customer = null
  runtime.context = null
  runtime.os = 'ios'
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('refreshes the customer when the connection comes back after an offline launch', async () => {
  // Offline: logIn fails and the SDK's cache still says Supporter.
  vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(supporter as never)
  await act(async () => {
    renderer = create(
      <CustomerProvider>
        <Reader />
      </CustomerProvider>
    )
  })
  await settle()
  expect(runtime.customer).toEqual(supporter)
  expect(runtime.reconnect.size).toBe(1)

  // Back online; the subscription lapsed meanwhile.
  vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(lapsed as never)
  await act(async () => runtime.reconnect.forEach((listener) => listener()))
  await settle()

  expect(Purchases.getCustomerInfo).toHaveBeenCalledTimes(2)
  expect(runtime.customer).toEqual(lapsed)
})

const mount = async () => {
  await act(async () => {
    renderer = create(
      <CustomerProvider>
        <Reader />
      </CustomerProvider>
    )
  })
  await settle()
}

it("configures the web as the account with RevenueCat Billing's key, keeping nothing in localStorage", async () => {
  runtime.os = 'web'
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_WEB_API_KEY', 'rcb_sb_test')
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    removeItem: (key: string) => storage.delete(key),
  })
  vi.mocked(Purchases.configure).mockImplementation(() => {
    // Browser mode saves the id on every configure.
    storage.set('revenuecat_user_id', 'install-a')
  })
  vi.mocked(Purchases.getCustomerInfo).mockResolvedValue(lapsed as never)
  await mount()
  expect(Purchases.configure).toHaveBeenCalledWith({
    apiKey: 'rcb_sb_test',
    appUserID: 'install-a',
  })
  expect(storage.size).toBe(0)
  expect(runtime.context).toEqual({ ready: true, unavailable: false })
})

it('still configures a phone anonymously, then logs in', async () => {
  await mount()
  expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'appl_test' })
  expect(Purchases.logIn).toHaveBeenCalledWith('install-a')
})

it('leaves a web build without the key unavailable, without reporting it', async () => {
  runtime.os = 'web'
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_WEB_API_KEY', '')
  await mount()
  expect(Purchases.configure).not.toHaveBeenCalled()
  expect(errorTracking.captureException).not.toHaveBeenCalled()
  expect(runtime.context).toEqual({ ready: false, unavailable: true })
})
