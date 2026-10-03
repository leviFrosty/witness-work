vi.mock('@/lib/syncClock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/syncClock')>()),
  refreshSyncClock: vi.fn(async () => null),
}))
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Drives `installiCloudSync` against a fake bridge to cover when the app
// catches up with iCloud on its own — the "I have to tap Sync on my iPad"
// report — retries after a failed read, and what image GC may delete while it
// does.

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
const INCOMING_PHOTO = 'witness-work-img-contact-from-phone.jpg'
const ORPHAN_PHOTO = 'witness-work-img-contact-deleted-long-ago.jpg'

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

describe('catching up without a manual sync', () => {
  it('pulls once supporter status loads after the launch events were dropped', async () => {
    const { installiCloudSync, useSupporter, useContacts, bridge } =
      await load()
    uninstall = installiCloudSync()

    // Initial metadata gather reports the phone's file before RevenueCat has
    // answered, so `canSync` drops it.
    runtime.remoteChangeListeners.forEach((listener) => listener())
    expect(bridge.readFiles).not.toHaveBeenCalled()

    useSupporter.getState().setSupporter(true)

    await vi.waitFor(() => expect(hasPhoneContact(useContacts)).toBe(true))
  })

  it('waits for the foreground when supporter status loads in the background', async () => {
    runtime.appState = 'background'
    const { installiCloudSync, useSupporter, useContacts, bridge } =
      await load()
    uninstall = installiCloudSync()

    useSupporter.getState().setSupporter(true)
    await Promise.resolve()
    expect(bridge.readFiles).not.toHaveBeenCalled()

    runtime.appState = 'active'
    runtime.appStateListeners.forEach((listener) => listener('active'))

    await vi.waitFor(() => expect(hasPhoneContact(useContacts)).toBe(true))
  })

  it('pulls when iCloud becomes available', async () => {
    runtime.available = false
    const { installiCloudSync, useSupporter, useContacts, bridge } =
      await load()
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()
    expect(bridge.readFiles).not.toHaveBeenCalled()

    runtime.available = true
    runtime.availabilityListeners.forEach((listener) =>
      listener({ available: true })
    )

    await vi.waitFor(() => expect(hasPhoneContact(useContacts)).toBe(true))
  })

  it('leaves the first pull to the enable flow when sync is switched on', async () => {
    const { installiCloudSync, useSupporter, usePreferences, bridge } =
      await load()
    usePreferences.setState({ iCloudSyncEnabled: false })
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()

    // "Keep this device's data" enables sync, then wipes the remote files; a
    // pull in between would merge the data the user chose to discard.
    usePreferences.getState().set({ iCloudSyncEnabled: true })
    await Promise.resolve()

    expect(bridge.readFiles).not.toHaveBeenCalled()
  })

  it('pushes an edit made before sync was ready', async () => {
    runtime.files = []
    const {
      installiCloudSync,
      iCloudSync,
      useSupporter,
      useContacts,
      bridge,
      usePreferences,
    } = await load()
    uninstall = installiCloudSync()

    useContacts.getState().set({
      contacts: [{ id: 'early', name: 'Edited at launch' } as never],
    })
    expect(iCloudSync.isPushScheduled()).toBe(false)

    useSupporter.getState().setSupporter(true)

    await vi.waitFor(() => expect(bridge.write).toHaveBeenCalled())
    expect(usePreferences.getState().iCloudSyncPendingPush).toBe(false)
  })
})

describe('image cleanup on catch-up', () => {
  beforeEach(() => {
    runtime.binaries = [
      { filename: INCOMING_PHOTO, modifiedAt: 1 },
      { filename: ORPHAN_PHOTO, modifiedAt: 1 },
    ]
  })

  it('keeps a photo whose contact arrives in the same catch-up', async () => {
    const { installiCloudSync, useSupporter, usePreferences, bridge } =
      await load()
    usePreferences.setState({ iCloudSyncIncludeImages: true })
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()

    runtime.appStateListeners.forEach((listener) => listener('active'))

    await vi.waitFor(() =>
      expect(bridge.deleteBinaryFile).toHaveBeenCalledWith(ORPHAN_PHOTO)
    )
    expect(bridge.deleteBinaryFile).not.toHaveBeenCalledWith(INCOMING_PHOTO)
  })

  it('judges cleanup by the newest pull, not one it joined', async () => {
    runtime.files = []
    runtime.appState = 'background'
    const { installiCloudSync, useSupporter, usePreferences, bridge } =
      await load()
    usePreferences.setState({ iCloudSyncIncludeImages: true })
    useSupporter.getState().setSupporter(true)
    let finishFirstRead: (read: { files: []; pending: [] }) => void = () => {}
    vi.mocked(bridge.readFiles).mockImplementationOnce(
      () => new Promise((resolve) => (finishFirstRead = resolve))
    )
    uninstall = installiCloudSync()

    // A remote-change pull is mid-read when the app comes to the foreground,
    // so the catch-up joins it and queues a follow-up.
    runtime.remoteChangeListeners.forEach((listener) => listener())
    runtime.appState = 'active'
    runtime.appStateListeners.forEach((listener) => listener('active'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The joined pull saw everything; the follow-up finds the phone's new
    // file still downloading.
    runtime.pending = [PHONE_FILE]
    finishFirstRead({ files: [], pending: [] })

    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(bridge.deleteBinaryFile).not.toHaveBeenCalled()
  })

  it('skips cleanup while a remote file is still downloading', async () => {
    runtime.pending = ['witness-work-watch.json']
    const { installiCloudSync, useSupporter, usePreferences, bridge } =
      await load()
    usePreferences.setState({ iCloudSyncIncludeImages: true })
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()

    runtime.appStateListeners.forEach((listener) => listener('active'))

    // The incoming photo downloading means the pull is done; every later
    // step resolves without timers, so one macrotask lets the catch-up end.
    await vi.waitFor(() => expect(bridge.readBinary).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(bridge.deleteBinaryFile).not.toHaveBeenCalled()
  })

  it('stops before deleting a photo whose contact a new pull brings in', async () => {
    // The phone's contact hasn't been pushed yet, so its photo looks orphaned
    // to the complete (empty) pull GC runs after.
    runtime.files = []
    runtime.binaries = [
      { filename: ORPHAN_PHOTO, modifiedAt: 1 },
      { filename: INCOMING_PHOTO, modifiedAt: 1 },
    ]
    const {
      installiCloudSync,
      useSupporter,
      usePreferences,
      useContacts,
      bridge,
    } = await load()
    usePreferences.setState({ iCloudSyncIncludeImages: true })
    useSupporter.getState().setSupporter(true)
    let finishDelete: () => void = () => {}
    vi.mocked(bridge.deleteBinaryFile).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishDelete = resolve))
    )
    uninstall = installiCloudSync()
    await vi.waitFor(() =>
      expect(bridge.deleteBinaryFile).toHaveBeenCalledWith(ORPHAN_PHOTO)
    )

    // Mid-sweep, the phone's push lands and its remote-change pull starts.
    runtime.files = [phonePayload()]
    runtime.remoteChangeListeners.forEach((listener) => listener())
    finishDelete()

    await vi.waitFor(() => expect(hasPhoneContact(useContacts)).toBe(true))
    await settle()
    expect(bridge.deleteBinaryFile).not.toHaveBeenCalledWith(INCOMING_PHOTO)
  })

  it('stops when a contact is added mid-sweep', async () => {
    const LOCAL_PHOTO = 'witness-work-img-contact-added-here.jpg'
    runtime.files = []
    runtime.binaries = [
      { filename: ORPHAN_PHOTO, modifiedAt: 1 },
      { filename: LOCAL_PHOTO, modifiedAt: 1 },
    ]
    const {
      installiCloudSync,
      useSupporter,
      usePreferences,
      useContacts,
      bridge,
    } = await load()
    usePreferences.setState({ iCloudSyncIncludeImages: true })
    useSupporter.getState().setSupporter(true)
    let finishDelete: () => void = () => {}
    vi.mocked(bridge.deleteBinaryFile).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishDelete = resolve))
    )
    uninstall = installiCloudSync()
    await vi.waitFor(() =>
      expect(bridge.deleteBinaryFile).toHaveBeenCalledWith(ORPHAN_PHOTO)
    )

    // The photo of a contact saved meanwhile is uploaded straight away.
    useContacts.getState().set({
      contacts: [{ id: 'added-here', name: 'Added here' } as never],
    })
    finishDelete()

    await settle()
    expect(bridge.deleteBinaryFile).not.toHaveBeenCalledWith(LOCAL_PHOTO)
  })

  it('stays off, with a breadcrumb, while a peer writes a newer payload version', async () => {
    runtime.files = [phonePayload(99)]
    const {
      installiCloudSync,
      useSupporter,
      usePreferences,
      bridge,
      errorTracking,
    } = await load()
    usePreferences.setState({ iCloudSyncIncludeImages: true })
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()

    await vi.waitFor(() =>
      expect(errorTracking.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('newer payload version'),
        })
      )
    )
    await settle()
    // Its contacts can't be merged, so their photos look orphaned.
    expect(bridge.deleteBinaryFile).not.toHaveBeenCalled()
  })
})

describe('retrying a failed read', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pulls again after a failed read', async () => {
    const { installiCloudSync, useSupporter, useContacts, bridge } =
      await load()
    vi.mocked(bridge.readFiles).mockRejectedValueOnce(new Error('offline'))
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()

    await vi.advanceTimersByTimeAsync(0)
    expect(bridge.readFiles).toHaveBeenCalledTimes(1)
    expect(hasPhoneContact(useContacts)).toBe(false)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(hasPhoneContact(useContacts)).toBe(true)
  })

  it('gives up after a few attempts, reporting the outage once', async () => {
    const { installiCloudSync, useSupporter, bridge, errorTracking } =
      await load()
    vi.mocked(bridge.readFiles).mockRejectedValue(new Error('offline'))
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()

    await vi.advanceTimersByTimeAsync(60 * 60_000)

    expect(bridge.readFiles).toHaveBeenCalledTimes(4)
    expect(errorTracking.captureException).toHaveBeenCalledTimes(1)
  })

  it('stops retrying once the app leaves the foreground', async () => {
    const { installiCloudSync, useSupporter, bridge } = await load()
    vi.mocked(bridge.readFiles).mockRejectedValue(new Error('offline'))
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()
    await vi.advanceTimersByTimeAsync(0)

    runtime.appState = 'background'
    runtime.appStateListeners.forEach((listener) => listener('background'))
    await vi.advanceTimersByTimeAsync(60 * 60_000)

    expect(bridge.readFiles).toHaveBeenCalledTimes(1)
  })

  it('stops retrying once sync is turned off', async () => {
    const { installiCloudSync, useSupporter, usePreferences, bridge } =
      await load()
    vi.mocked(bridge.readFiles).mockRejectedValue(new Error('offline'))
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()
    await vi.advanceTimersByTimeAsync(0)

    usePreferences.setState({ iCloudSyncEnabled: false })
    await vi.advanceTimersByTimeAsync(60 * 60_000)

    expect(bridge.readFiles).toHaveBeenCalledTimes(1)
  })

  it('stops retrying on uninstall', async () => {
    const { installiCloudSync, useSupporter, bridge } = await load()
    vi.mocked(bridge.readFiles).mockRejectedValue(new Error('offline'))
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()
    await vi.advanceTimersByTimeAsync(0)

    uninstall()
    uninstall = () => {}
    await vi.advanceTimersByTimeAsync(60 * 60_000)

    expect(bridge.readFiles).toHaveBeenCalledTimes(1)
  })
})

it('persists a failed push and retries it without another user edit', async () => {
  vi.useFakeTimers()
  try {
    runtime.files = []
    const {
      installiCloudSync,
      useSupporter,
      usePreferences,
      bridge,
      iCloudSync,
    } = await load()
    useSupporter.getState().setSupporter(true)
    uninstall = installiCloudSync()
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(bridge.write).mockClear()
    vi.mocked(bridge.write).mockRejectedValueOnce(new Error('temporary'))
    expect(await iCloudSync.push('manual')).toBe(false)
    expect(usePreferences.getState()).toMatchObject({
      iCloudSyncPendingPush: true,
      iCloudSyncIssue: 'push-failed',
    })
    await vi.advanceTimersByTimeAsync(5000)
    expect(bridge.write).toHaveBeenCalledTimes(2)
    expect(usePreferences.getState()).toMatchObject({
      iCloudSyncPendingPush: false,
      iCloudSyncIssue: null,
    })
  } finally {
    vi.useRealTimers()
  }
})

it('sends persisted pending work when the runtime is reinstalled', async () => {
  runtime.files = []
  const { installiCloudSync, useSupporter, usePreferences, bridge } =
    await load()
  usePreferences.setState({ iCloudSyncPendingPush: true })
  useSupporter.getState().setSupporter(true)
  uninstall = installiCloudSync()
  await vi.waitFor(() => expect(bridge.write).toHaveBeenCalledOnce())
  expect(usePreferences.getState().iCloudSyncPendingPush).toBe(false)
})

it('keeps healthy peers syncing while surfacing a malformed peer', async () => {
  runtime.files = [
    phonePayload(),
    {
      filename: 'witness-work-bad.json',
      modifiedAt: 1000,
      json: JSON.stringify({
        ...JSON.parse(phonePayload().json),
        serviceReportStore: {
          serviceReports: { 2026: { 8: [null] } },
          dayPlans: [],
          recurringPlans: [],
        },
      }),
    },
  ]
  const { installiCloudSync, useSupporter, usePreferences, useContacts } =
    await load()
  useSupporter.getState().setSupporter(true)
  uninstall = installiCloudSync()
  await vi.waitFor(() => expect(hasPhoneContact(useContacts)).toBe(true))
  expect(usePreferences.getState().iCloudSyncIssue).toBe('invalid-file')
})

it('surfaces newer payloads instead of reporting a complete sync', async () => {
  runtime.files = [phonePayload(99)]
  const { installiCloudSync, useSupporter, usePreferences } = await load()
  useSupporter.getState().setSupporter(true)
  uninstall = installiCloudSync()
  await vi.waitFor(() =>
    expect(usePreferences.getState().iCloudSyncIssue).toBe('newer-version')
  )
})

it('stops an in-flight merge after Set up fresh disables sync', async () => {
  runtime.appState = 'background'
  const {
    installiCloudSync,
    iCloudSync,
    useSupporter,
    usePreferences,
    useContacts,
    bridge,
  } = await load()
  useSupporter.getState().setSupporter(true)
  uninstall = installiCloudSync()
  let finish: (value: {
    files: SyncFile[]
    pending: string[]
  }) => void = () => {}
  vi.mocked(bridge.readFiles).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pull = iCloudSync.pullAndMerge('manual')
  await Promise.resolve()
  usePreferences.getState().set({
    iCloudSyncEnabled: false,
    iCloudSyncSetByUser: true,
    iCloudFreshSetup: true,
  })
  finish({ files: [phonePayload()], pending: [] })
  await pull
  expect(hasPhoneContact(useContacts)).toBe(false)
})

it('does not delete legacy files after reading them', async () => {
  runtime.files = [{ ...phonePayload(), filename: 'witness-work.json' }]
  const { installiCloudSync, useSupporter, useContacts, bridge } = await load()
  useSupporter.getState().setSupporter(true)
  uninstall = installiCloudSync()
  await vi.waitFor(() => expect(hasPhoneContact(useContacts)).toBe(true))
  expect(bridge.deleteFile).not.toHaveBeenCalled()
})

it('reports failed photo enablement before transferring photo bytes', async () => {
  runtime.appState = 'background'
  runtime.files = []
  const {
    installiCloudSync,
    useSupporter,
    iCloudSync,
    bridge,
    usePreferences,
  } = await load()
  useSupporter.getState().setSupporter(true)
  uninstall = installiCloudSync()
  vi.mocked(bridge.write).mockRejectedValueOnce(new Error('storage full'))

  await expect(iCloudSync.enableImageSync()).rejects.toThrow(
    'Could not write photo references to iCloud'
  )
  expect(usePreferences.getState().iCloudSyncPendingPush).toBe(true)
  expect(bridge.writeBinary).not.toHaveBeenCalled()
  expect(bridge.readBinary).not.toHaveBeenCalled()
})

const localPhoto = (revision = 'a') => ({
  id: 'c',
  name: 'Contact',
  createdAt: new Date(0),
  updatedAt: 100,
  avatar: {
    type: 'image' as const,
    revision,
    value: `file:///test/Documents/contact-c-avatar-picked-${revision}.jpg`,
  },
})
const availablePhotos = async () => {
  const fs = await import('expo-file-system/legacy')
  vi.mocked(fs.getInfoAsync).mockImplementation(async (uri) => ({
    exists: true,
    uri,
    isDirectory: false,
    size: 1,
    modificationTime: 0.5,
  }))
  return fs
}

it('does not upload bytes after a failed foreground JSON publication', async () => {
  runtime.files = []
  const {
    installiCloudSync,
    useSupporter,
    usePreferences,
    useContacts,
    bridge,
  } = await load()
  useContacts.setState({ contacts: [localPhoto()] })
  usePreferences.setState({ iCloudSyncIncludeImages: true })
  useSupporter.getState().setSupporter(true)
  await availablePhotos()
  vi.mocked(bridge.write).mockRejectedValue(new Error('storage full'))
  uninstall = installiCloudSync()
  await vi.waitFor(() => expect(bridge.write).toHaveBeenCalled())
  await settle()
  expect(bridge.writeBinary).not.toHaveBeenCalled()
})

it('uploads only the photo revision included in the successful JSON snapshot', async () => {
  runtime.appState = 'background'
  runtime.files = []
  const {
    installiCloudSync,
    useSupporter,
    usePreferences,
    useContacts,
    bridge,
    iCloudSync,
  } = await load()
  useContacts.setState({ contacts: [localPhoto()] })
  usePreferences.setState({ iCloudSyncIncludeImages: true })
  useSupporter.getState().setSupporter(true)
  await availablePhotos()
  uninstall = installiCloudSync()
  let finish: (mtime: number) => void = () => {}
  vi.mocked(bridge.write).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const push = iCloudSync.push('manual')
  await vi.waitFor(() => expect(bridge.write).toHaveBeenCalledOnce())
  useContacts.setState({ contacts: [localPhoto('b')] })
  finish(1)
  await push
  expect(bridge.writeBinary).toHaveBeenCalledWith(
    'witness-work-img-contact-c--a.jpg',
    localPhoto().avatar.value
  )
  expect(bridge.writeBinary).not.toHaveBeenCalledWith(
    'witness-work-img-contact-c--b.jpg',
    expect.anything()
  )
})

it('pushes edits whose debounce fired during a slow photo upload', async () => {
  vi.useFakeTimers()
  try {
    runtime.appState = 'background'
    runtime.files = []
    const {
      installiCloudSync,
      useSupporter,
      usePreferences,
      useContacts,
      bridge,
      iCloudSync,
    } = await load()
    useContacts.setState({ contacts: [localPhoto()] })
    usePreferences.setState({ iCloudSyncIncludeImages: true })
    useSupporter.getState().setSupporter(true)
    await availablePhotos()
    uninstall = installiCloudSync()
    let finish: (mtime: number) => void = () => {}
    vi.mocked(bridge.writeBinary).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const push = iCloudSync.push('manual')
    await vi.advanceTimersByTimeAsync(0)
    expect(bridge.writeBinary).toHaveBeenCalledOnce()
    useContacts.setState({
      contacts: [{ ...localPhoto(), name: 'Edited while uploading' }],
    })
    await vi.advanceTimersByTimeAsync(5000)
    expect(bridge.write).toHaveBeenCalledOnce()
    finish(1000)
    await push
    await vi.advanceTimersByTimeAsync(5000)
    expect(bridge.write).toHaveBeenCalledTimes(2)
    const json = vi.mocked(bridge.write).mock.calls[1][1]
    expect(JSON.parse(json).contactStore.contacts[0].name).toBe(
      'Edited while uploading'
    )
    expect(usePreferences.getState().iCloudSyncPendingPush).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

it('does not schedule JSON pushes for unchanged photo materialization', async () => {
  runtime.appState = 'background'
  runtime.files = []
  runtime.binaries = [
    { filename: 'witness-work-img-contact-c--a.jpg', modifiedAt: 1000 },
  ]
  const {
    installiCloudSync,
    useSupporter,
    usePreferences,
    useContacts,
    iCloudSync,
    bridge,
  } = await load()
  useContacts.setState({
    contacts: [
      {
        ...localPhoto(),
        avatar: {
          ...localPhoto().avatar,
          value: 'file:///test/Documents/contact-c-avatar-synced-a.jpg?t=500',
        },
      },
    ],
  })
  usePreferences.setState({
    iCloudSyncIncludeImages: true,
    iCloudImageSync: {
      'witness-work-img-contact-c--a.jpg': {
        localMtime: 500,
        uploadedMtime: 500,
        containerMtime: 1000,
      },
    },
  })
  useSupporter.getState().setSupporter(true)
  await availablePhotos()
  uninstall = installiCloudSync()
  await iCloudSync.pullImagesIfEnabled()
  await iCloudSync.pullImagesIfEnabled()
  expect(bridge.readBinary).not.toHaveBeenCalled()
  expect(iCloudSync.isPushScheduled()).toBe(false)
})

it('removes private bytes and bookkeeping from a superseded in-flight profile download', async () => {
  runtime.appState = 'background'
  runtime.files = []
  runtime.binaries = [
    { filename: 'witness-work-img-profile--a.jpg', modifiedAt: 1000 },
  ]
  const { installiCloudSync, usePreferences, iCloudSync, bridge } = await load()
  const { useProfile } = await import('@/stores/profile')
  const fs = await import('expo-file-system/legacy')
  useProfile.setState({
    avatar: { type: 'image', value: 'icloud://profile', revision: 'a' },
    profileUpdatedAt: { avatar: 100 },
  })
  usePreferences.setState({ iCloudSyncIncludeImages: true })
  uninstall = installiCloudSync()
  let finish: (mtime: number) => void = () => {}
  vi.mocked(bridge.readBinary).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pull = iCloudSync.pullImagesIfEnabled()
  await vi.waitFor(() => expect(bridge.readBinary).toHaveBeenCalledOnce())
  useProfile.getState().set({ avatar: { type: 'none', value: '' } })
  await availablePhotos()
  finish(1000)
  await pull
  expect(useProfile.getState().avatar.type).toBe('none')
  expect(fs.deleteAsync).toHaveBeenCalledWith(
    'file:///test/Documents/profile-avatar-synced-a.jpg',
    { idempotent: true }
  )
  expect(usePreferences.getState().iCloudImageSync).not.toHaveProperty(
    'witness-work-img-profile--a.jpg'
  )
})

it('rechecks each obsolete download after a prior deletion awaited IO', async () => {
  runtime.appState = 'background'
  runtime.files = []
  runtime.binaries = ['a', 'b'].map((id) => ({
    filename: `witness-work-img-contact-${id}--r.jpg`,
    modifiedAt: 1000,
  }))
  const { installiCloudSync, usePreferences, useContacts, iCloudSync, bridge } =
    await load()
  const fs = await import('expo-file-system/legacy')
  const contacts = ['a', 'b'].map((id) => ({
    id,
    name: id,
    createdAt: new Date(),
    updatedAt: 100,
    avatar: {
      type: 'image' as const,
      value: `icloud://contact-${id}`,
      revision: 'r',
    },
  }))
  useContacts.setState({ contacts })
  usePreferences.setState({ iCloudSyncIncludeImages: true })
  uninstall = installiCloudSync()
  const finishes: Array<(mtime: number) => void> = []
  vi.mocked(bridge.readBinary).mockImplementation(
    () =>
      new Promise<number>((resolve) => {
        finishes.push(resolve)
      })
  )
  let finishDelete: () => void = () => {}
  vi.mocked(fs.deleteAsync).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishDelete = resolve
      })
  )
  const pull = iCloudSync.pullImagesIfEnabled()
  await vi.waitFor(() => expect(finishes).toHaveLength(2))
  useContacts.setState({ contacts: [] })
  await availablePhotos()
  finishes.forEach((finish) => finish(1000))
  await vi.waitFor(() =>
    expect(fs.deleteAsync).toHaveBeenCalledWith(
      'file:///test/Documents/contact-a-avatar-synced-r.jpg',
      { idempotent: true }
    )
  )
  useContacts.setState({
    contacts: [
      {
        ...contacts[1],
        avatar: {
          ...contacts[1].avatar,
          value: 'file:///test/Documents/contact-b-avatar-synced-r.jpg',
        },
      },
    ],
  })
  finishDelete()
  await pull
  expect(fs.deleteAsync).not.toHaveBeenCalledWith(
    'file:///test/Documents/contact-b-avatar-synced-r.jpg',
    expect.anything()
  )
  expect(usePreferences.getState().iCloudImageSync).not.toHaveProperty(
    'witness-work-img-contact-a--r.jpg'
  )
  expect(usePreferences.getState().iCloudImageSync).toHaveProperty(
    'witness-work-img-contact-b--r.jpg'
  )
})

describe('confirming the upload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    runtime.files = []
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const start = async () => {
    const loaded = await load()
    const { analytics } = await import('@/lib/analytics')
    loaded.useSupporter.getState().setSupporter(true)
    uninstall = loaded.installiCloudSync()
    await vi.advanceTimersByTimeAsync(0)
    return { ...loaded, analytics }
  }
  const quotaFull = {
    uploaded: false,
    uploading: false,
    error: { domain: 'NSCocoaErrorDomain', code: 4354 },
  }

  it('waits after a write until iCloud confirms the upload', async () => {
    const { usePreferences, bridge } = await start()
    expect(bridge.write).toHaveBeenCalled()
    expect(usePreferences.getState().iCloudUploadPendingSince).not.toBeNull()
    expect(usePreferences.getState().lastiCloudUploadedAt).toBeNull()

    await vi.advanceTimersByTimeAsync(3_000)

    expect(bridge.uploadStatus).toHaveBeenCalledWith('witness-work-ipad.json')
    expect(usePreferences.getState()).toMatchObject({
      iCloudUploadPendingSince: null,
      iCloudUploadIssue: null,
    })
    expect(usePreferences.getState().lastiCloudUploadedAt).toEqual(
      expect.any(Number)
    )
  })

  it('keeps checking with a bounded backoff while the upload is queued', async () => {
    const { usePreferences, bridge } = await load()
    vi.mocked(bridge.uploadStatus).mockResolvedValue({
      uploaded: false,
      uploading: true,
      error: null,
    })
    await start()

    await vi.advanceTimersByTimeAsync(60 * 60_000)

    expect(bridge.uploadStatus).toHaveBeenCalledTimes(6)
    expect(usePreferences.getState().iCloudUploadPendingSince).not.toBeNull()
    expect(usePreferences.getState().iCloudUploadIssue).toBeNull()
  })

  it('surfaces full iCloud storage without pushing again, then recovers', async () => {
    const { bridge } = await load()
    vi.mocked(bridge.uploadStatus).mockResolvedValue(quotaFull)
    const { usePreferences, analytics } = await start()
    const writes = vi.mocked(bridge.write).mock.calls.length

    await vi.advanceTimersByTimeAsync(3_000)

    expect(usePreferences.getState().iCloudUploadIssue).toBe('icloud-full')
    expect(analytics.capture).toHaveBeenCalledWith(
      'icloud_sync_upload_failed',
      { reason: 'icloud_full' }
    )
    // Later checks repeat neither the event nor the write.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(bridge.uploadStatus).toHaveBeenCalledTimes(2)
    expect(
      vi
        .mocked(analytics.capture)
        .mock.calls.filter(([event]) => event === 'icloud_sync_upload_failed')
    ).toHaveLength(1)
    expect(bridge.write).toHaveBeenCalledTimes(writes)

    // A new write doesn't clear the issue on its own...
    expect(await (await import('@/app/sync/iCloudSync')).push('manual')).toBe(
      true
    )
    expect(usePreferences.getState().iCloudUploadIssue).toBe('icloud-full')

    // ...but a confirmed upload does.
    vi.mocked(bridge.uploadStatus).mockResolvedValue({
      uploaded: true,
      uploading: false,
      error: null,
    })
    await vi.advanceTimersByTimeAsync(3_000)
    expect(usePreferences.getState()).toMatchObject({
      iCloudUploadIssue: null,
      iCloudUploadPendingSince: null,
    })
    expect(analytics.capture).toHaveBeenCalledWith(
      'icloud_sync_upload_recovered',
      { previous_issue: 'icloud_full' }
    )
  })

  it('treats unreachable servers as still uploading', async () => {
    const { bridge } = await load()
    vi.mocked(bridge.uploadStatus).mockResolvedValue({
      uploaded: false,
      uploading: false,
      error: { domain: 'NSCocoaErrorDomain', code: 4355 },
    })
    const { usePreferences } = await start()

    await vi.advanceTimersByTimeAsync(3_000)

    expect(usePreferences.getState().iCloudUploadIssue).toBeNull()
    expect(usePreferences.getState().iCloudUploadPendingSince).not.toBeNull()
  })

  it("doesn't confirm a write made while the check was reading", async () => {
    const { bridge, iCloudSync, usePreferences } = await start()
    let answer: (status: ICloudStatusAnswer) => void = () => {}
    vi.mocked(bridge.uploadStatus).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    )
    const check = iCloudSync.checkUpload()
    await vi.advanceTimersByTimeAsync(0)
    await iCloudSync.push('manual')
    answer({ uploaded: true, uploading: false, error: null })

    expect(await check).toBe('waiting')
    expect(usePreferences.getState().iCloudUploadPendingSince).not.toBeNull()
  })

  it('stops checking once the app leaves the foreground', async () => {
    const { bridge } = await start()
    runtime.appState = 'background'
    runtime.appStateListeners.forEach((listener) => listener('background'))

    await vi.advanceTimersByTimeAsync(60 * 60_000)

    expect(bridge.uploadStatus).not.toHaveBeenCalled()
  })

  it('keeps the previous behaviour on a binary that predates upload status', async () => {
    runtime.uploadSupported = false
    const { usePreferences, bridge, iCloudSync } = await start()

    await vi.advanceTimersByTimeAsync(60 * 60_000)

    expect(bridge.write).toHaveBeenCalled()
    expect(bridge.uploadStatus).not.toHaveBeenCalled()
    expect(usePreferences.getState()).toMatchObject({
      iCloudUploadPendingSince: null,
      lastiCloudUploadedAt: null,
      iCloudUploadIssue: null,
    })
    expect(usePreferences.getState().lastiCloudPushedAt).toEqual(
      expect.any(Number)
    )
    expect(await iCloudSync.checkUpload()).toBeNull()
  })
})

type ICloudStatusAnswer = {
  uploaded: boolean
  uploading: boolean
  error: { domain: string; code: number } | null
}
