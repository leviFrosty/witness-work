vi.mock('@/lib/syncClock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/syncClock')>()),
  refreshSyncClock: vi.fn(async () => null),
}))
import { beforeEach, describe, expect, it, vi } from 'vitest'

// First-enable decisions against a fake bridge: a remote the device can't see
// in full must never yield `seed` (pushing this device's fresh onboarding
// defaults over the real data) or `pull` (restoring part of it).

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  scanned: true,
  files: [] as SyncFile[],
  // `null` = a binary that can't report downloads (see `readFiles`).
  pending: [] as string[] | null,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
}))
vi.mock('../../../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  waitForInitialScan: vi.fn(async () => runtime.scanned),
  readFiles: vi.fn(async (include: (filename: string) => boolean) => ({
    files: runtime.files.filter((f) => include(f.filename)),
    pending: runtime.pending?.filter(include) ?? null,
  })),
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

const PHONE_FILE = 'witness-work-phone.json'

const payloadFile = (
  filename: string,
  deviceId: string,
  version = 1
): SyncFile => ({
  filename,
  modifiedAt: 1000,
  json: JSON.stringify({
    version,
    writtenAt: 1000,
    deviceId,
    contactStore: {
      contacts: [{ id: `from-${deviceId}`, name: 'Contact', updatedAt: 1000 }],
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
  const { resolveInitialEnable } = await import('@/app/sync/iCloudSync')
  const bridge = await import('../../../../modules/icloud-bridge')
  return { resolveInitialEnable, bridge }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  runtime.scanned = true
  runtime.files = []
  runtime.pending = []
})

describe('first enable while the remote is incomplete', () => {
  it('does not seed while the only backup is still downloading', async () => {
    runtime.pending = [PHONE_FILE]
    const { resolveInitialEnable, bridge } = await load()

    expect(await resolveInitialEnable()).toEqual({
      outcome: 'incomplete',
      reason: 'downloading',
    })
    // It waited through another read before giving up.
    expect(bridge.readFiles).toHaveBeenCalledTimes(2)
  })

  it('does not restore part of the backup', async () => {
    runtime.files = [payloadFile('witness-work-old-ipad.json', 'old-ipad')]
    runtime.pending = [PHONE_FILE]
    const { resolveInitialEnable } = await load()

    expect(await resolveInitialEnable()).toMatchObject({
      outcome: 'incomplete',
    })
  })

  it('uses a download that lands on the next read', async () => {
    runtime.pending = [PHONE_FILE]
    const { resolveInitialEnable, bridge } = await load()
    vi.mocked(bridge.readFiles).mockImplementationOnce(async () => {
      const read = { files: [], pending: [PHONE_FILE] }
      runtime.files = [payloadFile(PHONE_FILE, 'phone')]
      runtime.pending = []
      return read
    })

    expect(await resolveInitialEnable()).toMatchObject({
      outcome: 'pull',
      remote: { deviceId: 'phone' },
    })
  })

  it('does not seed before the initial scan finishes', async () => {
    runtime.scanned = false
    const { resolveInitialEnable } = await load()

    expect(await resolveInitialEnable()).toEqual({
      outcome: 'incomplete',
      reason: 'scan',
    })
  })

  it('does not seed over a backup from a newer app version', async () => {
    runtime.files = [payloadFile(PHONE_FILE, 'phone', 99)]
    const { resolveInitialEnable } = await load()

    expect(await resolveInitialEnable()).toEqual({
      outcome: 'incomplete',
      reason: 'newer-version',
    })
  })

  it('does not seed when the container cannot be read', async () => {
    const { resolveInitialEnable, bridge } = await load()
    vi.mocked(bridge.readFiles).mockRejectedValueOnce(new Error('no Drive'))

    expect(await resolveInitialEnable()).toEqual({ outcome: 'unavailable' })
  })

  it('still seeds an empty container on binaries that cannot report downloads', async () => {
    runtime.pending = null
    const { resolveInitialEnable } = await load()

    expect(await resolveInitialEnable()).toEqual({ outcome: 'seed' })
  })
})

it('ignores this installation’s own old snapshot during restore and first enable', async () => {
  const { resolveInitialEnable } = await load()
  const { usePreferences } = await import('@/stores/preferences')
  usePreferences.setState({ iCloudDeviceId: 'same' })
  runtime.files = [payloadFile('witness-work-same.json', 'same')]
  expect(await resolveInitialEnable()).toEqual({ outcome: 'seed' })
})
