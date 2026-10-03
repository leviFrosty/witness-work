import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Drives "Keep this device's data" / "Rebuild iCloud data" and the pulls that
// follow against a fake container: a reset must stick on every device instead
// of being undone by the next full snapshot from a device that still holds the
// old data.

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  appState: 'active',
  files: [] as SyncFile[],
  pending: [] as string[],
  identityToken: 'account-a' as string | null,
  binaries: [] as string[],
  failWrites: false,
  failDeletes: false,
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
  identityToken: () => runtime.identityToken,
  identityTokenMatches: (stored: string) =>
    runtime.identityToken === null ? null : stored === runtime.identityToken,
  waitForInitialScan: vi.fn(async () => true),
  readFiles: vi.fn(async (include: (filename: string) => boolean) => ({
    files: runtime.files.filter((f) => include(f.filename)),
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
vi.mock('@/lib/account', () => ({
  reclaimAccountFile: vi.fn(),
  clearAdoptedAccountId: vi.fn(),
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

const NOW = Date.now()
const OLD = NOW - 5_000
const DELETED_AT = NOW - 1_000

type Epoch = { id: string; at: number; deviceId: string; deviceName?: string }
const E1: Epoch = { id: 'e1', at: NOW - 60_000, deviceId: 'phone' }
const E2: Epoch = {
  id: 'e2',
  at: NOW - 30_000,
  deviceId: 'mac',
  deviceName: 'MacBook',
}

const contact = (id: string, updatedAt = OLD) => ({
  id,
  name: id,
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt,
})
const dayPlan = (id: string, updatedAt = OLD) => ({
  id,
  date: '2026-10-05T12:00:00.000Z',
  minutes: 60,
  updatedAt,
})

type Stores = {
  contacts?: unknown[]
  dayPlans?: unknown[]
  deletedDayPlans?: unknown[]
}

const payload = (deviceId: string, stores: Stores, epoch?: Epoch) => ({
  version: 1,
  writtenAt: OLD,
  deviceId,
  ...(epoch ? { resetEpoch: epoch } : {}),
  contactStore: { contacts: stores.contacts ?? [], deletedContacts: [] },
  conversationStore: { conversations: [], deletedConversations: [] },
  serviceReportStore: {
    serviceReports: {},
    dayPlans: stores.dayPlans ?? [],
    recurringPlans: [],
    deletedServiceReports: [],
    deletedDayPlans: stores.deletedDayPlans ?? [],
  },
  categoryStore: { categories: [], deletedCategories: [] },
  preferencesStore: { values: {}, updatedAt: {} },
})

const file = (
  filename: string,
  deviceId: string,
  stores: Stores,
  epoch?: Epoch
): SyncFile => ({
  filename,
  modifiedAt: OLD,
  json: JSON.stringify(payload(deviceId, stores, epoch)),
})
const peerFile = (deviceId: string, stores: Stores, epoch?: Epoch) =>
  file(`witness-work-${deviceId}.json`, deviceId, stores, epoch)
const ACCOUNT_FILE: SyncFile = {
  filename: 'witness-work-account.json',
  modifiedAt: OLD,
  json: '{"accountId":"a"}',
}

const load = async () => {
  const sync = await import('@/app/sync/iCloudSync')
  const bridge = await import('../../../../modules/icloud-bridge')
  const { refreshSyncClock } = await import('@/lib/syncClock')
  const { analytics } = await import('@/lib/analytics')
  const { isApplyingRemoteData } = await import('@/lib/remoteDataMutation')
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  const { usePreferences } = await import('@/stores/preferences')
  const { default: useContacts } = await import('@/stores/contactsStore')
  const { default: useServiceReport } = await import('@/stores/serviceReport')
  usePreferences.setState({
    iCloudSyncEnabled: true,
    iCloudDeviceId: 'ipad',
    hasMigratedToSyncSchema: true,
    hasReconciledSyncDefinitions: true,
  })
  useSupporter.getState().setSupporter(true)
  return {
    ...sync,
    bridge,
    refreshSyncClock: vi.mocked(refreshSyncClock),
    analytics,
    isApplyingRemoteData,
    usePreferences,
    useContacts,
    useServiceReport,
  }
}

const ownFile = () =>
  JSON.parse(
    runtime.files.find((f) => f.filename === 'witness-work-ipad.json')!.json
  )
const contactIds = (contacts: { id: string }[]) =>
  contacts.map((c) => c.id).sort()

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

let uninstall: () => void = () => {}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  runtime.appState = 'active'
  runtime.files = []
  runtime.pending = []
  runtime.identityToken = 'account-a'
  runtime.binaries = []
  runtime.failWrites = false
  runtime.failDeletes = false
})

afterEach(() => {
  uninstall()
  uninstall = () => {}
})

describe('a reset', () => {
  it('publishes a new generation first, then removes older files except the account file', async () => {
    const { overwriteRemoteWithLocal, bridge, usePreferences, useContacts } =
      await load()
    useContacts.setState({ contacts: [contact('mine')] as never })
    runtime.files = [
      ACCOUNT_FILE,
      peerFile('phone', { contacts: [contact('theirs')] }),
      file('witness-work 2.json', 'legacy', { contacts: [contact('old')] }),
    ]

    await overwriteRemoteWithLocal()

    const epoch = usePreferences.getState().iCloudResetEpoch
    expect(epoch).toMatchObject({ deviceId: 'ipad', deviceName: 'iPad' })
    expect(ownFile().resetEpoch).toEqual(epoch)
    expect(runtime.files.map((f) => f.filename).sort()).toEqual([
      'witness-work-account.json',
      'witness-work-ipad.json',
    ])
    expect(bridge.deleteAll).not.toHaveBeenCalled()
    // The publish lands before any cleanup.
    expect(vi.mocked(bridge.write).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(bridge.deleteFile).mock.invocationCallOrder[0]
    )
    expect(usePreferences.getState().iCloudSyncEnabled).toBe(true)
  })

  it("keeps a concurrent newer reset's file", async () => {
    const { overwriteRemoteWithLocal } = await load()
    // Created after this device's reset starts, as if published meanwhile.
    const later = { id: 'later', at: NOW + 3_600_000, deviceId: 'mac' }
    runtime.files = [peerFile('mac', { contacts: [contact('m')] }, later)]

    await overwriteRemoteWithLocal()

    expect(runtime.files.map((f) => f.filename)).toContain(
      'witness-work-mac.json'
    )
  })

  it("then ignores a stale peer's full snapshot without looping", async () => {
    const {
      overwriteRemoteWithLocal,
      installiCloudSync,
      iCloudSync,
      bridge,
      useContacts,
      useServiceReport,
      usePreferences,
    } = await load()
    useContacts.setState({ contacts: [contact('mine')] as never })
    await overwriteRemoteWithLocal()
    // A device that hasn't synced since pushes its old data again.
    runtime.files.push(
      peerFile('phone', {
        contacts: [contact('mine'), contact('theirs')],
        dayPlans: [dayPlan('their-plan')],
      })
    )
    runtime.appState = 'background'
    uninstall = installiCloudSync()
    vi.mocked(bridge.write).mockClear()
    const before = {
      contacts: useContacts.getState(),
      serviceReport: useServiceReport.getState(),
      preferenceUpdatedAt: usePreferences.getState().preferenceUpdatedAt,
    }

    for (let pull = 0; pull < 3; pull++)
      expect(await iCloudSync.pullAndMerge('remote-change')).toBe(false)

    expect(useContacts.getState()).toBe(before.contacts)
    expect(useServiceReport.getState()).toBe(before.serviceReport)
    expect(usePreferences.getState().preferenceUpdatedAt).toBe(
      before.preferenceUpdatedAt
    )
    // Ignored, not an unreadable or incomplete file.
    expect(usePreferences.getState().iCloudSyncIssue).toBeNull()
    expect(iCloudSync.isPushScheduled()).toBe(false)
    expect(bridge.write).not.toHaveBeenCalled()
  })

  it('keeps cloud photos the published data references and removes the rest', async () => {
    const { overwriteRemoteWithLocal, bridge, useContacts, usePreferences } =
      await load()
    useContacts.setState({
      contacts: [
        {
          ...contact('c1'),
          avatar: { type: 'image', value: 'file:///c1.jpg', revision: 'r1' },
        },
      ] as never,
    })
    usePreferences.setState({
      iCloudImageSync: {
        'witness-work-img-contact-c1--r1.jpg': {
          localMtime: 1,
          uploadedMtime: 1,
        },
        'witness-work-img-contact-gone.jpg': {
          localMtime: 1,
          uploadedMtime: 1,
        },
      },
    })
    runtime.binaries = [
      'witness-work-img-contact-c1--r1.jpg',
      'witness-work-img-contact-gone.jpg',
    ]

    await overwriteRemoteWithLocal()

    expect(bridge.deleteAllBinaries).not.toHaveBeenCalled()
    expect(runtime.binaries).toEqual(['witness-work-img-contact-c1--r1.jpg'])
    expect(Object.keys(usePreferences.getState().iCloudImageSync)).toEqual([
      'witness-work-img-contact-c1--r1.jpg',
    ])
  })

  it('that fails to publish restores the previous generation and sync settings', async () => {
    const { overwriteRemoteWithLocal, bridge, usePreferences } = await load()
    usePreferences.setState({
      iCloudSyncEnabled: false,
      iCloudSyncNeedsResolution: true,
      iCloudResetEpoch: E1,
    })
    runtime.files = [peerFile('phone', { contacts: [contact('theirs')] }, E1)]
    runtime.failWrites = true

    await expect(overwriteRemoteWithLocal()).rejects.toThrow()

    expect(usePreferences.getState()).toMatchObject({
      iCloudResetEpoch: E1,
      iCloudSyncEnabled: false,
      iCloudSyncNeedsResolution: true,
    })
    expect(bridge.deleteFile).not.toHaveBeenCalled()
    expect(runtime.files).toHaveLength(1)
  })

  it('still succeeds when cleanup fails', async () => {
    const { overwriteRemoteWithLocal, usePreferences } = await load()
    runtime.files = [peerFile('phone', { contacts: [contact('theirs')] })]
    runtime.failDeletes = true

    await expect(overwriteRemoteWithLocal()).resolves.toBeUndefined()

    expect(usePreferences.getState().iCloudResetEpoch).not.toBeNull()
    expect(ownFile().resetEpoch).toEqual(
      usePreferences.getState().iCloudResetEpoch
    )
  })
})

describe('a reset when the Apple Account changes', () => {
  it('that fails to publish leaves sync off instead of restoring it for the new account', async () => {
    const {
      overwriteRemoteWithLocal,
      canSync,
      refreshSyncClock,
      usePreferences,
    } = await load()
    usePreferences.setState({ iCloudResetEpoch: E1 })
    // The push's own clock check is where the switch shows up, so the push
    // turns sync off and returns false.
    refreshSyncClock
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => {
        runtime.identityToken = 'account-b'
        return null
      })

    await expect(overwriteRemoteWithLocal()).rejects.toThrow()

    expect(usePreferences.getState()).toMatchObject({
      iCloudSyncEnabled: false,
      iCloudResetEpoch: null,
      iCloudIdentityToken: 'account-b',
    })
    expect(usePreferences.getState().iCloudAccountChangedAt).not.toBeNull()
    expect(canSync()).toBe(false)
    expect(runtime.files).toEqual([])
  })

  it('noticed before the publish stops without turning sync on or writing', async () => {
    const {
      overwriteRemoteWithLocal,
      bridge,
      refreshSyncClock,
      usePreferences,
    } = await load()
    // "Keep this device's data" from the first-enable sheet: sync is still off.
    usePreferences.setState({ iCloudSyncEnabled: false, iCloudResetEpoch: E1 })
    runtime.files = [peerFile('phone', { contacts: [contact('theirs')] }, E1)]
    refreshSyncClock.mockImplementationOnce(async () => {
      runtime.identityToken = 'account-b'
      return null
    })

    await expect(overwriteRemoteWithLocal()).rejects.toThrow()

    expect(usePreferences.getState()).toMatchObject({
      iCloudSyncEnabled: false,
      iCloudResetEpoch: null,
      iCloudIdentityToken: 'account-b',
    })
    expect(bridge.write).not.toHaveBeenCalled()
    expect(bridge.deleteFile).not.toHaveBeenCalled()
  })
})

describe('pulls during a reset', () => {
  it("don't read until it ends, then run once", async () => {
    const { overwriteRemoteWithLocal, pullAndMerge, bridge, refreshSyncClock } =
      await load()
    const clock = deferred<null>()
    refreshSyncClock.mockImplementationOnce(() => clock.promise)

    const reset = overwriteRemoteWithLocal()
    expect(await pullAndMerge('remote-change')).toBe(false)
    expect(await pullAndMerge('read-retry')).toBe(false)
    expect(bridge.readFiles).not.toHaveBeenCalled()

    clock.resolve(null)
    await reset
    // The cleanup's read, then the one deferred pull.
    await vi.waitFor(() => expect(bridge.readFiles).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(bridge.readFiles).toHaveBeenCalledTimes(2)
  })

  it("don't adopt another device's reset over the data being kept", async () => {
    const {
      overwriteRemoteWithLocal,
      pullAndMerge,
      bridge,
      refreshSyncClock,
      useContacts,
      usePreferences,
    } = await load()
    useContacts.setState({ contacts: [contact('mine')] as never })
    runtime.files = [peerFile('mac', { contacts: [contact('reset')] }, E2)]
    const read = deferred<void>()
    const realRead = vi.mocked(bridge.readFiles).getMockImplementation()!
    vi.mocked(bridge.readFiles).mockImplementationOnce(async (include) => {
      const result = await realRead(include)
      await read.promise
      return result
    })
    const clock = deferred<null>()
    refreshSyncClock.mockImplementationOnce(() => clock.promise)

    // A pull already reading when the user taps Rebuild finishes its read
    // while the reset is still calibrating the clock.
    const pull = pullAndMerge('remote-change')
    const reset = overwriteRemoteWithLocal()
    read.resolve()
    expect(await pull).toBe(false)
    expect(contactIds(useContacts.getState().contacts)).toEqual(['mine'])
    clock.resolve(null)
    await reset

    expect(contactIds(useContacts.getState().contacts)).toEqual(['mine'])
    expect(contactIds(ownFile().contactStore.contacts)).toEqual(['mine'])
    expect(usePreferences.getState().iCloudResetAdoptedNotice).toBeNull()
    expect(usePreferences.getState().iCloudResetEpoch).toMatchObject({
      deviceId: 'ipad',
    })
  })

  it('run again after a reset that failed', async () => {
    const { overwriteRemoteWithLocal, pullAndMerge, bridge, useContacts } =
      await load()
    runtime.failWrites = true
    await expect(overwriteRemoteWithLocal()).rejects.toThrow()
    runtime.failWrites = false
    runtime.files = [peerFile('phone', { contacts: [contact('theirs')] })]
    vi.mocked(bridge.readFiles).mockClear()

    expect(await pullAndMerge('foreground')).toBe(true)

    expect(bridge.readFiles).toHaveBeenCalledOnce()
    expect(contactIds(useContacts.getState().contacts)).toEqual(['theirs'])
  })

  it('a second reset while one runs is refused', async () => {
    const { overwriteRemoteWithLocal, refreshSyncClock } = await load()
    const clock = deferred<null>()
    refreshSyncClock.mockImplementationOnce(() => clock.promise)

    const first = overwriteRemoteWithLocal()
    await expect(overwriteRemoteWithLocal()).rejects.toThrow()
    clock.resolve(null)

    await expect(first).resolves.toBeUndefined()
  })
})

describe('reset cleanup', () => {
  it("keeps files it can't read: a newer app version's, an invalid one, or one still downloading", async () => {
    const { overwriteRemoteWithLocal, bridge } = await load()
    const newer = {
      filename: 'witness-work-future.json',
      modifiedAt: OLD,
      json: JSON.stringify({ ...payload('future', {}), version: 99 }),
    }
    const invalid = {
      filename: 'witness-work-broken.json',
      modifiedAt: OLD,
      json: '{"version":1',
    }
    runtime.files = [
      newer,
      invalid,
      peerFile('phone', { contacts: [contact('theirs')] }, E1),
    ]
    runtime.pending = ['witness-work-downloading.json']

    await overwriteRemoteWithLocal()

    expect(vi.mocked(bridge.deleteFile).mock.calls).toEqual([
      ['witness-work-phone.json'],
    ])
    expect(runtime.files.map((f) => f.filename).sort()).toEqual([
      'witness-work-broken.json',
      'witness-work-future.json',
      'witness-work-ipad.json',
    ])
  })
})

describe('a device that sees a newer generation', () => {
  it('replaces its data instead of merging, then publishes in it', async () => {
    const {
      pullAndMerge,
      analytics,
      useContacts,
      useServiceReport,
      usePreferences,
    } = await load()
    useContacts.setState({ contacts: [contact('local-only')] as never })
    useServiceReport.setState({
      dayPlans: [dayPlan('d-local')] as never,
      deletedDayPlans: [{ id: 'd-local-gone', deletedAt: DELETED_AT }],
    })
    usePreferences.setState({ iCloudSyncPendingPush: true })
    runtime.files = [
      peerFile(
        'mac',
        {
          contacts: [contact('reset')],
          dayPlans: [dayPlan('d-reset')],
          deletedDayPlans: [{ id: 'd-reset-gone', deletedAt: DELETED_AT }],
        },
        E2
      ),
      // Another device still on the old data.
      peerFile('phone', { contacts: [contact('stale')] }),
    ]

    expect(await pullAndMerge('foreground')).toBe(true)

    expect(contactIds(useContacts.getState().contacts)).toEqual(['reset'])
    expect(useServiceReport.getState().dayPlans.map((p) => p.id)).toEqual([
      'd-reset',
    ])
    expect(useServiceReport.getState().deletedDayPlans).toEqual([
      { id: 'd-reset-gone', deletedAt: DELETED_AT },
    ])
    expect(usePreferences.getState()).toMatchObject({
      iCloudResetEpoch: E2,
      iCloudDeviceId: 'ipad',
      iCloudSyncEnabled: true,
      iCloudResetAdoptedNotice: { epochId: 'e2', deviceName: 'MacBook' },
    })
    expect(ownFile().resetEpoch).toEqual(E2)
    expect(contactIds(ownFile().contactStore.contacts)).toEqual(['reset'])
    expect(analytics.capture).toHaveBeenCalledWith(
      'icloud_sync_reset_adopted',
      { remote_files: 1 }
    )

    // The next pull merges in the same generation instead of adopting again.
    useContacts.setState({
      contacts: [
        ...useContacts.getState().contacts,
        contact('new-here') as never,
      ],
    })
    expect(await pullAndMerge('foreground')).toBe(false)
    expect(contactIds(useContacts.getState().contacts)).toEqual([
      'new-here',
      'reset',
    ])
  })

  it('marks the replacement as remote, so no Buddies declines go out', async () => {
    const { pullAndMerge, isApplyingRemoteData, useServiceReport } =
      await load()
    useServiceReport.setState({ dayPlans: [dayPlan('linked')] as never })
    runtime.files = [peerFile('mac', { contacts: [contact('reset')] }, E2)]
    const remoteDuringRemoval: boolean[] = []
    useServiceReport.subscribe((state, prev) => {
      if (state.dayPlans !== prev.dayPlans)
        remoteDuringRemoval.push(isApplyingRemoteData())
    })

    await pullAndMerge('foreground')

    expect(useServiceReport.getState().dayPlans).toEqual([])
    expect(remoteDuringRemoval).toEqual([true])
  })

  it('converges when two devices reset concurrently', async () => {
    const { pullAndMerge, useContacts, usePreferences } = await load()
    // This device's reset lost to a later one.
    usePreferences.setState({ iCloudResetEpoch: E1 })
    useContacts.setState({ contacts: [contact('from-e1')] as never })
    runtime.files = [peerFile('mac', { contacts: [contact('from-e2')] }, E2)]

    expect(await pullAndMerge('remote-change')).toBe(true)
    expect(contactIds(useContacts.getState().contacts)).toEqual(['from-e2'])
    expect(usePreferences.getState().iCloudResetEpoch).toEqual(E2)

    // The winner ignores the loser's file once the loser has published again
    // with the old generation, and both settle on E2.
    runtime.files.push(peerFile('phone', { contacts: [contact('x')] }, E1))
    expect(await pullAndMerge('remote-change')).toBe(false)
    expect(usePreferences.getState().iCloudResetEpoch).toEqual(E2)
  })

  it('breaks a tie on the same instant by id', async () => {
    const { pullAndMerge, useContacts, usePreferences } = await load()
    const a = { id: 'a', at: E1.at, deviceId: 'ipad' }
    const b = { id: 'b', at: E1.at, deviceId: 'mac' }
    usePreferences.setState({ iCloudResetEpoch: a })
    runtime.files = [peerFile('mac', { contacts: [contact('from-b')] }, b)]

    expect(await pullAndMerge('remote-change')).toBe(true)
    expect(contactIds(useContacts.getState().contacts)).toEqual(['from-b'])
    expect(usePreferences.getState().iCloudResetEpoch).toEqual(b)
  })
})

describe('payloads without a generation', () => {
  it('merge as before on a device that never reset', async () => {
    const { pullAndMerge, useContacts, usePreferences } = await load()
    useContacts.setState({ contacts: [contact('local')] as never })
    runtime.files = [peerFile('phone', { contacts: [contact('remote')] })]

    expect(await pullAndMerge('foreground')).toBe(true)

    expect(contactIds(useContacts.getState().contacts)).toEqual([
      'local',
      'remote',
    ])
    expect(usePreferences.getState().iCloudResetEpoch).toBeNull()
    expect(usePreferences.getState().iCloudResetAdoptedNotice).toBeNull()
  })
})

describe('peek and first enable', () => {
  const files = () => [
    peerFile('mac', { contacts: [contact('a')] }, E2),
    peerFile('phone', { contacts: [contact('stale')] }, E1),
    peerFile('watch', { contacts: [contact('older')] }),
    peerFile('mini', { contacts: [contact('c')] }, E2),
  ]

  it('folds only the newest generation and carries it', async () => {
    const { peekRemotePayload } = await load()
    runtime.files = files()

    const peek = await peekRemotePayload()

    if (peek.status !== 'found') throw new Error(peek.status)
    expect(contactIds(peek.remote.contactStore.contacts)).toEqual(['a', 'c'])
    expect(peek.remote.resetEpoch).toEqual(E2)
  })

  it('restore adopts the generation, so the next pull merges', async () => {
    const {
      peekRemotePayload,
      replaceLocalWithRemote,
      pullAndMerge,
      usePreferences,
    } = await load()
    runtime.files = files()
    const peek = await peekRemotePayload()
    if (peek.status !== 'found') throw new Error(peek.status)

    replaceLocalWithRemote(peek.remote)

    expect(usePreferences.getState().iCloudResetEpoch).toEqual(E2)
    expect(await pullAndMerge('foreground')).toBe(false)
    expect(usePreferences.getState().iCloudResetAdoptedNotice).toBeNull()
  })

  it('"Merge both" joins the generation without replacing local data', async () => {
    const {
      peekRemotePayload,
      joinRemoteResetEpoch,
      pullAndMerge,
      useContacts,
      usePreferences,
    } = await load()
    usePreferences.setState({ iCloudSyncEnabled: false })
    useContacts.setState({ contacts: [contact('local')] as never })
    runtime.files = files()
    const peek = await peekRemotePayload()
    if (peek.status !== 'found') throw new Error(peek.status)

    joinRemoteResetEpoch(peek.remote)
    usePreferences.setState({ iCloudSyncEnabled: true })
    expect(await pullAndMerge('initial-enable-merge')).toBe(true)

    expect(contactIds(useContacts.getState().contacts)).toEqual([
      'a',
      'c',
      'local',
    ])
    expect(usePreferences.getState().iCloudResetEpoch).toEqual(E2)
    expect(usePreferences.getState().iCloudResetAdoptedNotice).toBeNull()
  })

  it("a choice made after the Apple Account changed doesn't confirm", async () => {
    const {
      resolveInitialEnable,
      confirmICloudAccount,
      useContacts,
      usePreferences,
    } = await load()
    usePreferences.setState({ iCloudSyncEnabled: false })
    useContacts.setState({ contacts: [contact('local')] as never })
    runtime.files = files()

    const decision = await resolveInitialEnable()
    if (decision.outcome !== 'conflict') throw new Error(decision.outcome)
    expect(decision.account).toEqual({ token: 'account-a', changedAt: null })
    expect(confirmICloudAccount(decision.account)).toBe(true)

    // Switched while the sheet was up.
    runtime.identityToken = 'account-b'
    expect(confirmICloudAccount(decision.account)).toBe(false)
    expect(usePreferences.getState().iCloudIdentityToken).toBe('account-b')
    // Still not once the new account is the recorded one.
    expect(confirmICloudAccount(decision.account)).toBe(false)
  })

  it('a peek the Apple Account changed during is unavailable', async () => {
    const { peekRemotePayload, bridge } = await load()
    runtime.files = files()
    const realRead = vi.mocked(bridge.readFiles).getMockImplementation()!
    vi.mocked(bridge.readFiles).mockImplementationOnce(async (include) => {
      const result = await realRead(include)
      runtime.identityToken = 'account-b'
      return result
    })

    expect(await peekRemotePayload()).toEqual({ status: 'unavailable' })
  })

  it('seeding keeps the local generation', async () => {
    const { applySeedEnable, usePreferences } = await load()
    usePreferences.setState({ iCloudSyncEnabled: false, iCloudResetEpoch: E1 })

    await applySeedEnable()

    expect(usePreferences.getState().iCloudResetEpoch).toEqual(E1)
    expect(ownFile().resetEpoch).toEqual(E1)
  })
})
