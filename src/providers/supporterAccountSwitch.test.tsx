import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('__DEV__', false)

// The whole chain, from a session confirming another server account to
// RevenueCat logged in as this device's own id and linked to the new account:
// the real link runtime, Supporter binding, account id and reconcile, over a
// fake session client and RevenueCat.

type LinkCall = { appUserId: string; accountId: string | undefined }

const runtime = vi.hoisted(() => ({
  /** The account the stored session (for the current key) belongs to. */
  session: 'acct_a' as string | null,
  /** Who RevenueCat is logged in as. */
  revenueCat: 'phone-0000',
  links: [] as Array<{ appUserId: string; accountId: string | undefined }>,
  accountChange: [] as Array<(change: string) => void>,
  mmkv: new Map<string, unknown>(),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
vi.mock('../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  waitForInitialScan: async () => true,
  readFiles: async () => ({ files: [], pending: [] }),
  write: vi.fn(async () => 1),
  deleteFile: async () => {},
  addRemoteChangeListener: () => ({ remove: () => {} }),
  addAvailabilityChangeListener: () => ({ remove: () => {} }),
}))
vi.mock('react-native-purchases', () => ({
  default: {
    isConfigured: async () => true,
    getAppUserID: async () => runtime.revenueCat,
    isAnonymous: async () => false,
    logIn: vi.fn(async (id: string) => {
      runtime.revenueCat = id
      return { customerInfo: { entitlements: { active: {} } } }
    }),
    getCustomerInfo: async () => ({ entitlements: { active: {} } }),
  },
}))
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    private values = new Map<string, string | number>()
    getString(key: string) {
      const value = this.values.get(key)
      return typeof value === 'string' ? value : undefined
    }
    getNumber(key: string) {
      const value = this.values.get(key)
      return typeof value === 'number' ? value : undefined
    }
    set(key: string, value: string | number) {
      this.values.set(key, value)
    }
    delete(key: string) {
      this.values.delete(key)
    }
  },
}))
vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: {
    getString: (key: string) => runtime.mmkv.get(key) as string | undefined,
    getBoolean: (key: string) => runtime.mmkv.get(key) as boolean | undefined,
    set: (key: string, value: unknown) => runtime.mmkv.set(key, value),
    delete: (key: string) => runtime.mmkv.delete(key),
  },
}))
vi.mock('@/hooks/useCustomer', () => ({
  default: () => ({
    customer: { entitlements: { active: {} } },
    ready: true,
    unavailable: false,
    setCustomer: () => {},
  }),
}))
vi.mock('@/lib/serverAccount', () => ({
  currentSessionAccount: async () => runtime.session,
  onAccountChange: (listener: (change: string) => void) => {
    runtime.accountChange.push(listener)
    return () => {}
  },
  accountSessions: {
    ensure: async () => ({ accountId: runtime.session }),
    request: async (
      options: { url: string; json?: { appUserId: string } },
      call: { accountId?: string } = {}
    ) => {
      if (call.accountId !== undefined && call.accountId !== runtime.session)
        throw new Error('sent on another account')
      if (options.url.endsWith('/revenuecat-customers'))
        runtime.links.push({
          appUserId: options.json!.appUserId,
          accountId: call.accountId,
        } satisfies LinkCall)
      return {
        status: 200,
        headers: new Headers(),
        data: { ok: true, supporter: false, expiresAt: null, customers: 1 },
      }
    },
  },
}))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: () => ({ remove: () => {} }),
}))
vi.mock('@/lib/http/online', () => ({
  addReconnectListener: () => ({ remove: () => {} }),
}))
vi.mock('@/lib/revenueCatBrowser', () => ({
  invalidateCustomerInfoCache: async () => {},
}))
vi.mock('@/lib/installId', () => ({
  InstallIdUnavailableError: class extends Error {},
  getOrCreateInstallId: () => 'ipad-0000',
}))
vi.mock('@/lib/iCloudIdentity', () => ({ checkICloudIdentity: () => true }))
vi.mock('expo-device', () => ({ modelName: 'iPad' }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), addBreadcrumb: vi.fn() },
}))

let renderer: ReactTestRenderer | null = null

beforeEach(() => {
  vi.resetModules()
  runtime.session = 'acct_a'
  runtime.revenueCat = 'phone-0000'
  runtime.links = []
  runtime.accountChange = []
  runtime.mmkv = new Map()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('another server account signs in', () => {
  it("logs RevenueCat in as this device's own id and links only that", async () => {
    const { accountFingerprint } = await import(
      '@/lib/serverAccount/serverSupporter'
    )
    const account = await import('@/lib/account')
    const identity = await import('@/lib/revenueCatIdentity')
    // On account A, this device adopted A's Supporter id from A's sync data.
    account.bindSupporterAccount(accountFingerprint('acct_a'))
    account.adoptAccountId('phone-0000', 0, accountFingerprint('acct_a'))
    identity.noteRevenueCatAppUserId('phone-0000')
    const { useSupporter } = await import('@/stores/supporterStatus')
    useSupporter.getState().setSupporter(true)
    const { default: Purchases } = await import('react-native-purchases')
    const { default: AccountProvider } = await import('./AccountProvider')

    await act(async () => {
      renderer = create(<AccountProvider />)
    })
    await vi.waitFor(() => expect(runtime.accountChange).toHaveLength(2))
    expect(account.getOrCreateAccountId()).toBe('phone-0000')
    runtime.links = []

    // Use a Recovery Key: account B's key and session.
    await act(async () => {
      runtime.session = 'acct_b'
      runtime.accountChange.forEach((listener) => listener('key_changed'))
    })

    await vi.waitFor(() =>
      expect(Purchases.logIn).toHaveBeenCalledWith('ipad-0000')
    )
    await vi.waitFor(() =>
      expect(runtime.links).toContainEqual({
        appUserId: 'ipad-0000',
        accountId: 'acct_b',
      })
    )
    expect(account.getOrCreateAccountId()).toBe('ipad-0000')
    expect(account.boundSupporterAccount()).toBe(accountFingerprint('acct_b'))
    expect(identity.revenueCatIsOwn()).toBe(true)
    expect(useSupporter.getState().isSupporter).toBe(false)
    // A's id was never named for B.
    expect(runtime.links).not.toContainEqual(
      expect.objectContaining({ appUserId: 'phone-0000' })
    )
  })
})
