import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('__DEV__', false)

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  files: [] as SyncFile[],

  pending: [] as string[] | null,
  remoteChangeListeners: [] as Array<() => void>,
  setCustomer: () => {},

  appleAccountChange: null as (() => void) | null,
  links: [] as unknown[],

  switched: [] as Array<() => void>,

  keychainLocked: false,

  revenueCat: true,

  account: null as string | null,
  os: 'ios' as 'ios' | 'web',
  installId: 'ipad',

  revenueCatUser: null as string | null,

  entitled: false,
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
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
    logIn: vi.fn(async (id: string) => {
      runtime.revenueCatUser = id
      return { customerInfo: { entitlements: {} } }
    }),
    isAnonymous: vi.fn(async () => false),
    getAppUserID: vi.fn(
      async () => runtime.revenueCatUser ?? runtime.installId
    ),
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
      return runtime.installId
    },
  }
})

vi.mock('@/lib/iCloudIdentity', () => ({
  checkICloudIdentity: () => {
    const change = runtime.appleAccountChange
    runtime.appleAccountChange = null
    change?.()
    return !change
  },
}))

vi.mock('@/lib/supporterSince', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supporterSince')>()
  return {
    ...actual,
    supporterSinceDate: (
      customer: Parameters<typeof actual.supporterSinceDate>[0]
    ) =>
      customer && runtime.entitled
        ? new Date(0)
        : actual.supporterSinceDate(customer),
  }
})
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

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()

  const { default: Purchases } = await import('react-native-purchases')
  vi.mocked(Purchases.logIn).mockReset()
  vi.mocked(Purchases.getCustomerInfo).mockReset()
  runtime.files = []
  runtime.links = []
  runtime.switched = []
  runtime.pending = []
  runtime.remoteChangeListeners = []
  runtime.appleAccountChange = null
  runtime.keychainLocked = false
  runtime.revenueCat = true
  runtime.account = null
  runtime.os = 'ios'
  runtime.installId = 'ipad'
  runtime.revenueCatUser = null
  runtime.entitled = false
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

    expect(bridge.write).not.toHaveBeenCalledWith(ACCOUNT_FILE, ownClaim)

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

    expect(bridge.write).not.toHaveBeenCalledWith(
      ACCOUNT_FILE,
      expect.stringContaining('"accountId":"phone"')
    )
    expect(account.getOrCreateAccountId()).toBe('ipad')

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
    const account = await import('@/lib/account')
    account.bindSupporterAccount(ACCT_B)
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

  it("tags an older version's account file naming this device", async () => {
    runtime.account = ACCT_A
    const account = await import('@/lib/account')
    account.bindSupporterAccount(ACCT_A)
    account.adoptAccountId('phone', 1, ACCT_A)
    runtime.files = [
      {
        ...phoneClaim,
        json: JSON.stringify({
          v: 1,
          accountId: 'phone',
          entitled: false,
          updatedAt: 1,
        }),
      },
    ]
    const { AccountProvider, bridge } = await load()

    await mount(AccountProvider)

    await vi.waitFor(() =>
      expect(bridge.write).toHaveBeenCalledWith(
        ACCOUNT_FILE,
        expect.stringMatching(
          new RegExp(`"accountId":"phone".*"account":"${ACCT_A}"`)
        )
      )
    )
  })

  it("tags an older version's file when a refresh finds it was right", async () => {
    runtime.account = ACCT_A
    const account = await import('@/lib/account')
    account.bindSupporterAccount(ACCT_A)
    account.adoptAccountId('phone', 1, ACCT_A)
    runtime.files = [phoneClaim]
    const { AccountProvider, bridge, Purchases } = await load()
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValue({
      entitlements: {
        active: {
          'Lifetime Supporter': {
            identifier: 'Lifetime Supporter',
            productIdentifier: 'lifetime',
            originalPurchaseDate: '2026-01-01T00:00:00Z',
          },
        },
      },
      activeSubscriptions: [],
    } as never)

    await mount(AccountProvider)

    await vi.waitFor(() =>
      expect(bridge.write).toHaveBeenCalledWith(
        ACCOUNT_FILE,
        expect.stringMatching(
          new RegExp(
            `"accountId":"phone","entitled":true.*"account":"${ACCT_A}"`
          )
        )
      )
    )
  })

  it("doesn't adopt an untagged file naming the id dropped for the previous account", async () => {
    const account = await import('@/lib/account')
    account.bindSupporterAccount(ACCT_A)
    account.adoptAccountId('phone', 1, ACCT_A)
    account.dropAdoptedAccountId(ACCT_A)
    account.bindSupporterAccount(ACCT_B)
    runtime.account = ACCT_B
    runtime.files = [phoneClaim]
    const { AccountProvider, bridge, Purchases } = await load()

    await mount(AccountProvider)
    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalled())
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(Purchases.logIn).not.toHaveBeenCalledWith('phone')
    expect(account.getOrCreateAccountId()).toBe('ipad')
    expect(bridge.write).not.toHaveBeenCalled()
  })

  it("doesn't tag an untagged file it adopted as this account's", async () => {
    runtime.account = ACCT_B
    const account = await import('@/lib/account')
    account.bindSupporterAccount(ACCT_B)
    runtime.files = [
      {
        ...phoneClaim,
        json: JSON.stringify({
          v: 1,
          accountId: 'phone',
          entitled: false,
          updatedAt: 1,
        }),
      },
    ]
    const { AccountProvider, bridge, Purchases } = await load()
    const registry = await import('@/lib/accountClaimRegistry')

    await mount(AccountProvider)
    await vi.waitFor(() =>
      expect(Purchases.logIn).toHaveBeenCalledWith('phone')
    )

    await vi.waitFor(() =>
      expect(registry.ownAccountClaim()?.appUserId).toBe('phone')
    )
    await act(async () => {
      runtime.remoteChangeListeners.forEach((listener) => listener())
      await new Promise((resolve) => setTimeout(resolve, 600))
    })

    expect(account.getOrCreateAccountId()).toBe('phone')
    expect(registry.ownAccountClaim()?.account).toBeUndefined()
    expect(bridge.write).not.toHaveBeenCalledWith(
      ACCOUNT_FILE,
      expect.stringContaining(ACCT_B)
    )
  })

  it("doesn't write the file for an account that switched during the pass", async () => {
    runtime.account = ACCT_A
    const account = await import('@/lib/account')
    account.bindSupporterAccount(ACCT_A)
    const { AccountProvider, bridge } = await load()
    let finishRead!: () => void
    vi.mocked(bridge.readFiles).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = () => resolve({ files: [], pending: [] })
        })
    )

    await mount(AccountProvider)
    await vi.waitFor(() => expect(finishRead).toBeDefined())

    await act(async () => {
      runtime.account = ACCT_B
      account.bindSupporterAccount(ACCT_B)
      finishRead()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(bridge.write).not.toHaveBeenCalledWith(
      ACCOUNT_FILE,
      expect.stringContaining(ACCT_A)
    )
  })

  it('logs in again when RevenueCat stayed on the previous id', async () => {
    const identity = await import('@/lib/revenueCatIdentity')
    identity.noteRevenueCatAppUserId('phone')
    const { AccountProvider, Purchases } = await load()

    await mount(AccountProvider)

    await vi.waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith('ipad'))
    expect(identity.revenueCatIsOwn()).toBe(true)
  })
})

describe('a complete Cloud Sync pull on a phone', () => {
  it("doesn't reconcile when the claims didn't change", async () => {
    const { AccountProvider, bridge, Purchases } = await load()
    const pull = await import('@/lib/cloudSyncPullSettled')
    const store = await import('@/lib/settledRevenueCatId')
    await mount(AccountProvider)
    await vi.waitFor(() => expect(bridge.write).toHaveBeenCalled())
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)))
    const reads = vi.mocked(bridge.readFiles).mock.calls.length
    const scans = vi.mocked(bridge.waitForInitialScan).mock.calls.length

    await act(async () => pull.markCompletePull())
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)))

    expect(vi.mocked(bridge.readFiles).mock.calls.length).toBe(reads)
    expect(vi.mocked(bridge.waitForInitialScan).mock.calls.length).toBe(scans)
    expect(Purchases.getAppUserID).not.toHaveBeenCalled()
    expect(store.settledRevenueCatId()).toBeNull()
  })
})

describe('the settled RevenueCat id, on the web (docs/web-purchases.md)', () => {
  const BROWSER = 'ww_browser_0123456789'
  const PHONE = 'aaaaaaaa-0000-4000-8000-00000000000b'
  const phoneClaim = { appUserId: PHONE, entitled: true, claimedAt: 9e12 }
  const wait = { timeout: 3_000 }

  beforeEach(() => {
    runtime.os = 'web'
    runtime.installId = BROWSER
  })

  const loadWeb = async () => {
    const loaded = await load()
    const registry = await import('@/lib/accountClaimRegistry')
    const pull = await import('@/lib/cloudSyncPullSettled')
    const store = await import('@/lib/settledRevenueCatId')
    const account = await import('@/lib/account')

    const completePull = async (
      claims: Parameters<typeof registry.setPeerAccountClaims>[0]
    ) => {
      await act(async () => {
        registry.setPeerAccountClaims(claims)
        pull.markCompletePull()
      })
    }
    return { ...loaded, registry, pull, store, account, completePull }
  }

  const settleDown = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 600)))

  it('settles nothing until a complete pull', async () => {
    const { AccountProvider, registry, store } = await loadWeb()
    await mount(AccountProvider)
    await vi.waitFor(() => expect(registry.ownAccountClaim()).not.toBeNull())

    await act(async () => registry.setPeerAccountClaims([]))
    await settleDown()
    expect(store.settledRevenueCatId()).toBeNull()
  })

  it('settles a web-only account on its own claim (an empty or own-only pull)', async () => {
    const { AccountProvider, store, completePull, Purchases } = await loadWeb()
    await mount(AccountProvider)
    await completePull([])
    await vi.waitFor(
      () => expect(store.settledRevenueCatId()).toBe(BROWSER),
      wait
    )
    expect(Purchases.logIn).not.toHaveBeenCalled()
  })

  it("moves to another device's entitled claim that arrives later", async () => {
    const { AccountProvider, store, completePull, Purchases, account } =
      await loadWeb()
    await mount(AccountProvider)
    await completePull([])
    await vi.waitFor(
      () => expect(store.settledRevenueCatId()).toBe(BROWSER),
      wait
    )

    await completePull([phoneClaim])

    expect(store.settledRevenueCatId()).toBeNull()
    await vi.waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith(PHONE))
    await vi.waitFor(
      () => expect(store.settledRevenueCatId()).toBe(PHONE),
      wait
    )
    expect(account.getOrCreateAccountId()).toBe(PHONE)
  })

  it("settles nothing on an incomplete pull's claims", async () => {
    const { AccountProvider, registry, store, completePull, Purchases } =
      await loadWeb()
    await mount(AccountProvider)
    await completePull([phoneClaim])
    await vi.waitFor(
      () => expect(store.settledRevenueCatId()).toBe(PHONE),
      wait
    )
    expect(Purchases.logIn).toHaveBeenCalledWith(PHONE)

    await act(async () =>
      registry.setPeerAccountClaims([
        { appUserId: 'ww_tablet_0123456789', entitled: false, claimedAt: 9e13 },
      ])
    )
    await settleDown()
    expect(store.settledRevenueCatId()).toBeNull()
  })

  it('keeps an entitled browser on its own id beside an entitled phone (ADR 0011)', async () => {
    runtime.entitled = true
    const { AccountProvider, store, completePull, Purchases } = await loadWeb()
    await mount(AccountProvider)
    await completePull([phoneClaim])
    await vi.waitFor(
      () => expect(store.settledRevenueCatId()).toBe(BROWSER),
      wait
    )
    expect(Purchases.logIn).not.toHaveBeenCalledWith(PHONE)
  })

  it('settles nothing when logging in as the adopted id fails', async () => {
    const { AccountProvider, store, completePull, Purchases } = await loadWeb()
    vi.mocked(Purchases.logIn).mockRejectedValue(new Error('RevenueCat down'))
    await mount(AccountProvider)
    await completePull([phoneClaim])
    await vi.waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith(PHONE))
    await settleDown()
    expect(store.settledRevenueCatId()).toBeNull()
  })

  it('settles nothing without RevenueCat (no key, or no SDK)', async () => {
    runtime.revenueCat = false
    const { AccountProvider, registry, store, completePull } = await loadWeb()
    await mount(AccountProvider)
    await vi.waitFor(() => expect(registry.ownAccountClaim()).not.toBeNull())
    await completePull([])
    await settleDown()
    expect(store.settledRevenueCatId()).toBeNull()
  })

  it('settles nothing while RevenueCat is logged in as another customer', async () => {
    runtime.revenueCatUser = 'ww_someone_else_0123'
    const { AccountProvider, store, completePull } = await loadWeb()
    await mount(AccountProvider)
    await completePull([])
    await settleDown()
    expect(store.settledRevenueCatId()).toBeNull()
  })

  it('unsettles on a reset, until the next complete pull settles it', async () => {
    const { AccountProvider, store, pull, completePull } = await loadWeb()
    await mount(AccountProvider)
    await completePull([])
    await vi.waitFor(
      () => expect(store.settledRevenueCatId()).toBe(BROWSER),
      wait
    )
    await act(async () => pull.resetCompletePull())
    expect(store.settledRevenueCatId()).toBeNull()
    await completePull([])
    await vi.waitFor(
      () => expect(store.settledRevenueCatId()).toBe(BROWSER),
      wait
    )
  })
})
