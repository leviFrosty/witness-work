import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('__DEV__', false)

// Drives the account reconcile loop (ADR 0011) against a fake bridge to cover
// what a claim may overwrite while iCloud is still downloading.

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  files: [] as SyncFile[],
  // `null` = a binary that can't report downloads (see `readFiles`).
  pending: [] as string[] | null,
  remoteChangeListeners: [] as Array<() => void>,
  setCustomer: () => {},
  /** Runs once as the next identity check's detected Apple Account change. */
  appleAccountChange: null as (() => void) | null,
  links: [] as unknown[],
  /** `onSupporterAccountSwitched` listeners. */
  switched: [] as Array<() => void>,
  /** The Keychain is locked: the install id can't be read yet. */
  keychainLocked: false,
  /** False: RevenueCat has no SDK key on this device. */
  revenueCat: true,
  /** The server account this device is on (`currentSupporterAccount`). */
  account: null as string | null,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
vi.mock('../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  waitForInitialScan: vi.fn(async () => true),
  readFiles: vi.fn(async (include: (filename: string) => boolean) => ({
    files: runtime.files.filter((f) => include(f.filename)),
    pending: runtime.pending?.filter(include) ?? null,
  })),
  write: vi.fn(async () => 1),
  deleteFile: vi.fn(async () => {}),
  addRemoteChangeListener: (listener: () => void) => {
    runtime.remoteChangeListeners.push(listener)
    return { remove: () => {} }
  },
  addAvailabilityChangeListener: () => ({ remove: () => {} }),
}))
vi.mock('react-native-purchases', () => ({
  default: {
    logIn: vi.fn(async () => ({ customerInfo: { entitlements: {} } })),
    isAnonymous: vi.fn(async () => false),
    invalidateCustomerInfoCache: vi.fn(),
    getCustomerInfo: vi.fn(async () => ({ entitlements: {} })),
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
vi.mock('@/hooks/useCustomer', () => ({
  // Known, un-entitled customer: this device adopts a foreign claim, and
  // claims when there is none.
  default: () =>
    runtime.revenueCat
      ? {
          customer: { entitlements: { active: {} } },
          ready: true,
          unavailable: false,
          setCustomer: runtime.setCustomer,
        }
      : {
          customer: null,
          ready: false,
          unavailable: true,
          setCustomer: runtime.setCustomer,
        },
}))
vi.mock('@/lib/installId', () => {
  class InstallIdUnavailableError extends Error {}
  return {
    InstallIdUnavailableError,
    getOrCreateInstallId: () => {
      if (runtime.keychainLocked) throw new InstallIdUnavailableError()
      return 'ipad'
    },
  }
})
// The identity decision itself is covered in `iCloudIdentity.test.ts`; here a
// detected change only needs its effect on the account id.
vi.mock('@/lib/iCloudIdentity', () => ({
  checkICloudIdentity: () => {
    const change = runtime.appleAccountChange
    runtime.appleAccountChange = null
    change?.()
    return !change
  },
}))
vi.mock('expo-device', () => ({ modelName: 'iPad' }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), addBreadcrumb: vi.fn() },
}))
vi.mock('@/lib/serverAccount/revenueCatLinkRuntime', () => ({
  currentSupporterAccount: async () => runtime.account,
  ensureRevenueCatLinked: async (options: unknown) => {
    runtime.links.push(options)
  },
  onSupporterAccountSwitched: (listener: () => void) => {
    runtime.switched.push(listener)
    return () => {
      runtime.switched = runtime.switched.filter((l) => l !== listener)
    }
  },
}))

const ACCOUNT_FILE = 'witness-work-account.json'
const phoneClaim: SyncFile = {
  filename: ACCOUNT_FILE,
  modifiedAt: 1,
  json: JSON.stringify({
    v: 1,
    accountId: 'phone',
    entitled: true,
    updatedAt: 1,
  }),
}

const ownClaim = expect.stringContaining('"accountId":"ipad"')

const load = async () => {
  const { default: AccountProvider } = await import('./AccountProvider')
  const bridge = await import('../../modules/icloud-bridge')
  const { default: Purchases } = await import('react-native-purchases')
  return { AccountProvider, bridge, Purchases }
}

let renderer: ReactTestRenderer | null = null
const mount = async (AccountProvider: React.FC<React.PropsWithChildren>) => {
  await act(async () => {
    renderer = create(<AccountProvider />)
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  runtime.files = []
  runtime.links = []
  runtime.switched = []
  runtime.pending = []
  runtime.remoteChangeListeners = []
  runtime.appleAccountChange = null
  runtime.keychainLocked = false
  runtime.revenueCat = true
  runtime.account = null
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('account reconcile while iCloud is downloading', () => {
  it("defers the claim while another device's claim is downloading", async () => {
    runtime.pending = [ACCOUNT_FILE]
    const { AccountProvider, bridge, Purchases } = await load()

    await mount(AccountProvider)

    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalled())
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    // Claiming here would overwrite the phone's claim with this device's id.
    expect(bridge.write).not.toHaveBeenCalledWith(ACCOUNT_FILE, ownClaim)

    // The download lands; the still-unobserved file makes the metadata query
    // report it, which re-runs the reconcile.
    runtime.pending = []
    runtime.files = [phoneClaim]
    await act(async () => {
      runtime.remoteChangeListeners.forEach((listener) => listener())
    })

    await vi.waitFor(() =>
      expect(Purchases.logIn).toHaveBeenCalledWith('phone')
    )
    expect(bridge.write).not.toHaveBeenCalledWith(ACCOUNT_FILE, ownClaim)
  })

  it('still claims on binaries that cannot report downloads', async () => {
    runtime.pending = null
    const { AccountProvider, bridge } = await load()

    await mount(AccountProvider)

    await vi.waitFor(() =>
      expect(bridge.write).toHaveBeenCalledWith(ACCOUNT_FILE, ownClaim)
    )
  })

  it('returns to this device’s own id after an Apple Account change', async () => {
    const account = await import('@/lib/account')
    account.adoptAccountId('phone', 1, null)
    runtime.appleAccountChange = account.clearAdoptedAccountId
    const { AccountProvider, bridge, Purchases } = await load()

    await mount(AccountProvider)

    await vi.waitFor(() =>
      expect(bridge.write).toHaveBeenCalledWith(ACCOUNT_FILE, ownClaim)
    )
    expect(Purchases.logIn).toHaveBeenCalledWith('ipad')
    expect(Purchases.logIn).not.toHaveBeenCalledWith('phone')
    // The previous account's shared id never claims the new account's file.
    expect(bridge.write).not.toHaveBeenCalledWith(
      ACCOUNT_FILE,
      expect.stringContaining('"accountId":"phone"')
    )
    expect(account.getOrCreateAccountId()).toBe('ipad')
    // Another RevenueCat customer: linked to the server account (ADR 0029).
    expect(runtime.links).toContainEqual({ force: true, reason: 'adopted' })
  })

  it('identifies once an install id the locked Keychain refused reads', async () => {
    runtime.keychainLocked = true
    const { AccountProvider, bridge, Purchases } = await load()
    const { errorTracking } = await import('@/lib/errorTracking')

    await mount(AccountProvider)
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(Purchases.logIn).not.toHaveBeenCalled()
    expect(bridge.write).not.toHaveBeenCalled()
    // `installId` reports it, once.
    expect(errorTracking.captureException).not.toHaveBeenCalled()

    runtime.keychainLocked = false
    await act(async () => {
      runtime.remoteChangeListeners.forEach((listener) => listener())
    })

    await vi.waitFor(() =>
      expect(bridge.write).toHaveBeenCalledWith(ACCOUNT_FILE, ownClaim)
    )
    expect(Purchases.logIn).toHaveBeenCalledWith('ipad')
  })
})

describe('RevenueCat claims in the sync data (ADR 0040 §7)', () => {
  const PEER = 'aaaaaaaa-0000-4000-8000-00000000000a'

  const loadClaims = async () => {
    const registry = await import('@/lib/accountClaimRegistry')
    const account = await import('@/lib/account')
    const { analytics } = await import('@/lib/analytics')
    return { registry, account, analytics }
  }

  it("publishes this device's claim for its sync payload", async () => {
    const { AccountProvider } = await load()
    const { registry } = await loadClaims()

    await mount(AccountProvider)

    await vi.waitFor(() =>
      expect(registry.ownAccountClaim()).toMatchObject({
        appUserId: 'ipad',
        entitled: false,
      })
    )
  })

  it("adopts a peer's earlier claim from the sync data", async () => {
    const { AccountProvider, Purchases } = await load()
    const { registry, account, analytics } = await loadClaims()
    // Claimed before the account file's id.
    registry.setPeerAccountClaims([
      { appUserId: PEER, entitled: false, claimedAt: 0 },
    ])
    runtime.files = [
      {
        ...phoneClaim,
        json: JSON.stringify({
          v: 1,
          accountId: 'phone',
          entitled: false,
          updatedAt: 5,
        }),
      },
    ]

    await mount(AccountProvider)

    await vi.waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith(PEER))
    expect(account.getOrCreateAccountId()).toBe(PEER)
    expect(Purchases.logIn).not.toHaveBeenCalledWith('phone')
    expect(analytics.capture).toHaveBeenCalledWith('account_id_adopted', {
      source: 'sync',
      revenuecat: true,
    })
    // The adopted id keeps the time of the claim it adopted.
    await vi.waitFor(() =>
      expect(registry.ownAccountClaim()).toEqual({
        appUserId: PEER,
        entitled: false,
        claimedAt: 0,
      })
    )
  })

  it('adopts when a claim arrives later', async () => {
    const { AccountProvider, Purchases } = await load()
    const { registry } = await loadClaims()

    await mount(AccountProvider)
    await vi.waitFor(() => expect(registry.ownAccountClaim()).not.toBeNull())

    await act(async () => {
      registry.setPeerAccountClaims([
        { appUserId: PEER, entitled: true, claimedAt: 9e12 },
      ])
    })

    await vi.waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith(PEER))
  })

  it('adopts the id without RevenueCat', async () => {
    runtime.revenueCat = false
    const { AccountProvider, Purchases } = await load()
    const { registry, account, analytics } = await loadClaims()
    registry.setPeerAccountClaims([
      { appUserId: PEER, entitled: true, claimedAt: 0 },
    ])

    await mount(AccountProvider)

    await vi.waitFor(() => expect(account.getOrCreateAccountId()).toBe(PEER))
    expect(Purchases.logIn).not.toHaveBeenCalled()
    expect(analytics.capture).toHaveBeenCalledWith('account_id_adopted', {
      source: 'sync',
      revenuecat: false,
    })
  })
})

describe('another server account signs in', () => {
  const ACCT_A = 'a'.repeat(64)
  const ACCT_B = 'b'.repeat(64)

  it("returns RevenueCat to this device's own id", async () => {
    const account = await import('@/lib/account')
    runtime.account = ACCT_A
    account.bindSupporterAccount(ACCT_A)
    account.adoptAccountId('phone', 1, ACCT_A)
    const { AccountProvider, Purchases } = await load()

    await mount(AccountProvider)
    await vi.waitFor(() => expect(runtime.switched).toHaveLength(1))
    runtime.links = []

    // The runtime bound the new account and dropped the id adopted for the
    // previous one.
    await act(async () => {
      runtime.account = ACCT_B
      account.bindSupporterAccount(ACCT_B)
      account.clearAdoptedAccountId()
      runtime.switched.forEach((listener) => listener())
    })

    await vi.waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith('ipad'))
    expect(runtime.links).toContainEqual({ force: true, reason: 'adopted' })
  })

  it("leaves the previous account's account file alone", async () => {
    // A reinstall keeps the session (Keychain) but not the device's state;
    // the Apple Account's file still names the previous account's id.
    runtime.account = ACCT_B
    runtime.files = [
      {
        ...phoneClaim,
        json: JSON.stringify({
          v: 1,
          accountId: 'phone',
          entitled: true,
          updatedAt: 1,
          account: ACCT_A,
        }),
      },
    ]
    const { AccountProvider, bridge, Purchases } = await load()
    const account = await import('@/lib/account')

    await mount(AccountProvider)
    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalled())
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(Purchases.logIn).not.toHaveBeenCalledWith('phone')
    expect(account.getOrCreateAccountId()).toBe('ipad')
    // Claiming over it would have that account's devices take it back.
    expect(bridge.write).not.toHaveBeenCalled()
  })

  it("adopts its own account's file, and claims with its account", async () => {
    runtime.account = ACCT_B
    runtime.files = [
      {
        ...phoneClaim,
        json: JSON.stringify({
          v: 1,
          accountId: 'phone',
          entitled: true,
          updatedAt: 1,
          account: ACCT_B,
        }),
      },
    ]
    const { AccountProvider, Purchases } = await load()
    const registry = await import('@/lib/accountClaimRegistry')

    await mount(AccountProvider)

    await vi.waitFor(() =>
      expect(Purchases.logIn).toHaveBeenCalledWith('phone')
    )
    await vi.waitFor(() =>
      expect(registry.ownAccountClaim()).toMatchObject({
        appUserId: 'phone',
        account: ACCT_B,
      })
    )
  })

  it("writes the account file's claim with its account", async () => {
    runtime.account = ACCT_B
    const { AccountProvider, bridge } = await load()

    await mount(AccountProvider)

    await vi.waitFor(() =>
      expect(bridge.write).toHaveBeenCalledWith(
        ACCOUNT_FILE,
        expect.stringContaining(`"account":"${ACCT_B}"`)
      )
    )
  })

  it("ignores the previous account's claims from a platform sync", async () => {
    runtime.account = ACCT_B
    const { AccountProvider, Purchases } = await load()
    const registry = await import('@/lib/accountClaimRegistry')
    registry.setPeerAccountClaims([
      {
        appUserId: 'phone-0000',
        entitled: true,
        claimedAt: 0,
        account: ACCT_A,
      },
    ])

    await mount(AccountProvider)
    await vi.waitFor(() => expect(registry.ownAccountClaim()).not.toBeNull())
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(Purchases.logIn).not.toHaveBeenCalledWith('phone-0000')
  })

  it("doesn't keep an id adopted while the account switched", async () => {
    runtime.account = ACCT_A
    const account = await import('@/lib/account')
    account.bindSupporterAccount(ACCT_A)
    const { AccountProvider, Purchases } = await load()
    const registry = await import('@/lib/accountClaimRegistry')
    let finishLogIn!: () => void
    vi.mocked(Purchases.logIn).mockImplementation(async (id: string) => {
      if (id === 'phone-0000')
        await new Promise<void>((resolve) => (finishLogIn = resolve))
      return { customerInfo: { entitlements: {} } } as never
    })
    registry.setPeerAccountClaims([
      {
        appUserId: 'phone-0000',
        entitled: true,
        claimedAt: 0,
        account: ACCT_A,
      },
    ])

    await mount(AccountProvider)
    await vi.waitFor(() =>
      expect(Purchases.logIn).toHaveBeenCalledWith('phone-0000')
    )

    // Account B signs in while the login for A's id is under way.
    await act(async () => {
      runtime.account = ACCT_B
      account.bindSupporterAccount(ACCT_B)
      account.clearAdoptedAccountId()
      registry.setPeerAccountClaims([])
      runtime.switched.forEach((listener) => listener())
    })
    vi.mocked(Purchases.logIn).mockClear()
    await act(async () => finishLogIn())

    await vi.waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith('ipad'))
    expect(account.getOrCreateAccountId()).toBe('ipad')
  })

  it('logs in again when RevenueCat stayed on the previous id', async () => {
    // The launch's login failed offline: RevenueCat is still on the id the
    // previous account adopted, though this device's id is its own.
    const identity = await import('@/lib/revenueCatIdentity')
    identity.noteRevenueCatAppUserId('phone')
    const { AccountProvider, Purchases } = await load()

    await mount(AccountProvider)

    await vi.waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith('ipad'))
    expect(identity.revenueCatIsOwn()).toBe(true)
  })
})
