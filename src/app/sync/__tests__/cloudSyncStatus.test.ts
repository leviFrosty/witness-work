import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncStatus } from '@/lib/syncTransport/server/syncClient'

// Cloud Sync's status read (`GET /accounts/v1/sync`), and what it records for
// the engine's gate.

const runtime = vi.hoisted(() => ({
  status: null as SyncStatus | null,
  accountListener: null as
    | ((change: 'session_opened' | 'key_changed') => void)
    | null,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
}))
vi.mock('expo-device', () => ({
  DeviceType: { PHONE: 1, TABLET: 2 },
  deviceType: 1,
  modelName: 'iPhone',
  osName: 'iOS',
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('expo-crypto', () => ({ getRandomBytes: vi.fn() }))
vi.mock('../../../../modules/buddies-keychain', () => ({
  peekRootSeed: async () => 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
}))
vi.mock('@/lib/accountKey', () => ({
  deviceAccountKey: {
    peek: async () => 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
  },
}))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: {
    ready: async () => {},
    snapshot: () => ({ accountId: 'acct-family' }),
    ensure: async () => {},
  },
  bearerOptions: () => ({}),
  onAccountChange: (
    listener: (change: 'session_opened' | 'key_changed') => void
  ) => {
    runtime.accountListener = listener
    return () => {}
  },
  olderAccountKeys: async () => [],
  olderPhotoKeys: async () => [],
  serverAccount: { connect: vi.fn() },
}))
vi.mock('@/lib/serverAccount/revenueCatLinkRuntime', () => ({
  ensureRevenueCatLinked: vi.fn(async () => {}),
}))
vi.mock('@/lib/syncTransport/server/syncClient', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/syncTransport/server/syncClient')
  >()),
  fetchSyncStatus: vi.fn(async () => runtime.status),
}))
vi.mock('../../../../modules/icloud-bridge', () => ({}))
vi.mock('@/lib/account', () => ({
  reclaimAccountFile: vi.fn(),
  clearAdoptedAccountId: vi.fn(),
}))
vi.mock('@/lib/installId', () => ({
  getOrCreateInstallId: () => 'install-phone',
  androidDeviceInstallId: () => 'install-phone',
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
  },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))

const status = (overrides: Partial<SyncStatus> = {}): SyncStatus => ({
  enabled: true,
  entitled: true,
  entitlement: 'supporter',
  supporter: true,
  supporterCheckFailed: false,
  photos: true,
  ...overrides,
})

/** Ww-api's answer while it can't reach RevenueCat (`handleStatus`). */
const revenueCatDown = status({
  entitled: false,
  supporter: false,
  supporterCheckFailed: true,
})

async function load() {
  vi.resetModules()
  const cloudSync = await import('@/app/sync/cloudSync')
  const { usePreferences } = await import('@/stores/preferences')
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  return { ...cloudSync, usePreferences, useSupporter }
}

beforeEach(() => {
  vi.stubGlobal('__DEV__', true)
  runtime.status = null
})

describe('refreshCloudSyncStatus', () => {
  it('records the account’s answer', async () => {
    const { refreshCloudSyncStatus, usePreferences } = await load()
    usePreferences.setState({ cloudSyncEntitled: true })
    runtime.status = status({ entitled: false, supporter: false })
    await refreshCloudSyncStatus({ force: true })
    expect(usePreferences.getState().cloudSyncEntitled).toBe(false)
  })

  it('keeps a Supporter syncing while ww-api can’t check RevenueCat', async () => {
    const { refreshCloudSyncStatus, usePreferences, useSupporter } =
      await load()
    useSupporter.getState().setSupporter(true)
    usePreferences.setState({ cloudSyncEntitled: true })
    runtime.status = revenueCatDown
    await refreshCloudSyncStatus({ force: true })
    expect(usePreferences.getState().cloudSyncEntitled).toBe(true)
  })

  it('doesn’t entitle anyone because the check failed', async () => {
    const { refreshCloudSyncStatus, usePreferences, useSupporter } =
      await load()
    useSupporter.getState().setSupporter(false)
    usePreferences.setState({ cloudSyncEntitled: true })
    runtime.status = revenueCatDown
    await refreshCloudSyncStatus({ force: true })
    expect(usePreferences.getState().cloudSyncEntitled).toBe(false)

    // A Supporter never entitled before stays as recorded, too.
    useSupporter.getState().setSupporter(true)
    usePreferences.setState({ cloudSyncEntitled: null })
    await refreshCloudSyncStatus({ force: true })
    expect(usePreferences.getState().cloudSyncEntitled).toBe(null)
  })

  it('still honors the kill switch during the outage', async () => {
    const { refreshCloudSyncStatus, usePreferences, useSupporter } =
      await load()
    useSupporter.getState().setSupporter(true)
    usePreferences.setState({ cloudSyncEntitled: true })
    runtime.status = { ...revenueCatDown, enabled: false }
    await refreshCloudSyncStatus({ force: true })
    expect(usePreferences.getState().cloudSyncEntitled).toBe(false)
  })
})

describe('recheckCloudSyncPause', () => {
  /** A device on Cloud Sync that the server's switch paused. */
  async function pausedBySwitch() {
    const loaded = await load()
    loaded.registerCloudSync()
    loaded.usePreferences.setState({
      syncProvider: 'cloud',
      iCloudSyncEnabled: true,
      cloudSyncEntitled: false,
      cloudSyncConfig: { enabled: false, entitlement: 'everyone' },
    })
    return loaded
  }

  it('stays paused while the server’s switch is off', async () => {
    const { recheckCloudSyncPause, cloudSyncPause } = await pausedBySwitch()
    expect(cloudSyncPause()).toBe('switch')
    runtime.status = status({ enabled: false, entitled: false })
    expect(await recheckCloudSyncPause()).toBe('switch')
  })

  it('lifts once the server offers it again', async () => {
    const { recheckCloudSyncPause, usePreferences } = await pausedBySwitch()
    runtime.status = status({ entitlement: 'everyone', supporter: false })
    expect(await recheckCloudSyncPause()).toBe(null)
    expect(usePreferences.getState()).toMatchObject({
      cloudSyncEntitled: true,
      cloudSyncConfig: { enabled: true, entitlement: 'everyone' },
      syncProvider: 'cloud',
      iCloudSyncEnabled: true,
    })
  })

  it('keeps what was recorded without an answer', async () => {
    const { recheckCloudSyncPause } = await pausedBySwitch()
    runtime.status = null
    expect(await recheckCloudSyncPause()).toBe('switch')
  })

  it('says when the account isn’t entitled', async () => {
    const { recheckCloudSyncPause } = await pausedBySwitch()
    runtime.status = status({ entitled: false, supporter: false })
    expect(await recheckCloudSyncPause()).toBe('entitlement')
  })

  it('isn’t paused off Cloud Sync', async () => {
    const { recheckCloudSyncPause, cloudSyncPause, usePreferences } =
      await pausedBySwitch()
    usePreferences.setState({ syncProvider: 'platform' })
    expect(cloudSyncPause()).toBe(null)
    expect(await recheckCloudSyncPause()).toBe(null)
  })
})

describe('an account change', () => {
  it('checks photos against the new account, without the old one’s full storage', async () => {
    runtime.status = status()
    const { installCloudSyncRuntime, registerCloudSync, usePreferences } =
      await load()
    registerCloudSync()
    const filename = 'witness-work-img-contact-c1--r1.jpg'
    usePreferences.setState({
      iCloudSyncEnabled: true,
      syncProvider: 'cloud',
      iCloudImageSync: {
        [filename]: {
          localMtime: 1,
          uploadedMtime: null,
          lastError: 'storage_full',
          errorCode: 'storage-full',
          failedAt: 1,
          failures: 1,
        },
      },
    })
    const stop = installCloudSyncRuntime(() => false)
    const entry = () => usePreferences.getState().iCloudImageSync[filename]
    // A new session on the same account keeps it.
    runtime.accountListener?.('session_opened')
    expect(entry()).toMatchObject({ errorCode: 'storage-full' })
    runtime.accountListener?.('key_changed')
    expect(entry()).toEqual({ localMtime: 1, uploadedMtime: null })
    stop()
  })
})
