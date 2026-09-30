import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Drives the account reconcile loop (ADR 0011) against a fake bridge to cover
// what a claim may overwrite while iCloud is still downloading.

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  files: [] as SyncFile[],
  // `null` = a binary that can't report downloads (see `readFiles`).
  pending: [] as string[] | null,
  remoteChangeListeners: [] as Array<() => void>,
  setCustomer: () => {},
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
    invalidateCustomerInfoCache: vi.fn(),
    getCustomerInfo: vi.fn(async () => ({ entitlements: {} })),
  },
}))
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    private values = new Map<string, string>()
    getString(key: string) {
      return this.values.get(key)
    }
    set(key: string, value: string) {
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
  default: () => ({
    customer: { entitlements: { active: {} } },
    ready: true,
    setCustomer: runtime.setCustomer,
  }),
}))
vi.mock('@/lib/installId', () => ({ getOrCreateInstallId: () => 'ipad' }))
vi.mock('expo-device', () => ({ modelName: 'iPad' }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), addBreadcrumb: vi.fn() },
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
  runtime.pending = []
  runtime.remoteChangeListeners = []
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
})
