vi.mock('@/lib/syncClock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/syncClock')>()),
  refreshSyncClock: vi.fn(async () => null),
}))
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// What sync costs when nothing changed, and how it behaves when the cloud
// misbehaves: a foreground with no edits uploads nothing, failing pushes back
// off instead of re-uploading on every edit, a write that never settles can't
// wedge later pushes, and failures keep their transport error code for the
// status. Same fake bridge as iCloudSyncCatchUp.test.ts.

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
vi.mock('@/lib/account', () => ({ reclaimAccountFile: vi.fn() }))
const network = vi.hoisted(() => ({
  offline: false,
  reconnectListeners: [] as Array<() => void>,
}))
vi.mock('@/lib/http/online', () => ({
  isKnownOffline: () => network.offline,
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
  network.offline = false
  network.reconnectListeners = []
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

/** A real return from the background (not an iOS `inactive` blip). */
const comeBack = () => {
  runtime.appState = 'background'
  runtime.appStateListeners.forEach((listener) => listener('background'))
  runtime.appState = 'active'
  runtime.appStateListeners.forEach((listener) => listener('active'))
}

/** Installs sync, lets the launch catch-up finish, and returns the rig. */
const launched = async () => {
  const rig = await load()
  rig.useSupporter.getState().setSupporter(true)
  uninstall = rig.installiCloudSync()
  await vi.waitFor(() => expect(rig.bridge.write).toHaveBeenCalledTimes(1))
  await settle()
  vi.mocked(rig.bridge.write).mockClear()
  vi.mocked(rig.bridge.readFiles).mockClear()
  return rig
}

const ownFile = (): SyncFile => ({
  filename: 'witness-work-ipad.json',
  modifiedAt: 2000,
  json: '{}',
})

describe('a foreground with nothing new', () => {
  it('publishes once per launch, then reads without uploading', async () => {
    runtime.files = [ownFile()]
    const { bridge } = await launched()
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
    comeBack()
    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalled())
    await settle()
    expect(bridge.write).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('pushes edits that were waiting', async () => {
    runtime.files = [ownFile()]
    const { bridge, usePreferences } = await launched()
    usePreferences.setState({ iCloudSyncPendingPush: true })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
    comeBack()
    await vi.waitFor(() => expect(bridge.write).toHaveBeenCalledTimes(1))
    vi.restoreAllMocks()
  })

  it('writes this device’s snapshot again when it is missing', async () => {
    runtime.files = [ownFile()]
    const { bridge } = await launched()
    // Removed from another device's Devices list.
    runtime.files = []
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
    comeBack()
    await vi.waitFor(() => expect(bridge.write).toHaveBeenCalledTimes(1))
    vi.restoreAllMocks()
  })

  it('ignores iOS inactive blips and quick returns', async () => {
    runtime.files = [ownFile()]
    const { bridge } = await launched()
    // Control Center or Face ID: inactive, then active again.
    runtime.appStateListeners.forEach((listener) => listener('inactive'))
    runtime.appStateListeners.forEach((listener) => listener('active'))
    await settle()
    expect(bridge.readFiles).not.toHaveBeenCalled()
    // A first real return catches up; another right after doesn't.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
    comeBack()
    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalledTimes(1))
    await settle()
    comeBack()
    await settle()
    expect(bridge.readFiles).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })
})

describe('launching', () => {
  it('catches up when the app reports active only after sync installed', async () => {
    // iOS can start JS at `unknown`; that first `active` isn't a return from
    // the background.
    runtime.appState = 'unknown'
    runtime.files = [ownFile()]
    const { installiCloudSync, useSupporter, bridge } = await load()
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()
    await settle()
    expect(bridge.readFiles).not.toHaveBeenCalled()
    runtime.appState = 'active'
    runtime.appStateListeners.forEach((listener) => listener('active'))
    await vi.waitFor(() => expect(bridge.write).toHaveBeenCalledTimes(1))
  })
})

describe('failing pushes', () => {
  it('back off instead of uploading again on every edit', async () => {
    runtime.files = [ownFile()]
    const { bridge, useContacts, usePreferences, iCloudSync } = await launched()
    vi.useFakeTimers()
    try {
      vi.mocked(bridge.write).mockRejectedValue(
        Object.assign(new Error('Coordinator error: busy'), {
          code: 'ICLOUD_COORDINATE',
        })
      )
      expect(await iCloudSync.push('store-change')).toBe(false)
      expect(usePreferences.getState().iCloudSyncErrorCode).toBe('network')
      expect(bridge.write).toHaveBeenCalledTimes(1)
      // Edits during the backoff wait for the retry instead of each pushing.
      for (let i = 0; i < 3; i++) {
        useContacts.getState().set({
          contacts: [{ id: `edit-${i}`, name: 'Edit' } as never],
        })
        await vi.advanceTimersByTimeAsync(1_000)
      }
      expect(bridge.write).toHaveBeenCalledTimes(1)
      expect(usePreferences.getState().iCloudSyncPendingPush).toBe(true)
      // The retry carries them.
      vi.mocked(bridge.write).mockResolvedValue(1)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(bridge.write).toHaveBeenCalledTimes(2)
      expect(usePreferences.getState().iCloudSyncPendingPush).toBe(false)
      expect(usePreferences.getState().iCloudSyncErrorCode).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('wait longer each time, longest for a full account', async () => {
    const { pushRetryDelayMs } = await load()
    expect(pushRetryDelayMs(1, 'network')).toBe(5_000)
    expect(pushRetryDelayMs(2, 'network')).toBe(20_000)
    expect(pushRetryDelayMs(99, 'network')).toBe(15 * 60_000)
    expect(pushRetryDelayMs(1, 'storage-full')).toBe(15 * 60_000)
    expect(pushRetryDelayMs(1, 'rate-limited')).toBe(60_000)
  })

  it('start over when the user comes back or taps Sync now', async () => {
    runtime.files = [ownFile()]
    const { bridge, useContacts, iCloudSync } = await launched()
    vi.useFakeTimers()
    try {
      vi.mocked(bridge.write).mockRejectedValue(new Error('boom'))
      await iCloudSync.push('store-change')
      await iCloudSync.push('push-retry')
      vi.mocked(bridge.write).mockResolvedValue(1)
      vi.mocked(bridge.write).mockClear()
      iCloudSync.resetPushBackoff()
      useContacts.getState().set({
        contacts: [{ id: 'after', name: 'After' } as never],
      })
      await vi.advanceTimersByTimeAsync(5_000)
      expect(bridge.write).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retry once the connection returns', async () => {
    runtime.files = [ownFile()]
    const { bridge, usePreferences, iCloudSync } = await launched()
    vi.mocked(bridge.write).mockRejectedValueOnce(
      Object.assign(new Error('Failed to write'), { code: 'ICLOUD_WRITE' })
    )
    await iCloudSync.push('store-change')
    expect(usePreferences.getState().iCloudSyncPendingPush).toBe(true)
    network.reconnectListeners.forEach((listener) => listener())
    await vi.waitFor(() => expect(bridge.write).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(usePreferences.getState().iCloudSyncPendingPush).toBe(false)
    )
  })
})

describe('a write that never finishes', () => {
  it('fails the push, keeps the edit pending and frees the next push', async () => {
    runtime.files = [ownFile()]
    const { bridge, usePreferences, iCloudSync, errorTracking } =
      await launched()
    vi.useFakeTimers()
    try {
      vi.mocked(bridge.write).mockImplementationOnce(
        () => new Promise(() => {})
      )
      const stuck = iCloudSync.push('store-change')
      await vi.advanceTimersByTimeAsync(60_000)
      expect(await stuck).toBe(false)
      expect(usePreferences.getState()).toMatchObject({
        iCloudSyncPendingPush: true,
        iCloudSyncIssue: 'push-failed',
        iCloudSyncErrorCode: 'network',
      })
      // Expected, so not reported as a crash.
      expect(errorTracking.captureException).not.toHaveBeenCalled()
      expect(await iCloudSync.push('manual')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('peeking at a backup', () => {
  it('says offline instead of unavailable without a connection', async () => {
    const { peekRemotePayload } = await load()
    network.offline = true
    expect(await peekRemotePayload()).toEqual({ status: 'offline' })
  })

  it('gives up as incomplete after its deadline', async () => {
    vi.useFakeTimers()
    try {
      const { peekRemotePayload, bridge, PEEK_DEADLINE_MS } = await load()
      vi.mocked(bridge.readFiles).mockImplementation(
        () => new Promise(() => {})
      )
      const peek = peekRemotePayload()
      await vi.advanceTimersByTimeAsync(PEEK_DEADLINE_MS)
      expect(await peek).toEqual({ status: 'incomplete', reason: 'timeout' })
    } finally {
      vi.useRealTimers()
    }
  })
})
