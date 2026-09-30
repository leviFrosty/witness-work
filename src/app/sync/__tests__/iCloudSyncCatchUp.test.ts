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
  waitForInitialScan: vi.fn(async () => true),
  readFiles: vi.fn(async (include: (filename: string) => boolean) => ({
    files: runtime.files.filter((f) => include(f.filename)),
    pending: runtime.pending.filter(include),
  })),
  write: vi.fn(async () => 1),
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
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  const { usePreferences } = await import('@/stores/preferences')
  const { default: useContacts } = await import('@/stores/contactsStore')
  const { errorTracking } = await import('@/lib/errorTracking')
  usePreferences.setState({
    iCloudSyncEnabled: true,
    iCloudDeviceId: 'ipad',
    hasMigratedToSyncSchema: true,
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

beforeEach(() => {
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
    const { installiCloudSync, iCloudSync, useSupporter, useContacts } =
      await load()
    uninstall = installiCloudSync()

    useContacts.getState().set({
      contacts: [{ id: 'early', name: 'Edited at launch' } as never],
    })
    expect(iCloudSync.isPushScheduled()).toBe(false)

    useSupporter.getState().setSupporter(true)

    await vi.waitFor(() => expect(iCloudSync.isPushScheduled()).toBe(true))
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
