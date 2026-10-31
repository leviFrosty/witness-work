import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  variant: 'production' as 'development' | 'beta' | 'production',
  session: null as { accountId: string } | null,
  settled: false,
  settledId: 'ww_buyer_0123456789',
  devBuyGate: false,
  accountListeners: new Set<() => void>(),
  getAppUserID: vi.fn(async () => 'ww_buyer_0123456789'),
}))
vi.mock('@/lib/appVariant', () => ({
  get appVariant() {
    return runtime.variant
  },
}))
vi.mock('@/lib/launchAddress', () => ({
  devBuyGateOverride: () => runtime.devBuyGate,
}))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: {
    ready: async () => {},
    snapshot: () => runtime.session,
  },
  onAccountChange: (listener: () => void) => {
    runtime.accountListeners.add(listener)
    return () => runtime.accountListeners.delete(listener)
  },
}))
vi.mock('@/features/supporter/lib/webRevenueCatId', () => ({
  useSettledWebRevenueCatId: () => (runtime.settled ? runtime.settledId : null),
}))
vi.mock('react-native-purchases', () => ({
  default: { getAppUserID: runtime.getAppUserID },
}))
vi.mock('@/hooks/useCustomer', () => ({
  default: () => ({ ready: true, customer: { entitlements: {} } }),
}))

import {
  useWebCheckoutCustomer,
  type WebCheckoutCustomer,
} from '@/features/supporter/hooks/useWebCheckoutCustomer'

const seen: WebCheckoutCustomer[] = []
let renderer: ReactTestRenderer | undefined
function Probe() {
  seen.push(useWebCheckoutCustomer())
  return null
}
const latest = () => seen.at(-1)
const render = async () => {
  await act(async () => {
    renderer = create(<Probe />)
  })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  runtime.variant = 'production'
  runtime.session = null
  runtime.settled = false
  runtime.settledId = 'ww_buyer_0123456789'
  runtime.devBuyGate = false
  runtime.accountListeners.clear()
  runtime.getAppUserID.mockClear()
  seen.length = 0
})
afterEach(() => {
  act(() => renderer?.unmount())
  vi.unstubAllGlobals()
})

describe('useWebCheckoutCustomer', () => {
  it('gives no customer in production without an account session', async () => {
    await render()
    expect(latest()).toEqual({ appUserId: null, waitingFor: 'session' })
    expect(runtime.getAppUserID).not.toHaveBeenCalled()
  })

  it('gives no customer in production until the id has settled', async () => {
    runtime.session = { accountId: 'acct_1' }
    await render()
    expect(latest()).toEqual({ appUserId: null, waitingFor: 'settled_id' })
    expect(runtime.getAppUserID).not.toHaveBeenCalled()
  })

  it.each(['production', 'beta'] as const)(
    'gives the customer in %s with a session and a settled id',
    async (variant) => {
      runtime.variant = variant
      runtime.session = { accountId: 'acct_1' }
      runtime.settled = true
      await render()
      expect(latest()).toEqual({
        appUserId: 'ww_buyer_0123456789',
        waitingFor: null,
      })
    }
  )

  it('gives no customer while the browser is logged in as another one', async () => {
    runtime.session = { accountId: 'acct_1' }
    runtime.settled = true
    runtime.settledId = 'ww_account_9876543210'
    await render()
    expect(latest()).toEqual({ appUserId: null, waitingFor: null })
  })

  it('notices a session that opens later', async () => {
    await render()
    expect(latest()?.waitingFor).toBe('session')
    runtime.session = { accountId: 'acct_1' }
    await act(async () => {
      for (const listener of runtime.accountListeners) listener()
    })
    expect(latest()?.waitingFor).toBe('settled_id')
  })

  it('gives the customer in a development build, with neither', async () => {
    runtime.variant = 'development'
    await render()
    expect(latest()).toEqual({
      appUserId: 'ww_buyer_0123456789',
      waitingFor: null,
    })
  })

  it('keeps the checks in a development build asked to (dev_buy_gate)', async () => {
    runtime.variant = 'development'
    runtime.devBuyGate = true
    await render()
    expect(latest()).toEqual({ appUserId: null, waitingFor: 'session' })
  })
})
