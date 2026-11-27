import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeGoogleDrive,
  memoryTransfer,
} from '@/lib/syncTransport/googleDrive/__tests__/driveTestKit'
import { derivePhotoKeys } from '@/lib/syncTransport/server/photoCrypto'
import { deriveSyncKey } from '@/lib/syncTransport/server/syncCrypto'

const runtime = vi.hoisted(() => ({
  appState: 'active',
  files: {} as Record<string, Map<string, Uint8Array>>,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    get currentState() {
      return runtime.appState
    },
    addEventListener: () => ({ remove: () => {} }),
  },
}))

vi.mock('../../../../modules/icloud-bridge', () => ({}))
vi.mock('@/lib/account', () => ({
  reclaimAccountFile: vi.fn(),
  clearAdoptedAccountId: vi.fn(),
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
vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
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
const contact = (id: string, name: string, updatedAt: number) => ({
  id,
  name,
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt,
})

let drive = createFakeGoogleDrive()
let listingClock = 0

const keysFor = (fill: number) => {
  const accountKey = new Uint8Array(32).fill(fill)
  return {
    syncKey: deriveSyncKey(accountKey),
    photoKeys: derivePhotoKeys(accountKey),
  }
}

async function device(
  name: string,
  { accountKey }: { accountKey: number | null | 'old-build' }
) {
  vi.resetModules()
  const files = (runtime.files[name] ??= new Map())
  vi.doMock('expo-device', () => ({
    DeviceType: { PHONE: 1, TABLET: 2 },
    deviceType: 1,
    modelName: name,
    osName: 'Android',
  }))
  vi.doMock('@/lib/installId', () => ({
    getOrCreateInstallId: () => `install-${name}`,
    androidDeviceInstallId: () => `install-${name}`,
  }))
  vi.doMock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///test/Documents/',
    getInfoAsync: vi.fn(async (path: string) =>
      files.has(path)
        ? { exists: true, modificationTime: 1_000 }
        : { exists: false }
    ),
    deleteAsync: vi.fn(async (path: string) => {
      files.delete(path)
    }),
  }))
  const sync = await import('@/app/sync/iCloudSync')
  const { registerAndroidSyncTransport, registerPlatformSealer } = await import(
    '@/lib/syncTransport'
  )
  const { createGoogleDriveTransport } = await import(
    '@/lib/syncTransport/googleDrive/googleDriveTransport'
  )
  const { createDriveApi } = await import(
    '@/lib/syncTransport/googleDrive/driveApi'
  )
  const { createSealedTransport } = await import(
    '@/lib/syncTransport/sealed/sealedTransport'
  )
  const { ensureSyncDeviceId } = await import('@/lib/iCloudIdentity')
  const auth = await import('@/lib/syncTransport/googleDrive/googleDriveAuth')
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  const { usePreferences } = await import('@/stores/preferences')
  const { default: useContacts } = await import('@/stores/contactsStore')

  registerAndroidSyncTransport(
    createGoogleDriveTransport({
      api: (bound) =>
        createDriveApi({
          origin: drive.origin,
          fetch: drive.fetch,
          transfer: memoryTransfer(drive, files),
          sleep: async () => {},
          getToken: (options) =>
            auth.googleDriveAccessToken({ ...options, account: bound }),
        }),
      isConnected: auth.isGoogleDriveConnected,
      accountToken: () => usePreferences.getState().googleDriveAccountId,
      addAvailabilityListener: auth.addGoogleDriveAvailabilityListener,
      now: () => (listingClock += 60_000),
    })
  )
  const events: Array<{ type: string }> = []
  if (accountKey !== 'old-build') {
    const remembered = new Set<string>()
    let scratch = 0
    registerPlatformSealer((inner) =>
      createSealedTransport(inner, {
        keyring: async () =>
          accountKey === null
            ? null
            : { current: keysFor(accountKey), older: [] },
        sealingSwitch: () => true,
        remembered: {
          has: (id) => remembered.has(id ?? ''),
          add: (id) => remembered.add(id ?? ''),
        },
        files: {
          read: async (path) => files.get(path)!,
          write: async (path, bytes) => void files.set(path, bytes),
          remove: async (path) => void files.delete(path),
          tempPath: () => `file:///test/Documents/sealed-sync/${scratch++}`,
        },
        randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
        now: Date.now,
        deviceName: () => name,
        platform: 'android',
        ownFilename: () => `witness-work-${ensureSyncDeviceId()}.json`,
        onEvent: (event) => events.push(event),
      })
    )
  }
  auth.setFakeGoogleDrive({ origin: drive.origin, account: 'family' })
  expect(await auth.connectGoogleDrive({ selectAccount: false })).toBe(
    'connected'
  )
  usePreferences.setState({
    iCloudSyncEnabled: true,
    hasMigratedToSyncSchema: true,
    hasReconciledSyncDefinitions: true,
  })
  useSupporter.getState().setSupporter(true)
  const round = async () => {
    await sync.iCloudSync.pullAndMerge('manual')
    return sync.iCloudSync.push('manual')
  }
  return {
    ...sync,
    events,
    round,
    usePreferences,
    useContacts,
    contactNames: () =>
      useContacts
        .getState()
        .contacts.map((c) => c.name)
        .sort(),
  }
}

const driveNames = () =>
  drive
    .files('family')
    .map((f) => f.name)
    .sort()
const driveText = () =>
  drive
    .files('family')
    .map((f) => new TextDecoder().decode(f.content))
    .join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  drive = createFakeGoogleDrive()
  vi.stubGlobal('__DEV__', true)
  vi.stubGlobal('fetch', drive.fetch)
  runtime.files = {}
  runtime.appState = 'active'
})

describe('sealed Google Drive sync (ADR 0067)', () => {
  it('switches the folder to sealed files and keeps syncing', async () => {
    const phone = await device('phone', { accountKey: 1 })
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    expect(await phone.round()).toBe(true)
    const tablet = await device('tablet', { accountKey: 1 })
    tablet.useContacts.setState({
      contacts: [contact('c2', 'Ben Ito', NOW)] as never,
    })
    expect(await tablet.round()).toBe(true)
    expect(await phone.round()).toBe(true)
    expect(await tablet.round()).toBe(true)

    expect(driveNames()).toEqual([
      expect.stringMatching(/^witness-work-.+\.sealed\.json$/),
      expect.stringMatching(/^witness-work-.+\.sealed\.json$/),
    ])
    expect(driveText()).not.toContain('Ada Reyes')
    expect(driveText()).not.toContain('Ben Ito')
    expect(phone.contactNames()).toEqual(['Ada Reyes', 'Ben Ito'])
    expect(tablet.contactNames()).toEqual(['Ada Reyes', 'Ben Ito'])
    expect(phone.events.map((e) => e.type)).toContain('completed')
    expect(phone.usePreferences.getState().iCloudSyncIssue).toBeNull()
  })

  it('keeps plaintext while an old build is in the folder, and both still sync', async () => {
    const old = await device('old', { accountKey: 'old-build' })
    old.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    expect(await old.round()).toBe(true)
    const phone = await device('phone', { accountKey: 1 })
    phone.useContacts.setState({
      contacts: [contact('c2', 'Ben Ito', NOW)] as never,
    })
    expect(await phone.round()).toBe(true)
    expect(await phone.round()).toBe(true)
    expect(driveNames().some((n) => n.endsWith('.sealed.json'))).toBe(false)
    expect(phone.events).toContainEqual(
      expect.objectContaining({ type: 'waiting', waitingFor: 'devices' })
    )

    const oldAgain = await device('old', { accountKey: 'old-build' })
    expect(await oldAgain.round()).toBe(true)
    expect(oldAgain.contactNames()).toEqual(['Ada Reyes', 'Ben Ito'])
    expect(oldAgain.usePreferences.getState().iCloudSyncIssue).toBeNull()
  })

  it('shows a sealed folder to an old build as a newer version, and loses nothing', async () => {
    const phone = await device('phone', { accountKey: 1 })
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    await phone.round()
    await phone.round()
    expect(driveNames()).toEqual([expect.stringMatching(/\.sealed\.json$/)])

    const old = await device('old', { accountKey: 'old-build' })
    old.useContacts.setState({
      contacts: [contact('c9', 'Cy Old', NOW)] as never,
    })
    await old.iCloudSync.pullAndMerge('manual')
    expect(old.usePreferences.getState().iCloudSyncIssue).toBe('newer-version')
    expect(old.contactNames()).toEqual(['Cy Old'])
    expect(await old.iCloudSync.push('manual')).toBe(true)
    expect(driveNames()).toHaveLength(2)

    const phoneAgain = await device('phone', { accountKey: 1 })
    await phoneAgain.iCloudSync.pullAndMerge('manual')
    expect(phoneAgain.contactNames()).toContain('Cy Old')
  })

  it('locks a device on another account out without deleting anything', async () => {
    const phone = await device('phone', { accountKey: 1 })
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    await phone.round()
    await phone.round()
    const before = driveNames()

    const other = await device('other', { accountKey: 2 })
    other.useContacts.setState({
      contacts: [contact('c5', 'Dee Other', NOW)] as never,
    })
    await other.iCloudSync.pullAndMerge('manual')
    expect(other.usePreferences.getState().iCloudSyncIssue).toBe(
      'other-account'
    )
    expect(other.contactNames()).toEqual(['Dee Other'])
    expect(
      Object.values(other.usePreferences.getState().iCloudSyncDevices ?? {})
        .map((d) => d.status)
        .sort()
    ).toContain('other-account')
    expect(await other.iCloudSync.push('manual')).toBe(true)
    expect(driveNames()).toEqual(expect.arrayContaining([...before]))
    expect(driveText()).not.toContain('Dee Other')
  })

  it('holds a device with no account key in a sealed folder', async () => {
    const phone = await device('phone', { accountKey: 1 })
    await phone.round()
    await phone.round()
    const fresh = await device('fresh', { accountKey: null })
    fresh.useContacts.setState({
      contacts: [contact('c7', 'Eve New', NOW)] as never,
    })
    await fresh.iCloudSync.pullAndMerge('manual')
    expect(fresh.usePreferences.getState().iCloudSyncIssue).toBe(
      'other-account'
    )
    expect(await fresh.iCloudSync.push('manual')).toBe(false)
    expect(driveText()).not.toContain('Eve New')
    expect(fresh.contactNames()).toEqual(['Eve New'])
  })

  it('tells onboarding’s restore that the folder is locked, not empty', async () => {
    const phone = await device('phone', { accountKey: 1 })
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    await phone.round()
    await phone.round()
    const fresh = await device('fresh', { accountKey: 2 })
    expect(await fresh.peekRemotePayload()).toMatchObject({
      status: 'incomplete',
      reason: 'other-account',
    })
    const same = await device('same', { accountKey: 1 })
    expect(await same.peekRemotePayload()).toMatchObject({ status: 'found' })
  })
})
