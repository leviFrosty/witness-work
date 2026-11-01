import React, { useContext, useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  reconnect: new Set<() => void>(),
  customer: null as unknown,
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
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
import { CustomerContext } from '@/contexts/customer'
import CustomerProvider from '@/providers/CustomerProvider'

const supporter = { entitlements: { active: { pro: {} } } }
const lapsed = { entitlements: { active: {} } }

function Reader() {
  const customer = useContext(CustomerContext)?.customer
  useEffect(() => {
    runtime.customer = customer
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
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('refreshes the customer when the connection comes back after an offline launch', async () => {
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

  vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(lapsed as never)
  await act(async () => runtime.reconnect.forEach((listener) => listener()))
  await settle()

  expect(Purchases.getCustomerInfo).toHaveBeenCalledTimes(2)
  expect(runtime.customer).toEqual(lapsed)
})
