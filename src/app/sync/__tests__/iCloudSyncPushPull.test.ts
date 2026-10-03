import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Drives pull and push against a fake container to cover two things: a stale
// peer file starting an endless push/pull loop, and Plan deletions travelling
// between devices.

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  appState: 'active',
  files: [] as SyncFile[],
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
    files: runtime.files.filter((f) => include(f.filename)),
    pending: runtime.pending.filter(include),
  })),
  write: vi.fn(async (filename: string, json: string) => {
    runtime.files = [
      ...runtime.files.filter((f) => f.filename !== filename),
      { filename, json, modifiedAt: Date.now() },
    ]
    return Date.now()
  }),
  deleteFile: vi.fn(async () => {}),
  deleteAll: vi.fn(async () => {
    runtime.files = []
  }),
  writeBinary: vi.fn(async () => 1),
  readBinary: vi.fn(async () => 1),
  listBinaryFiles: vi.fn(async () => []),
  deleteBinaryFile: vi.fn(async () => {}),
  deleteAllBinaries: vi.fn(async () => {}),
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

const NOW = Date.now()
const OLD = NOW - 5_000
const DELETED_AT = NOW - 1_000

const contact = (id: string, updatedAt: number) => ({
  id,
  name: id,
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt,
})
const visit = (id: string, updatedAt: number) => ({
  id,
  contact: { id: 'c1' },
  date: '2026-09-15T12:00:00.000Z',
  isBibleStudy: false,
  updatedAt,
})
const entry = (id: string, updatedAt: number) => ({
  id,
  date: '2026-09-15T12:00:00.000Z',
  hours: 1,
  minutes: 0,
  updatedAt,
})
const category = (id: string, updatedAt: number) => ({
  id,
  name: id,
  isCredit: false,
  updatedAt,
})
const dayPlan = (id: string, updatedAt: number) => ({
  id,
  date: '2026-10-05T12:00:00.000Z',
  minutes: 60,
  updatedAt,
})
const recurringPlan = (id: string, updatedAt: number) => ({
  id,
  startDate: '2026-10-05T12:00:00.000Z',
  minutes: 90,
  recurrence: { frequency: 1, interval: 1, endDate: null },
  updatedAt,
})

type Stores = {
  contacts?: unknown[]
  conversations?: unknown[]
  entries?: unknown[]
  categories?: unknown[]
  dayPlans?: unknown[]
  recurringPlans?: unknown[]
  deletedDayPlans?: unknown[]
}

const peerFile = (deviceId: string, stores: Stores): SyncFile => ({
  filename: `witness-work-${deviceId}.json`,
  modifiedAt: OLD,
  json: JSON.stringify({
    version: 1,
    writtenAt: OLD,
    deviceId,
    contactStore: { contacts: stores.contacts ?? [], deletedContacts: [] },
    conversationStore: {
      conversations: stores.conversations ?? [],
      deletedConversations: [],
    },
    serviceReportStore: {
      serviceReports: stores.entries ? { 2026: { 8: stores.entries } } : {},
      dayPlans: stores.dayPlans ?? [],
      recurringPlans: stores.recurringPlans ?? [],
      deletedServiceReports: [],
      ...(stores.deletedDayPlans
        ? { deletedDayPlans: stores.deletedDayPlans }
        : {}),
    },
    categoryStore: {
      categories: stores.categories ?? [],
      deletedCategories: [],
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
  const { default: useConversations } = await import(
    '@/stores/conversationStore'
  )
  const { default: useServiceReport } = await import('@/stores/serviceReport')
  const { default: useCategories } = await import('@/stores/categories')
  const { stripContactForTombstone } = await import('@/lib/dataProtection')
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
    usePreferences,
    useContacts,
    useConversations,
    useServiceReport,
    useCategories,
    stripContactForTombstone,
  }
}

const lastWritten = (
  bridge: Awaited<ReturnType<typeof load>>['bridge']
): {
  serviceReportStore: { deletedDayPlans?: { id: string }[] }
} => JSON.parse(vi.mocked(bridge.write).mock.calls.at(-1)![1])

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

let uninstall: () => void = () => {}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  runtime.appState = 'active'
  runtime.files = []
  runtime.pending = []
})

afterEach(() => {
  uninstall()
  uninstall = () => {}
})

describe("a peer's file holding records deleted here", () => {
  it('changes nothing, writes no store, and schedules no push', async () => {
    const { installiCloudSync, iCloudSync, bridge, ...stores } = await load()
    stores.useContacts.setState({
      contacts: [contact('c1', OLD)] as never,
      deletedContacts: [
        stores.stripContactForTombstone(
          contact('c-gone', OLD) as never,
          DELETED_AT
        ),
      ],
    })
    stores.useConversations.setState({
      conversations: [visit('v1', OLD)] as never,
      deletedConversations: [{ id: 'v-gone', deletedAt: DELETED_AT }],
    })
    stores.useServiceReport.setState({
      serviceReports: { 2026: { 8: [entry('e1', OLD)] } } as never,
      dayPlans: [dayPlan('d1', OLD)] as never,
      recurringPlans: [recurringPlan('r1', OLD)] as never,
      deletedServiceReports: [{ id: 'e-gone', deletedAt: DELETED_AT }],
      deletedDayPlans: [{ id: 'd-gone', deletedAt: DELETED_AT }],
      deletedRecurringPlans: [{ id: 'r-gone', deletedAt: DELETED_AT }],
    })
    stores.useCategories.setState({
      categories: [category('k1', OLD)],
      deletedCategories: [{ id: 'k-gone', deletedAt: DELETED_AT }],
    })
    // A retired device's file, frozen before those deletions.
    runtime.files = [
      peerFile('retired-iphone', {
        contacts: [contact('c1', OLD), contact('c-gone', OLD)],
        conversations: [visit('v1', OLD), visit('v-gone', OLD)],
        entries: [entry('e1', OLD), entry('e-gone', OLD)],
        categories: [category('k1', OLD), category('k-gone', OLD)],
        dayPlans: [dayPlan('d1', OLD), dayPlan('d-gone', OLD)],
        recurringPlans: [
          recurringPlan('r1', OLD),
          recurringPlan('r-gone', OLD),
        ],
      }),
    ]
    // Backgrounded, so installing doesn't start a launch catch-up.
    runtime.appState = 'background'
    uninstall = installiCloudSync()
    const before = {
      contacts: stores.useContacts.getState(),
      conversations: stores.useConversations.getState(),
      serviceReport: stores.useServiceReport.getState(),
      categories: stores.useCategories.getState(),
      preferenceUpdatedAt: stores.usePreferences.getState().preferenceUpdatedAt,
    }

    for (let pull = 0; pull < 3; pull++) {
      expect(await iCloudSync.pullAndMerge('remote-change')).toBe(false)
      await settle()
    }

    expect(bridge.readFiles).toHaveBeenCalled()
    expect(stores.useContacts.getState()).toBe(before.contacts)
    expect(stores.useConversations.getState()).toBe(before.conversations)
    expect(stores.useServiceReport.getState()).toBe(before.serviceReport)
    expect(stores.useCategories.getState()).toBe(before.categories)
    expect(stores.usePreferences.getState().preferenceUpdatedAt).toBe(
      before.preferenceUpdatedAt
    )
    expect(iCloudSync.isPushScheduled()).toBe(false)
    expect(bridge.write).not.toHaveBeenCalled()
  })
})

describe('Plan deletions over iCloud', () => {
  it('a pull applies them and the next push passes them on', async () => {
    const { pullAndMerge, push, bridge, useServiceReport } = await load()
    useServiceReport.setState({ dayPlans: [dayPlan('d1', OLD)] as never })
    runtime.files = [
      peerFile('phone', {
        deletedDayPlans: [{ id: 'd1', deletedAt: DELETED_AT }],
      }),
    ]

    expect(await pullAndMerge('remote-change')).toBe(true)
    expect(useServiceReport.getState().dayPlans).toEqual([])
    expect(useServiceReport.getState().deletedDayPlans).toEqual([
      { id: 'd1', deletedAt: DELETED_AT },
    ])

    await push('manual')
    expect(lastWritten(bridge).serviceReportStore.deletedDayPlans).toEqual([
      { id: 'd1', deletedAt: DELETED_AT },
    ])
  })

  it('a restore folds them across every device and keeps them', async () => {
    const {
      peekRemotePayload,
      replaceLocalWithRemote,
      hasMeaningfulLocalData,
      useServiceReport,
    } = await load()
    runtime.files = [
      peerFile('phone', { dayPlans: [dayPlan('d1', OLD)] }),
      peerFile('watch', {
        deletedDayPlans: [{ id: 'd1', deletedAt: DELETED_AT }],
      }),
    ]

    const peek = await peekRemotePayload()
    if (peek.status !== 'found') throw new Error(peek.status)
    expect(peek.remote.serviceReportStore.dayPlans).toEqual([])

    expect(hasMeaningfulLocalData()).toBe(false)
    replaceLocalWithRemote(peek.remote)

    expect(useServiceReport.getState().deletedDayPlans).toEqual([
      { id: 'd1', deletedAt: DELETED_AT },
    ])
    // A deletion is user data: enabling again asks before replacing it.
    expect(hasMeaningfulLocalData()).toBe(true)
  })
})
