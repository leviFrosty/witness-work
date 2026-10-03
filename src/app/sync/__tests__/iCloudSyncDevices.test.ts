import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Devices list against a fake container: pulls record each device's file
// from the reads they already make, and removal deletes another device's file
// only once this device holds its data.

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  appState: 'active',
  files: [] as SyncFile[],
  binaries: [] as string[],
  failWrites: false,
  failDeletes: false,
  pending: [] as string[],
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    get currentState() {
      return runtime.appState
    },
    addEventListener: () => ({ remove: () => {} }),
  },
}))
vi.mock('../../../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  supportsUploadStatus: () => false,
  identityToken: () => null,
  waitForInitialScan: vi.fn(async () => true),
  readFiles: vi.fn(async (include: (filename: string) => boolean) => ({
    files: runtime.files.filter(
      (f) => include(f.filename) && !runtime.pending.includes(f.filename)
    ),
    pending: runtime.pending.filter(include),
  })),
  write: vi.fn(async (filename: string, json: string) => {
    if (runtime.failWrites) throw new Error('write failed')
    runtime.files = [
      ...runtime.files.filter((f) => f.filename !== filename),
      { filename, json, modifiedAt: Date.now() },
    ]
    return Date.now()
  }),
  deleteFile: vi.fn(async (filename: string) => {
    if (runtime.failDeletes) throw new Error('delete failed')
    runtime.files = runtime.files.filter((f) => f.filename !== filename)
  }),
  deleteAll: vi.fn(async () => {
    runtime.files = []
  }),
  writeBinary: vi.fn(async () => 1),
  readBinary: vi.fn(async () => 1),
  listBinaryFiles: vi.fn(async () =>
    runtime.binaries.map((filename) => ({ filename, modifiedAt: 1 }))
  ),
  deleteBinaryFile: vi.fn(async (filename: string) => {
    runtime.binaries = runtime.binaries.filter((f) => f !== filename)
  }),
  deleteAllBinaries: vi.fn(async () => {
    runtime.binaries = []
  }),
  addRemoteChangeListener: () => ({ remove: () => {} }),
  addAvailabilityChangeListener: () => ({ remove: () => {} }),
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
}))
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(),
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
vi.mock('@/lib/syncClock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/syncClock')>()),
  refreshSyncClock: vi.fn(async () => null),
}))

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()
const OLD = NOW - 5_000

type Epoch = { id: string; at: number; deviceId: string }
const E1: Epoch = { id: 'e1', at: NOW - 60_000, deviceId: 'ipad' }

const payload = (deviceId: string, deviceName?: string, epoch?: Epoch) => ({
  version: 1,
  writtenAt: OLD,
  deviceId,
  ...(deviceName ? { deviceName } : {}),
  ...(epoch ? { resetEpoch: epoch } : {}),
  contactStore: { contacts: [], deletedContacts: [] },
  conversationStore: { conversations: [], deletedConversations: [] },
  serviceReportStore: {
    serviceReports: {},
    dayPlans: [],
    recurringPlans: [],
    deletedServiceReports: [],
  },
  categoryStore: { categories: [], deletedCategories: [] },
  preferencesStore: { values: {}, updatedAt: {} },
})

const file = (filename: string, json: unknown, modifiedAt = OLD): SyncFile => ({
  filename,
  modifiedAt,
  json: typeof json === 'string' ? json : JSON.stringify(json),
})
const peerFile = (
  deviceId: string,
  deviceName?: string,
  epoch?: Epoch,
  modifiedAt = OLD
) =>
  file(
    `witness-work-${deviceId}.json`,
    payload(deviceId, deviceName, epoch),
    modifiedAt
  )
const OWN_FILE = file('witness-work-ipad.json', payload('ipad', 'iPad', E1))
const ACCOUNT_FILE = file('witness-work-account.json', '{"accountId":"a"}')

const load = async () => {
  const sync = await import('@/app/sync/iCloudSync')
  const bridge = await import('../../../../modules/icloud-bridge')
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  const { usePreferences } = await import('@/stores/preferences')
  usePreferences.setState({
    iCloudSyncEnabled: true,
    iCloudDeviceId: 'ipad',
    iCloudResetEpoch: E1,
    iCloudSyncDevices: {},
    hasMigratedToSyncSchema: true,
    hasReconciledSyncDefinitions: true,
  })
  useSupporter.getState().setSupporter(true)
  return { ...sync, bridge, usePreferences }
}

const devices = (state: { iCloudSyncDevices: Record<string, unknown> }) =>
  state.iCloudSyncDevices as Record<
    string,
    { status: string; deviceName: string | null; seenAt: number }
  >

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  runtime.appState = 'active'
  runtime.files = []
  runtime.binaries = []
  runtime.failWrites = false
  runtime.failDeletes = false
  runtime.pending = []
})

describe('recording device files during a pull', () => {
  it('records every status from the one read the pull makes', async () => {
    const { pullAndMerge, bridge, usePreferences } = await load()
    runtime.files = [
      ACCOUNT_FILE,
      OWN_FILE,
      peerFile('phone', 'iPhone', E1, NOW - 2 * DAY),
      peerFile('old', 'Old iPhone'),
      file('witness-work-future.json', { ...payload('future'), version: 99 }),
      file('witness-work-broken.json', '{not json'),
      file('witness-work 2.json', payload('legacy', 'iPod', E1)),
    ]

    await pullAndMerge('test')

    expect(bridge.readFiles).toHaveBeenCalledTimes(1)
    const recorded = devices(usePreferences.getState())
    expect(Object.keys(recorded).sort()).toEqual([
      'witness-work 2.json',
      'witness-work-broken.json',
      'witness-work-future.json',
      'witness-work-ipad.json',
      'witness-work-old.json',
      'witness-work-phone.json',
    ])
    expect(recorded['witness-work-ipad.json']).toMatchObject({
      deviceId: 'ipad',
      deviceName: 'iPad',
      status: 'ok',
    })
    expect(recorded['witness-work-phone.json']).toMatchObject({
      deviceId: 'phone',
      deviceName: 'iPhone',
      // An uncalibrated writer's stamps are anchored to the file's date.
      writtenAt: NOW - 2 * DAY,
      modifiedAt: NOW - 2 * DAY,
      status: 'ok',
    })
    // Generation zero, older than this device's reset.
    expect(recorded['witness-work-old.json'].status).toBe('pre-reset')
    expect(recorded['witness-work-future.json']).toMatchObject({
      deviceId: 'future',
      status: 'newer-version',
    })
    expect(recorded['witness-work-broken.json'].status).toBe('unreadable')
    expect(recorded['witness-work 2.json']).toMatchObject({
      deviceId: 'legacy',
      status: 'ok',
    })
  })

  it('compares against a newer generation the pull adopts', async () => {
    const { pullAndMerge, usePreferences } = await load()
    const E2 = { id: 'e2', at: NOW - 1_000, deviceId: 'mac' }
    runtime.files = [OWN_FILE, peerFile('mac', 'Mac', E2), peerFile('phone')]

    await pullAndMerge('test')

    expect(usePreferences.getState().iCloudResetEpoch).toMatchObject(E2)
    const recorded = devices(usePreferences.getState())
    expect(recorded['witness-work-mac.json'].status).toBe('ok')
    expect(recorded['witness-work-phone.json'].status).toBe('pre-reset')
  })

  it('drops files no longer listed only after a complete read', async () => {
    const { pullAndMerge, usePreferences } = await load()
    runtime.files = [OWN_FILE, peerFile('phone', 'iPhone', E1), peerFile('old')]
    await pullAndMerge('test')

    // `phone` is still downloading and `old` is gone: keep both entries.
    runtime.files = [OWN_FILE, peerFile('phone', 'iPhone', E1)]
    runtime.pending = ['witness-work-phone.json']
    await pullAndMerge('test')
    expect(Object.keys(devices(usePreferences.getState())).sort()).toEqual([
      'witness-work-ipad.json',
      'witness-work-old.json',
      'witness-work-phone.json',
    ])

    runtime.pending = []
    await pullAndMerge('test')
    expect(Object.keys(devices(usePreferences.getState())).sort()).toEqual([
      'witness-work-ipad.json',
      'witness-work-phone.json',
    ])
  })

  it('records nothing once the Apple Account changed', async () => {
    const { ACCOUNT_CHANGE_RESET } = await import('@/lib/iCloudIdentity')
    expect(ACCOUNT_CHANGE_RESET.iCloudSyncDevices).toEqual({})
    const { pullAndMerge, usePreferences } = await load()
    usePreferences.setState({ iCloudSyncEnabled: false })
    runtime.files = [OWN_FILE, peerFile('phone', 'iPhone', E1)]
    await pullAndMerge('test')
    expect(usePreferences.getState().iCloudSyncDevices).toEqual({})
  })
})

describe('removing a device', () => {
  it("deletes another device's file after a complete pull", async () => {
    const { removeSyncDevice, bridge, usePreferences } = await load()
    runtime.files = [ACCOUNT_FILE, OWN_FILE, peerFile('phone', 'iPhone', E1)]

    const result = await removeSyncDevice('witness-work-phone.json')

    expect(result).toMatchObject({
      outcome: 'removed',
      entry: { status: 'ok', deviceName: 'iPhone' },
    })
    expect(bridge.deleteFile).toHaveBeenCalledExactlyOnceWith(
      'witness-work-phone.json'
    )
    expect(runtime.files.map((f) => f.filename).sort()).toEqual([
      'witness-work-account.json',
      'witness-work-ipad.json',
    ])
    expect(
      devices(usePreferences.getState())['witness-work-phone.json']
    ).toBeUndefined()
  })

  it('asks to sync first while the pull is incomplete', async () => {
    const { removeSyncDevice, bridge } = await load()
    runtime.files = [
      OWN_FILE,
      peerFile('phone', 'iPhone', E1),
      peerFile('slow', 'iPad mini', E1),
    ]
    runtime.pending = ['witness-work-slow.json']

    expect((await removeSyncDevice('witness-work-phone.json')).outcome).toBe(
      'sync-first'
    )
    expect(bridge.deleteFile).not.toHaveBeenCalled()
  })

  it('asks to sync first while another file makes the pull incomplete', async () => {
    const { removeSyncDevice, bridge } = await load()
    runtime.files = [
      OWN_FILE,
      peerFile('phone', 'iPhone', E1),
      file('witness-work-future.json', { ...payload('future'), version: 99 }),
    ]

    expect((await removeSyncDevice('witness-work-phone.json')).outcome).toBe(
      'sync-first'
    )
    expect((await removeSyncDevice('witness-work-future.json')).outcome).toBe(
      'update-app'
    )
    expect(bridge.deleteFile).not.toHaveBeenCalled()
  })

  it('removes pre-reset and unreadable files even while incomplete', async () => {
    const { removeSyncDevice, bridge } = await load()
    runtime.files = [
      OWN_FILE,
      peerFile('old', 'Old iPhone'),
      file('witness-work-broken.json', '{not json'),
      peerFile('slow', 'iPad mini', E1),
    ]
    runtime.pending = ['witness-work-slow.json']

    expect((await removeSyncDevice('witness-work-old.json')).outcome).toBe(
      'removed'
    )
    expect((await removeSyncDevice('witness-work-broken.json')).outcome).toBe(
      'removed'
    )
    expect(vi.mocked(bridge.deleteFile).mock.calls).toEqual([
      ['witness-work-old.json'],
      ['witness-work-broken.json'],
    ])
  })

  it('asks to sync first when that pull could not read the file', async () => {
    const { pullAndMerge, removeSyncDevice, bridge } = await load()
    runtime.files = [OWN_FILE, peerFile('old', 'Old iPhone')]
    await pullAndMerge('test')
    // The device adopted the reset and is uploading a current snapshot.
    runtime.files = [OWN_FILE, peerFile('old', 'Old iPhone', E1)]
    runtime.pending = ['witness-work-old.json']

    expect((await removeSyncDevice('witness-work-old.json')).outcome).toBe(
      'sync-first'
    )
    expect(bridge.deleteFile).not.toHaveBeenCalled()
  })

  it('never deletes the account file or this device', async () => {
    const { removeSyncDevice, bridge } = await load()
    runtime.files = [ACCOUNT_FILE, OWN_FILE]

    await expect(
      removeSyncDevice('witness-work-account.json')
    ).rejects.toThrow()
    await expect(removeSyncDevice('witness-work-ipad.json')).rejects.toThrow()
    await expect(
      removeSyncDevice('witness-work-img-contact-a.jpg')
    ).rejects.toThrow()
    expect(bridge.deleteFile).not.toHaveBeenCalled()
    expect(bridge.readFiles).not.toHaveBeenCalled()
  })

  it('reports a failed delete and keeps the entry', async () => {
    const { removeSyncDevice, usePreferences } = await load()
    runtime.files = [OWN_FILE, peerFile('phone', 'iPhone', E1)]
    runtime.failDeletes = true

    await expect(removeSyncDevice('witness-work-phone.json')).rejects.toThrow()
    expect(
      devices(usePreferences.getState())['witness-work-phone.json']
    ).toBeDefined()
  })
})
