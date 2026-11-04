vi.mock('@/lib/syncClock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/syncClock')>()),
  refreshSyncClock: vi.fn(async () => null),
}))
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Drives `installiCloudSync` through the sync triggers a browser has (ADR 0037
// §6, docs/web-offline.md): app open, the window getting focus, the connection
// returning, and an edit (debounced). Each reaches the engine without anyone
// tapping Sync. The window's own `focus` event is `appLifecycle.test.ts`'s; here
// it's a hook the test fires, so the engine runs on the bridge the other
// engine tests use.

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  appState: 'active',
  appStateListeners: [] as Array<(state: string) => void>,
  remoteChangeListeners: [] as Array<() => void>,
  availabilityListeners: [] as Array<(e: { available: boolean }) => void>,
  available: true,
  files: [] as SyncFile[],
  pending: [] as string[],
  binaries: [] as Array<{ filename: string; modifiedAt: number }>,
  uploadSupported: true,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    get currentState() {
      return runtime.appState
    },
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appStateListeners.push(listener)
      return { remove: () => {} }
    },
  },
}))
vi.mock('../../../../modules/icloud-bridge', () => ({
  isAvailable: () => runtime.available,
  identityToken: () => null,
  waitForInitialScan: vi.fn(async () => true),
  readFiles: vi.fn(async (include: (filename: string) => boolean) => ({
    files: runtime.files.filter((f) => include(f.filename)),
    pending: runtime.pending.filter(include),
  })),
  write: vi.fn(async () => 1),
  supportsUploadStatus: () => runtime.uploadSupported,
  uploadStatus: vi.fn(async () => ({
    uploaded: true,
    uploading: false,
    error: null,
  })),
  deleteFile: vi.fn(async () => {}),
  deleteAll: vi.fn(async () => {}),
  writeBinary: vi.fn(async () => 1),
  readBinary: vi.fn(async () => 1),
  listBinaryFiles: vi.fn(async () => runtime.binaries),
  deleteBinaryFile: vi.fn(async () => {}),
  deleteAllBinaries: vi.fn(async () => {}),
  addRemoteChangeListener: (listener: () => void) => {
    runtime.remoteChangeListeners.push(listener)
    return { remove: () => {} }
  },
  addAvailabilityChangeListener: (
    listener: (e: { available: boolean }) => void
  ) => {
    runtime.availabilityListeners.push(listener)
    return { remove: () => {} }
  },
}))
const focusListeners = vi.hoisted(() => new Set<() => void>())
vi.mock('@/lib/appLifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/appLifecycle')>()),
  addWindowFocusListener: (listener: () => void) => {
    focusListeners.add(listener)
    return { remove: () => focusListeners.delete(listener) }
  },
}))
vi.mock('@/lib/account', () => ({ reclaimAccountFile: vi.fn() }))
const network = vi.hoisted(() => ({
  reconnectListeners: [] as Array<() => void>,
}))
vi.mock('@/lib/http/online', () => ({
  isKnownOffline: () => false,
  addReconnectListener: (listener: () => void) => {
    network.reconnectListeners.push(listener)
    return { remove: () => {} }
  },
}))
vi.mock('@/lib/installId', () => ({ getOrCreateInstallId: () => 'install' }))
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

const phonePayload = (version = 1): SyncFile => ({
  filename: PHONE_FILE,
  modifiedAt: 1000,
  json: JSON.stringify({
    version,
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
          avatar: { type: 'image', value: 'icloud://contact-from-phone' },
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
})

const load = async () => {
  const sync = await import('@/app/sync/iCloudSync')
  const bridge = await import('../../../../modules/icloud-bridge')
  const fs = await import('expo-file-system/legacy')
  vi.mocked(fs.getInfoAsync).mockResolvedValue({
    exists: false,
    uri: '',
    isDirectory: false,
  })
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  const { usePreferences } = await import('@/stores/preferences')
  const { default: useContacts } = await import('@/stores/contactsStore')
  const { errorTracking } = await import('@/lib/errorTracking')
  usePreferences.setState({
    iCloudSyncEnabled: true,
    iCloudDeviceId: 'ipad',
    hasMigratedToSyncSchema: true,
    hasReconciledSyncDefinitions: true,
  })
  useContacts.setState({
    deletedContacts: [
      {
        id: 'deleted-long-ago',
        name: '',
        createdAt: new Date(0),
        updatedAt: Date.now() - 2 * 24 * 60 * 60_000,
        redacted: true,
      },
    ],
  })
  return {
    ...sync,
    bridge,
    useSupporter,
    usePreferences,
    useContacts,
    errorTracking,
  }
}

const hasPhoneContact = (
  useContacts: Awaited<ReturnType<typeof load>>['useContacts']
) => useContacts.getState().contacts.some((c) => c.id === 'from-phone')

// Every later catch-up step resolves without timers, so one macrotask lets a
// catch-up finish.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

let uninstall: () => void = () => {}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  runtime.appState = 'active'
  runtime.appStateListeners = []
  runtime.remoteChangeListeners = []
  runtime.availabilityListeners = []
  runtime.available = true
  runtime.files = [phonePayload()]
  runtime.pending = []
  runtime.binaries = []
  runtime.uploadSupported = true
  const bridge = await import('../../../../modules/icloud-bridge')
  vi.mocked(bridge.readFiles).mockImplementation(async (include) => ({
    files: runtime.files.filter((file) => include(file.filename)),
    pending: runtime.pending.filter(include),
  }))
  vi.mocked(bridge.write).mockResolvedValue(1)
  vi.mocked(bridge.uploadStatus).mockResolvedValue({
    uploaded: true,
    uploading: false,
    error: null,
  })
})

afterEach(() => {
  uninstall()
})

/** The window getting focus, as the engine's `addWindowFocusListener` hears it. */
const windowEvents = () => {
  focusListeners.clear()
  return (_type: 'focus') =>
    [...focusListeners].forEach((listener) => listener())
}

describe('what makes the web sync without a tap', () => {
  beforeEach(() => {
    network.reconnectListeners = []
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('catches up when the app opens', async () => {
    windowEvents()
    const { installiCloudSync, useSupporter, useContacts } = await load()
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()
    await vi.waitFor(() => expect(hasPhoneContact(useContacts)).toBe(true))
  })

  it('catches up when the window gets focus, under the foreground throttle', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000_000)
    const fire = windowEvents()
    const { installiCloudSync, useSupporter, bridge } = await load()
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()
    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalled())
    const afterOpen = vi.mocked(bridge.readFiles).mock.calls.length

    // A click back into the window a moment later: the open's catch-up stands.
    vi.setSystemTime(1_005_000)
    fire('focus')
    await settle()
    expect(vi.mocked(bridge.readFiles).mock.calls.length).toBe(afterOpen)

    // Later, it reads again.
    vi.setSystemTime(1_100_000)
    fire('focus')
    await vi.waitFor(() =>
      expect(vi.mocked(bridge.readFiles).mock.calls.length).toBeGreaterThan(
        afterOpen
      )
    )
  })

  it('does not listen for window focus once uninstalled', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000_000)
    const fire = windowEvents()
    const { installiCloudSync, useSupporter, bridge } = await load()
    useSupporter.getState().setSupporter(true)
    const stop = installiCloudSync()
    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalled())
    stop()
    const reads = vi.mocked(bridge.readFiles).mock.calls.length
    vi.setSystemTime(1_100_000)
    fire('focus')
    await settle()
    expect(vi.mocked(bridge.readFiles).mock.calls.length).toBe(reads)
  })

  it('sends what waited when the connection returns', async () => {
    windowEvents()
    const { installiCloudSync, useSupporter, usePreferences, bridge } =
      await load()
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()
    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalled())
    await settle()
    vi.mocked(bridge.write).mockClear()
    usePreferences.setState({ iCloudSyncPendingPush: true })
    network.reconnectListeners.forEach((listener) => listener())
    await vi.waitFor(() => expect(bridge.write).toHaveBeenCalled())
  })

  it('pushes an edit once, a few seconds after the last of a burst', async () => {
    windowEvents()
    const { installiCloudSync, useSupporter, useContacts, bridge } =
      await load()
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()
    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalled())
    await settle()
    await settle()
    vi.mocked(bridge.write).mockClear()

    for (const name of ['A', 'AB', 'ABC'])
      useContacts.getState().set({
        contacts: [{ id: 'typing', name } as never],
      })
    // Real timers: the push waits PUSH_DEBOUNCE_MS (5 s) after the last edit.
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    expect(bridge.write).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(bridge.write).toHaveBeenCalledTimes(1), {
      timeout: 6_000,
    })
  })
})
