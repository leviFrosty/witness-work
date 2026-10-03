vi.mock('@/lib/syncClock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/syncClock')>()),
  refreshSyncClock: vi.fn(async () => null),
}))
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Drives `installiCloudSync` against a fake bridge to cover which device and
// which Apple Account sync speaks for: a different account must stop sync
// before its container is read or written, and a device restored from another
// device's backup must stop treating that device's snapshot as its own.

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  appStateListeners: [] as Array<(state: string) => void>,
  remoteChangeListeners: [] as Array<() => void>,
  availabilityListeners: [] as Array<(e: { available: boolean }) => void>,
  identityToken: 'account-a' as string | null,
  files: [] as SyncFile[],
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appStateListeners.push(listener)
      return { remove: () => {} }
    },
  },
}))
vi.mock('../../../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  supportsUploadStatus: () => false,
  identityToken: () => runtime.identityToken,
  identityTokenMatches: (stored: string) =>
    runtime.identityToken === null ? null : stored === runtime.identityToken,
  waitForInitialScan: vi.fn(async () => true),
  readFiles: vi.fn(async (include: (filename: string) => boolean) => ({
    files: runtime.files.filter((f) => include(f.filename)),
    pending: [],
  })),
  write: vi.fn(async () => 1),
  deleteFile: vi.fn(async () => {}),
  deleteAll: vi.fn(async () => {}),
  writeBinary: vi.fn(async () => 1),
  readBinary: vi.fn(async () => 1),
  listBinaryFiles: vi.fn(async () => []),
  deleteBinaryFile: vi.fn(async () => {}),
  deleteAllBinaries: vi.fn(async () => {}),
  addRemoteChangeListener: (listener: () => void) => {
    runtime.remoteChangeListeners.push(listener)
    return { remove: () => {} }
  },
  addAvailabilityChangeListener: (
    listener: (typeof runtime.availabilityListeners)[number]
  ) => {
    runtime.availabilityListeners.push(listener)
    return { remove: () => {} }
  },
}))
vi.mock('@/lib/account', () => ({
  reclaimAccountFile: vi.fn(),
  clearAdoptedAccountId: vi.fn(),
}))
vi.mock('@/lib/installId', () => ({ getOrCreateInstallId: () => 'install-b' }))
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
vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/Documents/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  copyAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
}))
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(async () => ({ uri: '', width: 1, height: 1 })),
  SaveFormat: { JPEG: 'jpeg' },
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 2,
  modelName: 'iPad',
  osName: 'iPadOS',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

const PHONE_FILE = 'witness-work-phone.json'

const phonePayload: SyncFile = {
  filename: PHONE_FILE,
  modifiedAt: 1000,
  json: JSON.stringify({
    version: 1,
    writtenAt: 1000,
    deviceId: 'phone',
    deviceName: 'iPhone',
    contactStore: {
      contacts: [
        {
          id: 'from-phone',
          name: 'Added on phone',
          createdAt: '2026-09-01T12:00:00.000Z',
          updatedAt: 1000,
        },
      ],
      deletedContacts: [],
    },
    conversationStore: { conversations: [], deletedConversations: [] },
    serviceReportStore: {
      serviceReports: {},
      dayPlans: [],
      recurringPlans: [],
      deletedServiceReports: [],
    },
    preferencesStore: { values: {}, updatedAt: {} },
  }),
}

const load = async () => {
  const sync = await import('@/app/sync/iCloudSync')
  const bridge = await import('../../../../modules/icloud-bridge')
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  const { usePreferences } = await import('@/stores/preferences')
  const { default: useContacts } = await import('@/stores/contactsStore')
  const { clearAdoptedAccountId } = await import('@/lib/account')
  usePreferences.setState({
    iCloudSyncEnabled: true,
    iCloudDeviceId: 'ipad',
    iCloudDeviceBinding: 'install-b',
    iCloudIdentityToken: 'account-a',
    hasMigratedToSyncSchema: true,
    hasReconciledSyncDefinitions: true,
  })
  useSupporter.getState().setSupporter(true)
  return {
    ...sync,
    bridge,
    usePreferences,
    useContacts,
    clearAdoptedAccountId,
  }
}

const hasPhoneContact = (
  useContacts: Awaited<ReturnType<typeof load>>['useContacts']
) => useContacts.getState().contacts.some((c) => c.id === 'from-phone')

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

let uninstall: () => void = () => {}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  runtime.appStateListeners = []
  runtime.remoteChangeListeners = []
  runtime.availabilityListeners = []
  runtime.identityToken = 'account-a'
  runtime.files = [phonePayload]
})

afterEach(() => {
  uninstall()
  uninstall = () => {}
})

describe('Apple Account changes', () => {
  it('stops at launch after a switch made while the app was closed', async () => {
    runtime.identityToken = 'account-b'
    const { installiCloudSync, bridge, usePreferences, clearAdoptedAccountId } =
      await load()

    uninstall = installiCloudSync()
    runtime.appStateListeners.forEach((listener) => listener('active'))
    runtime.remoteChangeListeners.forEach((listener) => listener())
    await settle()

    expect(bridge.readFiles).not.toHaveBeenCalled()
    expect(bridge.write).not.toHaveBeenCalled()
    expect(usePreferences.getState()).toMatchObject({
      iCloudSyncEnabled: false,
      iCloudSyncSetByUser: true,
      iCloudIdentityToken: 'account-b',
    })
    expect(usePreferences.getState().iCloudAccountChangedAt).not.toBeNull()
    expect(clearAdoptedAccountId).toHaveBeenCalled()
  })

  it('stops before the next read when the account changes while running', async () => {
    const { installiCloudSync, bridge, usePreferences, useContacts } =
      await load()
    uninstall = installiCloudSync()
    await vi.waitFor(() => expect(hasPhoneContact(useContacts)).toBe(true))
    await vi.waitFor(() => expect(bridge.write).toHaveBeenCalled())
    await settle()
    vi.mocked(bridge.readFiles).mockClear()
    vi.mocked(bridge.write).mockClear()

    runtime.identityToken = 'account-b'
    runtime.availabilityListeners.forEach((listener) =>
      listener({ available: true })
    )
    runtime.appStateListeners.forEach((listener) => listener('active'))
    await settle()

    expect(bridge.readFiles).not.toHaveBeenCalled()
    expect(bridge.write).not.toHaveBeenCalled()
    expect(usePreferences.getState().iCloudSyncEnabled).toBe(false)
  })

  it('does not auto-enable into an account it has just noticed', async () => {
    runtime.identityToken = 'account-b'
    const { resolveInitialEnable, bridge, usePreferences } = await load()
    usePreferences.setState({ iCloudSyncEnabled: false })

    await expect(resolveInitialEnable()).resolves.toEqual({
      outcome: 'unavailable',
    })
    expect(bridge.readFiles).not.toHaveBeenCalled()
    // Sync was never on, so nothing of the previous account is in iCloud: the
    // Supporter default keeps applying, against the new account, next time.
    expect(usePreferences.getState().iCloudSyncSetByUser).toBe(false)
  })

  it('turned back on, sync uses the first-enable flow for the new account', async () => {
    runtime.identityToken = 'account-b'
    const { canSync, resolveInitialEnable, usePreferences } = await load()
    expect(canSync()).toBe(false)

    // Settings: the user chooses to enable again.
    const decision = await resolveInitialEnable()

    expect(decision.outcome).toBe('pull')
    expect(usePreferences.getState().iCloudIdentityToken).toBe('account-b')
  })

  it('leaves sync running while signed out', async () => {
    runtime.identityToken = null
    const { canSync, usePreferences } = await load()

    expect(canSync()).toBe(true)
    expect(usePreferences.getState()).toMatchObject({
      iCloudSyncEnabled: true,
      iCloudIdentityToken: 'account-a',
    })
  })
})

describe('a device restored from another device’s backup', () => {
  it('reads the original device’s snapshot and writes its own', async () => {
    const { installiCloudSync, bridge, usePreferences, useContacts } =
      await load()
    // The phone's preferences, restored onto this iPad.
    usePreferences.setState({
      iCloudDeviceId: 'phone',
      iCloudDeviceBinding: 'install-a',
    })

    uninstall = installiCloudSync()

    await vi.waitFor(() => expect(hasPhoneContact(useContacts)).toBe(true))
    await vi.waitFor(() => expect(bridge.write).toHaveBeenCalled())
    const newId = usePreferences.getState().iCloudDeviceId
    expect(newId).not.toBe('phone')
    expect(bridge.write).not.toHaveBeenCalledWith(PHONE_FILE, expect.anything())
    expect(bridge.write).toHaveBeenCalledWith(
      `witness-work-${newId}.json`,
      expect.any(String)
    )
  })
})
