import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('__DEV__', false)

type LinkCall = { appUserId: string; accountId: string | undefined }

const runtime = vi.hoisted(() => ({
  session: 'acct_a' as string | null,

  revenueCat: 'phone-0000',
  links: [] as Array<{ appUserId: string; accountId: string | undefined }>,
  accountChange: [] as Array<(change: string) => void>,
  mmkv: new Map<string, unknown>(),

  accountFile: null as string | null,

  revenueCatDown: false,

  supporterReads: [] as Array<string | undefined>,

  linkAttempts: [] as Array<string | undefined>,

  remoteChange: [] as Array<() => void>,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
vi.mock('../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  waitForInitialScan: async () => true,
  readFiles: async () => ({
    files: runtime.accountFile
      ? [
          {
            filename: 'witness-work-account.json',
            json: runtime.accountFile,
            modifiedAt: 1,
          },
        ]
      : [],
    pending: [],
  }),
  write: vi.fn(async () => 1),
  deleteFile: async () => {},
  addRemoteChangeListener: (listener: () => void) => {
    runtime.remoteChange.push(listener)
    return { remove: () => {} }
  },
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
      if (options.url.endsWith('/supporter'))
        runtime.supporterReads.push(call.accountId)
      if (options.url.endsWith('/revenuecat-customers'))
        runtime.linkAttempts.push(call.accountId)
      if (
        options.url.endsWith('/revenuecat-customers') &&
        runtime.revenueCatDown
      ) {
        const { HttpError } = await import('@/lib/http/request')
        throw new HttpError('server', 503, 'unavailable')
      }
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
  runtime.accountFile = null
  runtime.revenueCatDown = false
  runtime.supporterReads = []
  runtime.linkAttempts = []
  runtime.remoteChange = []
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

    expect(runtime.links).not.toContainEqual(
      expect.objectContaining({ appUserId: 'phone-0000' })
    )
  })

  it("doesn't bring back the previous account's id through an older version's account file", async () => {
    const { accountFingerprint } = await import(
      '@/lib/serverAccount/serverSupporter'
    )
    const account = await import('@/lib/account')
    const identity = await import('@/lib/revenueCatIdentity')

    account.bindSupporterAccount(accountFingerprint('acct_a'))
    account.adoptAccountId('phone-0000', 0, accountFingerprint('acct_a'))
    identity.noteRevenueCatAppUserId('phone-0000')
    runtime.accountFile = JSON.stringify({
      v: 1,
      accountId: 'phone-0000',
      entitled: false,
      updatedAt: 1,
      claimedAt: 0,
    })
    const bridge = await import('../../modules/icloud-bridge')
    const { default: Purchases } = await import('react-native-purchases')
    const { default: AccountProvider } = await import('./AccountProvider')

    await act(async () => {
      renderer = create(<AccountProvider />)
    })

    await vi.waitFor(() =>
      expect(bridge.write).toHaveBeenCalledWith(
        'witness-work-account.json',
        expect.stringContaining(`"account":"${accountFingerprint('acct_a')}"`)
      )
    )
    runtime.links = []

    await act(async () => {
      runtime.session = 'acct_b'
      runtime.accountChange.forEach((listener) => listener('key_changed'))
    })
    await vi.waitFor(() =>
      expect(runtime.links).toContainEqual({
        appUserId: 'ipad-0000',
        accountId: 'acct_b',
      })
    )
    vi.mocked(Purchases.logIn).mockClear()

    await act(async () => {
      runtime.accountChange.forEach((listener) => listener('session_opened'))
    })
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

    expect(Purchases.logIn).not.toHaveBeenCalledWith('phone-0000')
    expect(account.getOrCreateAccountId()).toBe('ipad-0000')
    expect(runtime.links).not.toContainEqual(
      expect.objectContaining({ appUserId: 'phone-0000' })
    )
  })

  it("never adopts or tags the previous account's id from an untagged file that arrives after the switch", async () => {
    const { accountFingerprint } = await import(
      '@/lib/serverAccount/serverSupporter'
    )
    const account = await import('@/lib/account')
    const registry = await import('@/lib/accountClaimRegistry')

    account.bindSupporterAccount(accountFingerprint('acct_a'))
    const bridge = await import('../../modules/icloud-bridge')
    const { default: Purchases } = await import('react-native-purchases')
    const { default: AccountProvider } = await import('./AccountProvider')
    await act(async () => {
      renderer = create(<AccountProvider />)
    })
    await act(async () => {
      registry.setPeerAccountClaims([
        {
          appUserId: 'lifetime-0000',
          entitled: true,
          claimedAt: 0,
          account: accountFingerprint('acct_a'),
        },
      ])
    })
    await vi.waitFor(() =>
      expect(account.getOrCreateAccountId()).toBe('lifetime-0000')
    )

    await act(async () => {
      runtime.session = 'acct_b'
      runtime.accountChange.forEach((listener) => listener('key_changed'))
    })
    await vi.waitFor(() =>
      expect(account.getOrCreateAccountId()).toBe('ipad-0000')
    )
    await vi.waitFor(() =>
      expect(Purchases.logIn).toHaveBeenCalledWith('ipad-0000')
    )
    vi.mocked(Purchases.logIn).mockClear()
    vi.mocked(bridge.write).mockClear()

    runtime.accountFile = JSON.stringify({
      v: 1,
      accountId: 'lifetime-0000',
      entitled: true,
      updatedAt: 2,
      claimedAt: 0,
    })
    await act(async () =>
      runtime.remoteChange.forEach((listener) => listener())
    )
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

    expect(Purchases.logIn).not.toHaveBeenCalledWith('lifetime-0000')
    expect(account.getOrCreateAccountId()).toBe('ipad-0000')
    expect(bridge.write).not.toHaveBeenCalled()
    expect(runtime.links).not.toContainEqual({
      appUserId: 'lifetime-0000',
      accountId: 'acct_b',
    })
  })

  it("reads the account's stored answer when switching back while RevenueCat is down", async () => {
    const { accountFingerprint } = await import(
      '@/lib/serverAccount/serverSupporter'
    )
    const account = await import('@/lib/account')
    account.bindSupporterAccount(accountFingerprint('acct_b'))
    runtime.session = 'acct_b'
    runtime.revenueCat = 'ipad-0000'
    const { default: AccountProvider } = await import('./AccountProvider')
    await act(async () => {
      renderer = create(<AccountProvider />)
    })
    await vi.waitFor(() => expect(runtime.accountChange).toHaveLength(2))
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    runtime.supporterReads = []

    runtime.revenueCatDown = true
    await act(async () => {
      runtime.session = 'acct_a'
      runtime.accountChange.forEach((listener) => listener('key_changed'))
    })

    await vi.waitFor(() => expect(runtime.supporterReads).toContain('acct_a'))
    expect(runtime.linkAttempts).toContain('acct_a')
    const { useServerSupporter } = await import('@/stores/serverSupporter')
    expect(useServerSupporter.getState().entry?.account).toBe(
      accountFingerprint('acct_a')
    )
  })
})
