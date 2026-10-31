import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The real CustomerProvider + AccountProvider when the Keychain can't give the
// account id at launch, e.g. a background launch before the first unlock.
// RevenueCat must stay anonymous, then be identified exactly once.

const runtime = vi.hoisted(() => ({
  keychainLocked: false,
  appStateListeners: [] as Array<(state: string) => void>,
  links: [] as unknown[],
  /** Holds `Purchases.logIn` open until the test releases it. */
  logInGate: null as Promise<void> | null,
  /** The account file a claim wrote, as the next read sees it. */
  accountFile: null as unknown,
  /** RevenueCat is logged in as the account id. */
  identified: false,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'background',
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
      await runtime.logInGate
      runtime.identified = true
      return {
        customerInfo: { entitlements: { active: {} } },
        created: false,
      }
    }),
    getCustomerInfo: vi.fn(async () => ({ entitlements: { active: {} } })),
    isAnonymous: vi.fn(async () => !runtime.identified),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
}))
vi.mock('@/lib/syncTransport', () => ({
  hasSyncTransport: () => true,
  syncTransport: () => ({
    isAvailable: () => true,
    waitForInitialScan: async () => true,
    addRemoteChangeListener: () => ({ remove: () => {} }),
    addAvailabilityChangeListener: () => ({ remove: () => {} }),
  }),
}))
vi.mock('@/lib/installId', () => {
  class InstallIdUnavailableError extends Error {}
  return { InstallIdUnavailableError }
})
vi.mock('@/lib/account', async () => {
  const { InstallIdUnavailableError } = await import('@/lib/installId')
  return {
    getOrCreateAccountId: () => {
      if (runtime.keychainLocked)
        throw new InstallIdUnavailableError(new Error('locked'))
      return 'install-a'
    },
    adoptAccountId: vi.fn(),
    getOwnAccountClaim: (entitled: boolean) => ({
      appUserId: 'install-a',
      entitled,
      claimedAt: 1,
    }),
    readAccountFile: vi.fn(async () => ({
      file: runtime.accountFile,
      pending: false,
    })),
    writeAccountFile: vi.fn(
      async (claim: { appUserId: string; entitled: boolean }) => {
        runtime.accountFile = {
          v: 1,
          accountId: claim.appUserId,
          entitled: claim.entitled,
          updatedAt: 1,
        }
      }
    ),
  }
})
vi.mock('@/lib/iCloudIdentity', () => ({ checkICloudIdentity: () => true }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), addBreadcrumb: vi.fn() },
}))
vi.mock('@/lib/serverAccount/revenueCatLinkRuntime', () => ({
  ensureRevenueCatLinked: async (options: unknown) => {
    runtime.links.push(options)
  },
  onSupporterAccountSwitched: () => () => {},
}))

const foreground = async () => {
  await act(async () => {
    for (const state of ['background', 'active'])
      runtime.appStateListeners.forEach((listener) => listener(state))
  })
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

const mount = async () => {
  const { default: CustomerProvider } = await import('./CustomerProvider')
  const { default: AccountProvider } = await import('./AccountProvider')
  const { default: Purchases } = await import('react-native-purchases')
  const account = await import('@/lib/account')
  const { errorTracking } = await import('@/lib/errorTracking')
  await act(async () => {
    renderer = create(
      <CustomerProvider>
        <AccountProvider />
      </CustomerProvider>
    )
  })
  await settle()
  return { Purchases, account, errorTracking }
}

let renderer: ReactTestRenderer | null = null

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY', 'appl_test')
  vi.stubGlobal('__DEV__', false)
  runtime.keychainLocked = false
  runtime.appStateListeners = []
  runtime.links = []
  runtime.logInGate = null
  runtime.accountFile = null
  runtime.identified = false
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('a launch while the Keychain is locked', () => {
  it('stays anonymous, then logs in and links once on the first return after unlock', async () => {
    runtime.keychainLocked = true
    const { Purchases, account, errorTracking } = await mount()

    expect(Purchases.getCustomerInfo).toHaveBeenCalled()
    expect(Purchases.logIn).not.toHaveBeenCalled()
    expect(account.writeAccountFile).not.toHaveBeenCalled()
    // `installId` reports it, once.
    expect(errorTracking.captureException).not.toHaveBeenCalled()

    // Unlocked. The first return fires every foreground listener at once
    // (the retry and the throttled reconcile) while logIn is still in flight.
    runtime.keychainLocked = false
    let release!: () => void
    runtime.logInGate = new Promise((resolve) => (release = resolve))
    await foreground()
    await act(async () => release())
    await vi.waitFor(() =>
      expect(account.writeAccountFile).toHaveBeenCalledWith({
        appUserId: 'install-a',
        entitled: false,
        claimedAt: 1,
      })
    )
    await settle()

    expect(Purchases.logIn).toHaveBeenCalledTimes(1)
    expect(Purchases.logIn).toHaveBeenCalledWith('install-a')
    // The launch link is unforced; the identify forces exactly one.
    const forced = runtime.links.filter(
      (link) => (link as { force?: boolean }).force
    )
    expect(forced).toEqual([{ force: true, reason: 'adopted' }])
    expect(account.writeAccountFile).toHaveBeenCalledTimes(1)

    // Identified: later returns don't log in again.
    await foreground()
    await settle()
    expect(Purchases.logIn).toHaveBeenCalledTimes(1)
  })

  it('passes no throwaway id to RevenueCat while still locked', async () => {
    runtime.keychainLocked = true
    const { Purchases, account } = await mount()

    await foreground()
    await settle()
    await foreground()
    await settle()

    expect(Purchases.logIn).not.toHaveBeenCalled()
    expect(account.writeAccountFile).not.toHaveBeenCalled()
  })

  it('logs in once at launch when the id reads', async () => {
    const { Purchases } = await mount()
    await foreground()
    await settle()

    expect(Purchases.logIn).toHaveBeenCalledTimes(1)
    expect(Purchases.logIn).toHaveBeenCalledWith('install-a')
  })
})
