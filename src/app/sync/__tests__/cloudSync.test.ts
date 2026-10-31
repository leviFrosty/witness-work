import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeGoogleDrive,
  memoryTransfer,
} from '@/lib/syncTransport/googleDrive/__tests__/driveTestKit'
import { createFakeSyncServer } from '@/lib/syncTransport/server/__tests__/fakeSyncServer'

// Cloud Sync end to end (ADR 0030): the real engine on the real server
// transport, with several "devices" (each a fresh module graph with its own
// stores) on one account of an in-memory ww-api. Devices name themselves iOS
// or Android in their snapshots; the engine and transport are the same code on
// both. Some devices sync through Google Drive instead, to cover switching
// between the options and a mixed fleet.

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

let server = createFakeSyncServer()
let drive = createFakeGoogleDrive()
let listingClock = 0
let nonce = 0

type Option = 'cloud' | 'platform' | 'off'

/**
 * Boots one device on `option`, signed in to `account` (its ww-api account and,
 * for Drive, the Google Account of the same name).
 */
async function device(
  name: string,
  {
    os = 'ios',
    option = 'cloud',
    account = 'family',
    entitled = true,
  }: {
    os?: 'ios' | 'android'
    option?: Option
    account?: string
    entitled?: boolean
  } = {}
) {
  vi.resetModules()
  const files = (runtime.files[name] ??= new Map())
  vi.doMock('expo-device', () => ({
    DeviceType: { PHONE: 1, TABLET: 2 },
    deviceType: 1,
    modelName: name,
    osName: os === 'ios' ? 'iOS' : 'Android',
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
    makeDirectoryAsync: vi.fn(async () => {}),
  }))
  // The app's Cloud Sync runtime, reduced to what a switch calls: the account
  // is ready when the server says so, and leaving deletes this device's slot.
  const runtimeHolder: { leave?: () => Promise<void> } = {}
  vi.doMock('@/app/sync/cloudSync', () => ({
    prepareCloudSync: async () => {
      if (!server.state.enabled) return { outcome: 'disabled' }
      const ok =
        server.state.entitlement === 'everyone' ||
        server.state.supporters.has(account)
      return ok ? { outcome: 'ready' } : { outcome: 'not_entitled' }
    },
    deleteOwnCloudSyncSlot: () => runtimeHolder.leave?.(),
    onCloudSyncStatus: () => () => {},
  }))
  vi.doMock('@/lib/serverAccount', () => ({
    accountSessions: { snapshot: () => ({ accountId: `acct-${account}` }) },
  }))

  const sync = await import('@/app/sync/iCloudSync')
  const syncOption = await import('@/app/sync/syncOption')
  const cloudSyncRequest = await import('@/app/sync/cloudSyncRequest')
  const { fetchSyncStatus } = await import(
    '@/lib/syncTransport/server/syncClient'
  )
  const provider = await import('@/lib/syncTransport/provider')
  const identity = await import('@/lib/iCloudIdentity')
  const { registerAndroidSyncTransport } = await import('@/lib/syncTransport')
  const { createGoogleDriveTransport } = await import(
    '@/lib/syncTransport/googleDrive/googleDriveTransport'
  )
  const { createDriveApi } = await import(
    '@/lib/syncTransport/googleDrive/driveApi'
  )
  const auth = await import('@/lib/syncTransport/googleDrive/googleDriveAuth')
  const { createServerTransport, filenameForSlot } = await import(
    '@/lib/syncTransport/server/serverTransport'
  )
  const { deriveSyncKey } = await import(
    '@/lib/syncTransport/server/syncCrypto'
  )
  const { derivePhotoKeys } = await import(
    '@/lib/syncTransport/server/photoCrypto'
  )
  const photoUsage = await import('@/lib/syncTransport/server/photoUsage')
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  const { usePreferences } = await import('@/stores/preferences')
  const { default: useContacts } = await import('@/stores/contactsStore')
  const { default: useConversations } = await import(
    '@/stores/conversationStore'
  )
  const { useProfile } = await import('@/stores/profile')
  const { useUpdateRequired } = await import('@/lib/appUpdate/updateRequired')

  const driveTransport = createGoogleDriveTransport({
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
  registerAndroidSyncTransport(driveTransport)
  auth.setFakeGoogleDrive({ origin: drive.origin, account })
  expect(await auth.connectGoogleDrive({ selectAccount: false })).toBe(
    'connected'
  )

  // The production transport, against the fake server: the bearer token is
  // the account's name, and every device of an account derives one sync key.
  const accountKey = new Uint8Array(32).fill(account.length)
  const accountId = `acct-${account}`.padEnd(22, '0')
  const cloudTransport = createServerTransport({
    access: async () => ({
      accountId,
      syncKey: deriveSyncKey(accountKey),
      photoKeys: derivePhotoKeys(accountKey),
      options: {
        baseUrl: 'https://api.test',
        authorize: (run) => run(`Bearer ${account}`),
        fetchImpl: server.fetch,
      },
    }),
    isAvailable: () => true,
    identityToken: () => `account:${account}`,
    randomBytes: (length) => new Uint8Array(length).fill(++nonce % 256),
    deviceName: () => name,
    platform: os,
    now: () => Date.now(),
    onRefused: (refusal) =>
      refusal !== 'photos_disabled' &&
      usePreferences.setState({ cloudSyncEntitled: false }),
    files: {
      size: async (path) => files.get(path)?.length ?? 0,
      read: async (path) => {
        const bytes = files.get(path)
        if (!bytes) throw new Error(`no file at ${path}`)
        return bytes
      },
      write: async (path, bytes) => {
        files.set(path, bytes.slice())
      },
    },
    photoSwitch: () => usePreferences.getState().cloudSyncPhotos,
    slotId: () => identity.ensureSyncDeviceId(),
    onPhotoUsage: photoUsage.recordPhotoUsage,
  })
  provider.registerCloudSyncTransport(cloudTransport)
  runtimeHolder.leave = () =>
    cloudTransport
      .deleteFile(filenameForSlot(identity.ensureSyncDeviceId()))
      .catch(() => undefined)

  usePreferences.setState({
    syncProvider: option === 'off' ? null : option,
    iCloudSyncEnabled: option !== 'off',
    cloudSyncConfig: { enabled: true, entitlement: 'supporter' },
    cloudSyncEntitled: entitled,
    cloudSyncPhotos: true,
    hasMigratedToSyncSchema: true,
    hasReconciledSyncDefinitions: true,
  })
  if (entitled) server.state.supporters.add(account)
  // iCloud/Drive's own gate; Cloud Sync's is the server's entitlement.
  useSupporter.getState().setSupporter(true)
  if (option !== 'off') identity.checkICloudIdentity('initial_enable')

  return {
    ...sync,
    ...syncOption,
    ...provider,
    ...cloudSyncRequest,
    /** The account's status as ww-api answers it now. */
    status: () =>
      fetchSyncStatus({
        baseUrl: 'https://api.test',
        authorize: (run) => run(`Bearer ${account}`),
        fetchImpl: server.fetch,
      }),
    name,
    account,
    cloudTransport,
    files,
    photoUsage,
    usePreferences,
    useContacts,
    useConversations,
    useProfile,
    useUpdateRequired,
    slotId: () => usePreferences.getState().iCloudDeviceId!,
    contactNames: () =>
      useContacts
        .getState()
        .contacts.map((c) => c.name)
        .sort(),
  }
}
type Device = Awaited<ReturnType<typeof device>>

const sync = async (...devices: Device[]) => {
  for (const d of devices) {
    await d.iCloudSync.pullAndMerge('manual')
    expect(await d.iCloudSync.push('manual')).toBe(true)
  }
}

const driveNames = (account = 'family') =>
  drive
    .files(account)
    .map((f) => f.name)
    .sort()

beforeEach(() => {
  vi.clearAllMocks()
  server = createFakeSyncServer()
  drive = createFakeGoogleDrive()
  vi.stubGlobal('__DEV__', true)
  vi.stubGlobal('fetch', drive.fetch)
  runtime.files = {}
  runtime.appState = 'active'
})

describe('Cloud Sync between devices', () => {
  it('runs the engine on the server transport', async () => {
    const phone = await device('phone')
    expect(phone.usesCloudSync()).toBe(true)
    expect(phone.activeSyncTransport()).toBe(phone.cloudTransport)
    expect(phone.iCloudSync.canSync()).toBe(true)
    expect(phone.currentSyncOption()).toBe('cloud')
  })

  it('brings an iPhone’s data to an Android phone and back, encrypted', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    expect(await iphone.iCloudSync.push('manual')).toBe(true)
    expect(server.slotIds('family')).toEqual([iphone.slotId()])
    // The server holds ciphertext: no name, no JSON.
    const stored = server.slotBytes('family', iphone.slotId())!
    const text = new TextDecoder('latin1').decode(stored)
    expect(text).not.toContain('Ada')
    expect(text).not.toContain('contacts')

    const pixel = await device('pixel', { os: 'android' })
    expect(await pixel.iCloudSync.pullAndMerge('manual')).toBe(true)
    expect(pixel.contactNames()).toEqual(['Ada Reyes'])
    expect(pixel.usePreferences.getState().lastiCloudRemoteDeviceName).toBe(
      'iphone'
    )

    pixel.useContacts.setState({
      contacts: [
        contact('c1', 'Ada Reyes', NOW),
        contact('c2', 'Ben Ito', NOW + 1),
      ] as never,
    })
    expect(await pixel.iCloudSync.push('manual')).toBe(true)
    expect(await iphone.iCloudSync.pullAndMerge('manual')).toBe(true)
    expect(iphone.contactNames()).toEqual(['Ada Reyes', 'Ben Ito'])
    // Each device keeps one slot; pushing again replaces it.
    await iphone.iCloudSync.push('manual')
    expect(server.slotIds('family')).toHaveLength(2)
  })

  it('pulls as soon as the live socket says another device changed', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    const pixel = await device('pixel', { os: 'android' })
    const uninstall = pixel.installiCloudSync()
    try {
      // Let the launch catch-up settle before the change.
      await pixel.iCloudSync.waitForSyncIdle()
      iphone.useContacts.setState({
        contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
      })
      expect(await iphone.iCloudSync.push('manual')).toBe(true)
      expect(pixel.contactNames()).toEqual([])
      pixel.cloudTransport.notifyRemoteChange()
      await vi.waitFor(() =>
        expect(pixel.contactNames()).toEqual(['Ada Reyes'])
      )
    } finally {
      uninstall()
    }
  })

  it('waits for a slow upload instead of timing it out and putting again', async () => {
    const phone = await device('phone')
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    // A multi-MB snapshot on a slow connection: longer than the engine's
    // usual 60 s, within the put's own 90 s.
    server.state.putDelayMs = 70_000
    vi.useFakeTimers()
    try {
      const pushed = phone.iCloudSync.push('manual')
      await vi.advanceTimersByTimeAsync(70_000)
      expect(await pushed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
    expect(server.slotIds('family')).toEqual([phone.slotId()])
    expect(server.state.log.filter((op) => op === 'POST sync/put')).toEqual([
      'POST sync/put',
    ])
    expect(phone.usePreferences.getState().iCloudSyncErrorCode).toBe(null)
  })

  it('converges three devices on one account', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    const pixel = await device('pixel', { os: 'android' })
    const ipad = await device('ipad', { os: 'ios' })
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    pixel.useContacts.setState({
      contacts: [contact('c2', 'Ben', NOW)] as never,
    })
    ipad.useContacts.setState({
      contacts: [contact('c3', 'Cy', NOW)] as never,
    })
    await sync(iphone, pixel, ipad, iphone, pixel)
    for (const d of [iphone, pixel, ipad])
      expect(d.contactNames()).toEqual(['Ada', 'Ben', 'Cy'])
    expect(server.slotIds('family')).toHaveLength(3)
  })

  it('merges edits made offline on two devices', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW - 10_000)] as never,
    })
    await iphone.iCloudSync.push('manual')
    const pixel = await device('pixel', { os: 'android' })
    await pixel.iCloudSync.pullAndMerge('manual')

    // Offline: the server refuses nothing, it just isn't reached.
    server.state.enabled = false
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada R.', NOW - 5_000)] as never,
    })
    pixel.useContacts.setState({
      contacts: [
        contact('c1', 'Ada Reyes', NOW - 1_000),
        contact('c2', 'Ben Ito', NOW - 1_000),
      ] as never,
    })
    server.state.enabled = true
    await sync(iphone, pixel, iphone)
    for (const d of [iphone, pixel])
      expect(d.contactNames()).toEqual(['Ada Reyes', 'Ben Ito'])
  })

  it('carries a deletion and never brings it back', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW - 5_000)] as never,
    })
    const pixel = await device('pixel', { os: 'android' })
    await sync(iphone, pixel)
    expect(pixel.contactNames()).toEqual(['Ada'])

    iphone.useContacts.getState().deleteContact('c1')
    await sync(iphone, pixel, iphone)
    for (const d of [iphone, pixel]) expect(d.contactNames()).toEqual([])
  })

  it('pauses without the entitlement and resumes when it’s granted', async () => {
    const pixel = await device('pixel', { os: 'android', entitled: false })
    pixel.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    expect(pixel.iCloudSync.canSync()).toBe(false)
    expect(await pixel.iCloudSync.push('manual')).toBe(false)
    expect(server.slotIds('family')).toEqual([])

    // The engine never asks a server that refuses it; a stale "entitled"
    // gets a 403, which the app records.
    pixel.usePreferences.setState({ cloudSyncEntitled: true })
    expect(await pixel.iCloudSync.push('manual')).toBe(false)
    expect(pixel.usePreferences.getState().cloudSyncEntitled).toBe(false)
    expect(server.slotIds('family')).toEqual([])

    // `sync:entitlement everyone`.
    server.state.entitlement = 'everyone'
    pixel.usePreferences.setState({ cloudSyncEntitled: true })
    pixel.iCloudSync.resetPushBackoff()
    expect(await pixel.iCloudSync.push('manual')).toBe(true)
    expect(server.slotIds('family')).toEqual([pixel.slotId()])
  })

  it('waits out Update Required, then catches up once it lifts', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await sync(iphone)
    iphone.useUpdateRequired.setState({
      required: {
        source: 'config',
        currentVersion: '1.0.0',
        minVersion: '99.0.0',
      },
    })
    const uninstall = iphone.installiCloudSync()
    const sent = server.state.log.length

    // An edit while gated (a widget, Siri) waits; nothing reaches ww-api.
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW), contact('c2', 'Ben', NOW)] as never,
    })
    expect(iphone.iCloudSync.canSync()).toBe(false)
    expect(await iphone.iCloudSync.push('manual')).toBe(false)
    await iphone.iCloudSync.pullAndMerge('manual')
    expect(server.state.log).toHaveLength(sent)
    expect(iphone.usePreferences.getState().iCloudSyncPendingPush).toBe(true)

    // The floor came down: the edit goes up without waiting for a foreground.
    iphone.useUpdateRequired.setState({ required: null })
    await vi.waitFor(() =>
      expect(iphone.usePreferences.getState().iCloudSyncPendingPush).toBe(false)
    )
    uninstall()
    const ipad = await device('ipad', { os: 'ios' })
    await ipad.iCloudSync.pullAndMerge('manual')
    expect(ipad.contactNames()).toEqual(['Ada', 'Ben'])
  })

  it('stops at the kill switch and keeps everything local', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await iphone.iCloudSync.push('manual')
    server.state.enabled = false
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW), contact('c2', 'Ben', NOW)] as never,
    })
    expect(await iphone.iCloudSync.push('manual')).toBe(false)
    expect(iphone.contactNames()).toEqual(['Ada', 'Ben'])
    // The choice is kept, so it resumes when the switch is back on.
    expect(iphone.usePreferences.getState().iCloudSyncEnabled).toBe(true)
    expect(iphone.currentSyncOption()).toBe('cloud')
  })

  it('keeps accounts apart', async () => {
    const mine = await device('mine')
    mine.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await mine.iCloudSync.push('manual')
    const theirs = await device('theirs', { account: 'other' })
    await theirs.iCloudSync.pullAndMerge('manual')
    expect(theirs.contactNames()).toEqual([])
    expect(server.slotIds('other')).toEqual([])
  })
})

describe('Switching between Cloud Sync and Google Drive', () => {
  /** Two phones syncing Ada and Ben through Drive, as before Cloud Sync. */
  const driveFleet = async () => {
    const phone = await device('phone', { os: 'android', option: 'platform' })
    phone.useContacts.setState({
      contacts: [
        contact('c1', 'Ada', NOW - 10_000),
        contact('c2', 'Ben', NOW - 10_000),
      ] as never,
    })
    const tablet = await device('tablet', { os: 'android', option: 'platform' })
    await sync(phone, tablet)
    expect(tablet.contactNames()).toEqual(['Ada', 'Ben'])
    return { phone, tablet }
  }

  it('moves a device to Cloud Sync without losing or duplicating anything', async () => {
    const { phone } = await driveFleet()
    const driveBefore = driveNames()
    phone.useContacts.setState({
      contacts: [
        contact('c1', 'Ada', NOW - 10_000),
        contact('c2', 'Ben', NOW - 10_000),
        contact('c3', 'Cy', NOW - 9_000),
      ] as never,
    })
    // An edit the running engine would have queued.
    phone.usePreferences.setState({ iCloudSyncPendingPush: true })

    const outcome = await phone.switchSyncOption('cloud', 'settings')
    expect(outcome).toEqual({ outcome: 'switched', pending: false })
    expect(phone.currentSyncOption()).toBe('cloud')
    expect(phone.contactNames()).toEqual(['Ada', 'Ben', 'Cy'])
    expect(server.slotIds('family')).toEqual([phone.slotId()])
    // The pending edit reached Drive first, so devices still there get it.
    // Drive's files are all still there: other devices' and this one's.
    expect(driveNames()).toEqual(driveBefore)
    // On Cloud Sync, the tray's one-time offer of it is answered for good.
    expect(phone.usePreferences.getState().cloudSyncTrayOffer).toBe('answered')
  })

  it('switches from the tray’s offer the same way, merging both sides', async () => {
    const { phone, tablet } = await driveFleet()
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW - 10_000)] as never,
    })
    tablet.useContacts.setState({
      contacts: [contact('c2', 'Ben', NOW - 10_000)] as never,
    })
    expect((await tablet.switchSyncOption('cloud', 'tray')).outcome).toBe(
      'switched'
    )
    expect((await phone.switchSyncOption('cloud', 'tray')).outcome).toBe(
      'switched'
    )
    await tablet.iCloudSync.pullAndMerge('manual')
    expect(phone.contactNames()).toEqual(['Ada', 'Ben'])
    expect(tablet.contactNames()).toEqual(['Ada', 'Ben'])
  })

  it('never brings back a record deleted on a device still on Drive', async () => {
    const { phone, tablet } = await driveFleet()
    expect((await phone.switchSyncOption('cloud', 'settings')).outcome).toBe(
      'switched'
    )

    // The tablet, still on Drive, deletes Ada. The phone's Drive file (from
    // before its switch) still holds her, older than the deletion.
    tablet.useContacts.getState().deleteContact('c1')
    await sync(tablet, tablet)
    expect(tablet.contactNames()).toEqual(['Ben'])

    // The tablet joins Cloud Sync, where the phone's slot holds Ada too.
    expect((await tablet.switchSyncOption('cloud', 'settings')).outcome).toBe(
      'switched'
    )
    expect(tablet.contactNames()).toEqual(['Ben'])
    await sync(phone)
    expect(phone.contactNames()).toEqual(['Ben'])
    expect(server.slotIds('family').sort()).toEqual(
      [phone.slotId(), tablet.slotId()].sort()
    )
  })

  it('syncs only with devices on the same option', async () => {
    const { phone, tablet } = await driveFleet()
    await phone.switchSyncOption('cloud', 'settings')
    phone.useContacts.setState({
      contacts: [
        ...phone.useContacts.getState().contacts,
        contact('c3', 'Cy', NOW),
      ] as never,
    })
    tablet.useContacts.setState({
      contacts: [
        ...tablet.useContacts.getState().contacts,
        contact('c4', 'Dee', NOW),
      ] as never,
    })
    await sync(phone, tablet, phone, tablet)
    expect(phone.contactNames()).toEqual(['Ada', 'Ben', 'Cy'])
    expect(tablet.contactNames()).toEqual(['Ada', 'Ben', 'Dee'])
  })

  it('moves back to Drive, deleting only its own slot', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW - 5_000)] as never,
    })
    const phone = await device('phone', { os: 'android' })
    await sync(iphone, phone)
    expect(server.slotIds('family')).toHaveLength(2)

    phone.useContacts.setState({
      contacts: [
        contact('c1', 'Ada', NOW - 5_000),
        contact('c2', 'Ben', NOW - 4_000),
      ] as never,
    })
    // An edit the running engine would have queued.
    phone.usePreferences.setState({ iCloudSyncPendingPush: true })
    server.state.log.length = 0
    const outcome = await phone.switchSyncOption('platform', 'settings')
    expect(outcome).toEqual({ outcome: 'switched', pending: false })
    // Its last edit went to Cloud Sync (where the live socket tells the
    // others at once) before its slot was deleted.
    expect(server.state.log.filter((op) => op !== 'POST sync/list')).toEqual([
      'POST sync/put',
      'POST sync/delete',
    ])
    // Only its own slot is gone; the iPhone keeps everything it had.
    expect(server.slotIds('family')).toEqual([iphone.slotId()])
    await iphone.iCloudSync.pullAndMerge('manual')
    expect(iphone.contactNames()).toEqual(['Ada'])
    expect(phone.contactNames()).toEqual(['Ada', 'Ben'])
    expect(driveNames()).toHaveLength(1)
  })

  it('turns off without deleting anything local, and leaves its slot', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await iphone.iCloudSync.push('manual')
    expect(await iphone.switchSyncOption('off', 'settings')).toEqual({
      outcome: 'switched',
      pending: false,
    })
    expect(iphone.currentSyncOption()).toBe('off')
    expect(iphone.contactNames()).toEqual(['Ada'])
    expect(server.slotIds('family')).toEqual([])
    expect(await iphone.iCloudSync.push('manual')).toBe(false)
  })

  it('moves back to Cloud Sync on the account a QR code moved it to meanwhile', async () => {
    const phone = await device('phone', { os: 'android' })
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW - 5_000)] as never,
    })
    await phone.iCloudSync.push('manual')
    expect((await phone.switchSyncOption('platform', 'settings')).outcome).toBe(
      'switched'
    )
    // Signed in with a QR code to the family's account while on Drive: the
    // Cloud Sync account it last recorded is another.
    phone.usePreferences.setState({ cloudSyncAccountToken: 'account:mine' })

    expect(await phone.switchSyncOption('cloud', 'settings')).toEqual({
      outcome: 'switched',
      pending: false,
    })
    expect(phone.currentSyncOption()).toBe('cloud')
    expect(phone.usePreferences.getState().cloudSyncAccountToken).toBe(
      'account:family'
    )
    expect(server.slotIds('family')).toEqual([phone.slotId()])
  })

  it('forgets its Cloud Sync account when it leaves', async () => {
    const phone = await device('phone', { os: 'android' })
    await phone.iCloudSync.push('manual')
    expect(phone.usePreferences.getState().cloudSyncAccountToken).toBe(
      'account:family'
    )
    await phone.switchSyncOption('off', 'settings')
    // Turning it on again from Off records the account it has then.
    expect(phone.usePreferences.getState().cloudSyncAccountToken).toBe(null)
  })

  it('refuses a switch the account isn’t entitled to, changing nothing', async () => {
    const { phone } = await driveFleet()
    server.state.supporters.clear()
    expect(await phone.switchSyncOption('cloud', 'offer')).toEqual({
      outcome: 'failed',
      reason: 'not_entitled',
    })
    expect(phone.currentSyncOption()).toBe('platform')
    expect(phone.usePreferences.getState().cloudSyncTrayOffer).toBeNull()
    expect(server.slotIds('family')).toEqual([])
    server.state.enabled = false
    expect(await phone.switchSyncOption('cloud', 'offer')).toEqual({
      outcome: 'failed',
      reason: 'disabled',
    })
    expect(phone.currentSyncOption()).toBe('platform')
  })
})

describe('The account’s Cloud Sync request', () => {
  it('moves a phone on Drive with records to Cloud Sync, merging with a device already there', async () => {
    const phone = await device('phone', { os: 'android', option: 'platform' })
    phone.useContacts.setState({
      contacts: [
        contact('c1', 'Ada', NOW - 10_000),
        contact('c2', 'Ben', NOW - 10_000),
      ] as never,
    })
    const tablet = await device('tablet', { os: 'android', option: 'platform' })
    await sync(phone, tablet)
    // A device on Cloud Sync already: what a browser that seeded would hold.
    const laptop = await device('laptop', { os: 'ios', option: 'cloud' })
    laptop.useContacts.setState({
      contacts: [contact('c9', 'Dee', NOW - 5_000)] as never,
    })
    await sync(laptop)
    const driveBefore = driveNames()

    // The browser asks; the phone reads it at its next foreground.
    server.state.now = NOW
    const { askSyncRequest } = await import(
      '@/lib/syncTransport/server/syncClient'
    )
    const { deriveAccountSigningKey } = await import('@/lib/serverAccount/keys')
    await askSyncRequest({
      baseUrl: 'https://api.test',
      authorize: (run) => run('Bearer family'),
      fetchImpl: server.fetch,
      sign: {
        baseUrl: 'https://api.test',
        key: deriveAccountSigningKey(new Uint8Array(32).fill(6)),
        now: () => NOW,
        randomBytes: (length) => new Uint8Array(length).fill(7),
        fetchImpl: server.fetch,
      },
    })
    phone.usePreferences.setState({ onboardingComplete: true })
    expect(await phone.answerCloudSyncRequest(await phone.status())).toEqual({
      outcome: 'switched',
    })
    expect(phone.currentSyncOption()).toBe('cloud')
    expect(phone.contactNames()).toEqual(['Ada', 'Ben', 'Dee'])
    // Phones never clear it: the server does once every live phone wrote.
    expect(server.requestedAt('family')).toBe(NOW)
    // Nothing on Drive was touched; the tablet still syncs there.
    expect(driveNames()).toEqual(driveBefore)
    expect(tablet.currentSyncOption()).toBe('platform')

    // The laptop gets the phone's records.
    await sync(laptop)
    expect(laptop.contactNames()).toEqual(['Ada', 'Ben', 'Dee'])

    // The next foreground acts no more, even after the User moves it back.
    expect(await phone.switchSyncOption('platform', 'settings')).toMatchObject({
      outcome: 'switched',
    })
    expect(await phone.answerCloudSyncRequest(await phone.status())).toEqual({
      outcome: 'skipped',
    })
    expect(phone.currentSyncOption()).toBe('platform')
  })
})

describe('Choosing an option', () => {
  it('offers Cloud Sync once to a device already on Drive', async () => {
    const phone = await device('phone', { os: 'android', option: 'off' })
    // From before Cloud Sync: sync on, no option recorded.
    phone.usePreferences.setState({
      iCloudSyncEnabled: true,
      syncProvider: null,
    })
    expect(phone.syncProvider()).toBe('platform')
    phone.settleSyncProvider()
    expect(phone.usePreferences.getState().syncProvider).toBe('platform')
    expect(phone.showsCloudSyncOffer()).toBe(true)
    phone.dismissCloudSyncOffer()
    expect(phone.showsCloudSyncOffer()).toBe(false)
    phone.settleSyncProvider()
    expect(phone.usePreferences.getState().cloudSyncOffer).toBe('dismissed')
  })

  it('defaults a device that never chose to Cloud Sync, while it’s offered', async () => {
    const phone = await device('phone', { os: 'android', option: 'off' })
    expect(phone.syncProvider()).toBe('cloud')
    phone.usePreferences.setState({
      cloudSyncConfig: { enabled: false, entitlement: 'supporter' },
    })
    expect(phone.syncProvider()).toBe('platform')
  })

  it('answers the offer by switching', async () => {
    const phone = await device('phone', { os: 'android', option: 'platform' })
    phone.usePreferences.setState({ cloudSyncOffer: 'pending' })
    expect(phone.showsCloudSyncOffer()).toBe(true)
    await phone.switchSyncOption('cloud', 'offer')
    expect(phone.showsCloudSyncOffer()).toBe(false)
    expect(phone.usePreferences.getState().cloudSyncOffer).toBe('dismissed')
  })
})

const DOCS = 'file:///test/Documents/'
const picked = (id: string, revision: string) =>
  `${DOCS}contact-${id}-avatar-picked-${revision}.jpg`
const withPhoto = (
  record: ReturnType<typeof contact>,
  revision: string | undefined,
  value = picked(record.id, revision ?? 'legacy')
) => ({
  ...record,
  avatar: { type: 'image', value, ...(revision ? { revision } : {}) },
})
const noteWithPhoto = (photoId: string) => ({
  v: 1,
  textHash: 'h',
  doc: {
    type: 'doc',
    content: [
      { type: 'image', attrs: { id: photoId, width: 400, height: 300 } },
    ],
  },
})
const visit = (id: string, photoId: string | null, updatedAt = NOW) => ({
  id,
  contact: { id: 'c1' },
  date: '2026-05-01T12:00:00.000Z',
  note: 'Visit',
  ...(photoId ? { noteDoc: noteWithPhoto(photoId) } : {}),
  updatedAt,
})
const notePath = (id: string) => `${DOCS}note-images/${id}.jpg`

/** Pushes, then waits for the photo work it started. */
const publish = async (d: Device) => {
  expect(await d.iCloudSync.push('manual')).toBe(true)
  await d.iCloudSync.imageWorkSettled()
}

describe('Photos over Cloud Sync', () => {
  it('carries contact, profile and note photos both ways, without “Include photos”', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    expect(iphone.usePreferences.getState().iCloudSyncIncludeImages).toBe(false)
    expect(iphone.iCloudSync.photosTravel()).toBe(true)
    iphone.files.set(picked('c1', 'r1'), new Uint8Array([1, 1, 1]))
    iphone.files.set(notePath('photo-0001'), new Uint8Array([2, 2]))
    iphone.useContacts.setState({
      contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
    })
    iphone.useConversations.setState({
      conversations: [visit('v1', 'photo-0001')] as never,
    })
    await publish(iphone)
    expect(server.photoNames('family')).toHaveLength(2)

    const android = await device('android', { os: 'android' })
    await android.iCloudSync.pullAndMerge('manual')
    const avatar = android.useContacts.getState().contacts[0].avatar!
    const local = avatar.value.split('?')[0]
    expect(local).toBe(`${DOCS}contact-c1-avatar-synced-r1.jpg`)
    expect([...android.files.get(local)!]).toEqual([1, 1, 1])
    expect([...android.files.get(notePath('photo-0001'))!]).toEqual([2, 2])

    // And back: a profile photo added on Android.
    const profilePath = `${DOCS}profile-avatar-picked-p1.jpg`
    android.files.set(profilePath, new Uint8Array([3]))
    android.useProfile
      .getState()
      .setAvatar({ type: 'image', value: profilePath, revision: 'p1' })
    await publish(android)
    await iphone.iCloudSync.pullAndMerge('manual')
    const profile = iphone.useProfile.getState().avatar!
    expect(profile.value.split('?')[0]).toBe(
      `${DOCS}profile-avatar-synced-p1.jpg`
    )
    expect([
      ...iphone.files.get(`${DOCS}profile-avatar-synced-p1.jpg`)!,
    ]).toEqual([3])
    // The server only ever saw ciphertext.
    for (const name of server.photoNames('family'))
      expect(server.photoBytes('family', name)![0]).toBe(1)
  })

  it('keeps Google Drive behind “Include photos”, unchanged', async () => {
    const phone = await device('phone', { option: 'platform' })
    phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
    phone.useContacts.setState({
      contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
    })
    expect(phone.iCloudSync.photosTravel()).toBe(false)
    await publish(phone)
    expect(driveNames().some((name) => name.includes('-img-'))).toBe(false)

    phone.usePreferences.setState({ iCloudSyncIncludeImages: true })
    await publish(phone)
    expect(driveNames()).toContain('witness-work-img-contact-c1--r1.jpg')
    expect(server.photoNames('family')).toEqual([])
  })

  it('gives a legacy avatar a revision before its photo travels', async () => {
    const phone = await device('phone')
    const legacy = `${DOCS}contact-c1-avatar.jpg`
    phone.files.set(legacy, new Uint8Array([4]))
    phone.useContacts.setState({
      contacts: [
        withPhoto(contact('c1', 'Ada', NOW), undefined, legacy),
      ] as never,
    })
    await publish(phone)
    // Not under the legacy name, ever.
    expect(server.photoNames('family')).toEqual([])
    const revised = phone.useContacts.getState().contacts[0]
    const revision = revised.avatar?.revision
    expect(revision).toMatch(/^[a-z0-9]{10,}$/)
    expect(revised.updatedAt).toBeGreaterThan(NOW)
    // The record edit publishes, then the photo follows.
    await publish(phone)
    expect(server.photoNames('family')).toHaveLength(1)

    const tablet = await device('tablet')
    await tablet.iCloudSync.pullAndMerge('manual')
    expect([
      ...tablet.files.get(`${DOCS}contact-c1-avatar-synced-${revision}.jpg`)!,
    ]).toEqual([4])
  })

  it('keeps a photo on its device when storage is full, and retries only on foreground or room', async () => {
    const phone = await device('phone')
    // One sealed 20-byte photo (61 bytes) fits; two don't.
    server.state.photoLimitBytes = 100
    phone.files.set(picked('c1', 'r1'), new Uint8Array(20))
    phone.files.set(picked('c2', 'r2'), new Uint8Array(20))
    phone.useContacts.setState({
      contacts: [
        withPhoto(contact('c1', 'Ada', NOW), 'r1'),
        withPhoto(contact('c2', 'Bo', NOW), 'r2'),
      ] as never,
    })
    await publish(phone)
    const stuck = 'witness-work-img-contact-c2--r2.jpg'
    const { photoStuckOnFullStorage } = await import(
      '@/lib/syncTransport/photoSyncStatus'
    )
    expect(server.photoNames('family')).toHaveLength(1)
    expect(
      phone.usePreferences.getState().iCloudImageSync[stuck]
    ).toMatchObject({ errorCode: 'storage-full' })
    expect(photoStuckOnFullStorage(stuck)).toBe(true)
    expect(photoStuckOnFullStorage('witness-work-img-contact-c1--r1.jpg')).toBe(
      false
    )
    // The rest of sync goes on.
    expect(phone.usePreferences.getState().iCloudSyncIssue).toBeNull()

    // An edit doesn't retry it.
    server.state.log.length = 0
    phone.useContacts.getState().updateContact({ id: 'c1', name: 'Ada R.' })
    await publish(phone)
    expect(server.state.log).not.toContain('POST sync/photos/put')

    // Room frees on another device; the change notice's usage read retries.
    const uninstall = phone.installiCloudSync()
    server.state.photoLimitBytes = 200
    phone.photoUsage.recordPhotoUsage(
      { bytes: 0, count: 0, limit: 200 },
      'usage'
    )
    await phone.iCloudSync.imageWorkSettled()
    expect(server.photoNames('family')).toHaveLength(2)
    expect(photoStuckOnFullStorage(stuck)).toBe(false)
    uninstall()
  })

  it('retries a full account when the app returns to the foreground', async () => {
    const phone = await device('phone')
    server.state.photoLimitBytes = 10
    phone.files.set(picked('c1', 'r1'), new Uint8Array(20))
    phone.useContacts.setState({
      contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
    })
    await publish(phone)
    expect(server.photoNames('family')).toEqual([])
    server.state.photoLimitBytes = 1000
    // A foreground push retries it at once, whatever the failure backoff.
    await phone.iCloudSync.pushImagesIfEnabled()
    expect(server.photoNames('family')).toHaveLength(1)
  })

  it('deletes a replaced or removed photo once the snapshot without it is out', async () => {
    const phone = await device('phone')
    phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
    phone.files.set(picked('c2', 'r2'), new Uint8Array([2]))
    phone.files.set(notePath('photo-0001'), new Uint8Array([3]))
    phone.useContacts.setState({
      contacts: [
        withPhoto(contact('c1', 'Ada', NOW), 'r1'),
        withPhoto(contact('c2', 'Bo', NOW), 'r2'),
      ] as never,
    })
    phone.useConversations.setState({
      conversations: [visit('v1', 'photo-0001')] as never,
    })
    await publish(phone)
    expect(server.photoNames('family')).toHaveLength(3)

    // Replace c1's photo, take the photo out of the note, delete contact c2.
    phone.files.set(picked('c1', 'r9'), new Uint8Array([9]))
    phone.useContacts
      .getState()
      .updateContact(withPhoto(contact('c1', 'Ada', NOW), 'r9') as never)
    phone.useConversations.setState({
      conversations: [visit('v1', null, NOW + 1)] as never,
    })
    phone.useContacts.getState().deleteContact('c2')
    await publish(phone)

    const tablet = await device('tablet')
    const listed = (await tablet.cloudTransport.listBinaryFiles())
      .map((file) => file.filename)
      .sort()
    expect(listed).toEqual([
      'witness-work-img-contact-c1--r9.jpg',
      // A deleted contact can be restored, so its photo stays.
      'witness-work-img-contact-c2--r2.jpg',
    ])
    const usage = phone.photoUsage.useCloudSyncPhotoUsage.getState().usage
    expect(usage?.count).toBe(2)

    // Days later, orphan cleanup still keeps it while c2 can be restored.
    const later = vi
      .spyOn(Date, 'now')
      .mockReturnValue(NOW + 2 * 24 * 60 * 60_000)
    try {
      await phone.iCloudSync.gcImagesIfEnabled()
    } finally {
      later.mockRestore()
    }
    expect(
      (await tablet.cloudTransport.listBinaryFiles()).map((f) => f.filename)
    ).toContain('witness-work-img-contact-c2--r2.jpg')
  })

  describe('deletes nothing a wholesale change replaced', () => {
    const r1 = 'witness-work-img-contact-c1--r1.jpg'
    const r2 = 'witness-work-img-contact-c1--r2.jpg'
    const listed = async (d: Device) =>
      (await d.cloudTransport.listBinaryFiles()).map((f) => f.filename).sort()

    /** On r1, published; then the User moves to r2, which deletes r1. */
    const onR2WithOlderCopy = async () => {
      const phone = await device('phone')
      const { parsePayload } = await import('@/app/sync/payload')
      const { restoreBackupFile } = await import('@/app/sync/backupFileRestore')
      phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
      phone.useContacts.setState({
        contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
      })
      await publish(phone)
      // Its only slot: the copy a restore would bring back.
      const { files } = await phone.cloudTransport.readFiles(() => true)
      expect(files).toHaveLength(1)
      const older = parsePayload(files[0].json)!
      phone.files.set(picked('c1', 'r2'), new Uint8Array([2]))
      phone.useContacts
        .getState()
        .updateContact(withPhoto(contact('c1', 'Ada', NOW), 'r2') as never)
      await publish(phone)
      expect(await listed(phone)).toEqual([r2])
      return { phone, older, restoreBackupFile }
    }

    it('a restore from an older slot or sync', async () => {
      const { phone, older } = await onR2WithOlderCopy()
      // Restore or Replace from a slot, iCloud, Google Drive or onboarding.
      phone.iCloudSync.replaceLocalWithRemote(older)
      await publish(phone)
      expect(await listed(phone)).toContain(r2)
    })

    it('a backup file restored over this device', async () => {
      const { phone, older, restoreBackupFile } = await onR2WithOlderCopy()
      expect(
        restoreBackupFile({
          contactStore: older.contactStore as never,
          preferencesStore: {},
        }).ok
      ).toBe(true)
      expect(phone.useContacts.getState().contacts[0].avatar?.revision).toBe(
        'r1'
      )
      await publish(phone)
      expect(await listed(phone)).toContain(r2)
    })

    it('a publish a wholesale change overtook', async () => {
      const phone = await device('phone')
      const published = {
        ...(await import('@/app/sync/publishedPhotos')),
        ...(await import('@/app/sync/photoBaseline')),
      }
      const onRevision = (revision: string) =>
        phone.useContacts.setState({
          contacts: [withPhoto(contact('c1', 'Ada', NOW), revision)] as never,
        })
      /** References read as a publish starts, recorded once it's out. */
      const publishing = (between?: () => void) => {
        const mark = published.publishedPhotosMark()
        const references = published.currentPhotoReferences()
        between?.()
        return published.takeReplacedPhotos(
          'account',
          references,
          mark,
          published.currentPhotoReferences
        )
      }
      onRevision('r1')
      expect(publishing()).toEqual([])
      // The User moves to r2, but a restore back to r1 lands while that
      // publish is out: it deletes nothing, and the restore is the baseline.
      onRevision('r2')
      expect(
        publishing(() => {
          onRevision('r1')
          published.rebasePublishedPhotos()
        })
      ).toEqual([])
      expect(publishing()).toEqual([])
      // A User's edit after it still frees the old photo.
      onRevision('r3')
      expect(publishing()).toEqual([r1])
    })

    it('a merge, either way: the device that replaced it deletes it', async () => {
      const phone = await device('phone')
      phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
      phone.useContacts.setState({
        contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
      })
      await publish(phone)
      // A tablet's later edit carries r2.
      const tablet = await device('tablet')
      tablet.files.set(picked('c1', 'r2'), new Uint8Array([2]))
      tablet.useContacts.setState({
        contacts: [
          withPhoto(contact('c1', 'Ada', NOW + 60_000), 'r2'),
        ] as never,
      })
      await publish(tablet)
      await phone.iCloudSync.pullAndMerge('manual')
      expect(phone.useContacts.getState().contacts[0].avatar?.revision).toBe(
        'r2'
      )
      await publish(phone)
      // A third device with a later edit on r1 may still swing it back.
      expect(await listed(phone)).toEqual([r1, r2])

      // And back: a later edit elsewhere still on r1 wins the merge.
      const laptop = await device('laptop')
      laptop.files.set(picked('c1', 'r1'), new Uint8Array([1]))
      laptop.useContacts.setState({
        contacts: [
          withPhoto(contact('c1', 'Ada R.', NOW + 120_000), 'r1'),
        ] as never,
      })
      await publish(laptop)
      await phone.iCloudSync.pullAndMerge('manual')
      expect(phone.useContacts.getState().contacts[0].avatar?.revision).toBe(
        'r1'
      )
      await publish(phone)
      expect(await listed(phone)).toEqual([r1, r2])
    })
  })

  describe('keeps a photo deleted on another device deleted', () => {
    const r1 = 'witness-work-img-contact-c1--r1.jpg'
    const p1 = 'witness-work-img-profile--p1.jpg'
    const note = 'witness-work-note-photo-0001.jpg'
    const profilePath = `${DOCS}profile-avatar-picked-p1.jpg`
    const listed = async (d: Device) =>
      (await d.cloudTransport.listBinaryFiles()).map((f) => f.filename).sort()

    /**
     * A phone and a tablet with Ada's, the profile's and a note's photo, both
     * synced. The phone then removes all three, which deletes them. The tablet
     * has only downloaded them, unless it published since.
     */
    const removedOnPhone = async ({ tabletPublished = true } = {}) => {
      const phone = await device('phone')
      phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
      phone.files.set(profilePath, new Uint8Array([2]))
      phone.files.set(notePath('photo-0001'), new Uint8Array([3]))
      phone.useContacts.setState({
        contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
      })
      phone.useProfile
        .getState()
        .setAvatar({ type: 'image', value: profilePath, revision: 'p1' })
      phone.useConversations.setState({
        conversations: [visit('v1', 'photo-0001')] as never,
      })
      await publish(phone)
      const tablet = await device('tablet', { os: 'android' })
      await tablet.iCloudSync.pullAndMerge('manual')
      if (tabletPublished) await publish(tablet)
      expect(await listed(tablet)).toEqual([r1, p1, note].sort())

      phone.useContacts
        .getState()
        .updateContact({ id: 'c1', avatar: undefined } as never)
      phone.useProfile.getState().setAvatar({ type: 'none', value: '' })
      phone.useConversations.setState({
        conversations: [visit('v1', null, NOW + 1)] as never,
      })
      await publish(phone)
      expect(await listed(phone)).toEqual([])
      return { phone, tablet }
    }

    /** The tablet catches up, publishes, and the phone reads it. */
    const converge = async ({ phone, tablet }: Record<string, Device>) => {
      await tablet.iCloudSync.pullAndMerge('manual')
      await publish(tablet)
      await phone.iCloudSync.pullAndMerge('manual')
      await publish(phone)
      for (const d of [phone, tablet]) {
        expect(d.useContacts.getState().contacts[0].avatar).toBeUndefined()
        expect(d.useProfile.getState().avatar.type).toBe('none')
        expect(
          d.useConversations.getState().conversations[0].noteDoc
        ).toBeUndefined()
      }
    }

    it('when the other device publishes before it reads the deletion', async () => {
      const { phone, tablet } = await removedOnPhone()
      // An edit on the tablet goes out before its pull: its snapshot still
      // refers to the photos, but nothing puts them back.
      tablet.useContacts
        .getState()
        .addContact(contact('c2', 'Bo', NOW) as never)
      await publish(tablet)
      expect(await listed(tablet)).toEqual([])
      await converge({ phone, tablet })
      expect(await listed(phone)).toEqual([])
      expect(
        phone.photoUsage.useCloudSyncPhotoUsage.getState().usage?.count
      ).toBe(0)
    })

    it('when the other device’s photo pass runs before it reads the deletion', async () => {
      const { phone, tablet } = await removedOnPhone({ tabletPublished: false })
      // A foreground, or room freeing on a full account, uploads what's
      // missing from the tablet's current state.
      await tablet.iCloudSync.pushImagesIfEnabled()
      expect(await listed(tablet)).toEqual([])
      await converge({ phone, tablet })
      expect(await listed(phone)).toEqual([])
    })

    it('unless a newer edit on the other device keeps it', async () => {
      const { phone, tablet } = await removedOnPhone()
      // Edited after the removal: the tablet's Ada, still on r1, wins.
      tablet.useContacts.getState().updateContact({
        id: 'c1',
        name: 'Ada R.',
        updatedAt: Date.now() + 60_000,
      } as never)
      await publish(tablet)
      expect(await listed(tablet)).toEqual([])
      // Once it has read the removal, the merge keeps r1, so it goes back.
      await tablet.iCloudSync.pullAndMerge('manual')
      await tablet.iCloudSync.imageWorkSettled()
      expect(tablet.useContacts.getState().contacts[0].avatar?.revision).toBe(
        'r1'
      )
      expect(await listed(tablet)).toEqual([r1])
      await phone.iCloudSync.pullAndMerge('manual')
      const avatar = phone.useContacts.getState().contacts[0].avatar!
      expect(avatar.revision).toBe('r1')
      expect(phone.files.has(avatar.value.split('?')[0])).toBe(true)
    })

    it('puts a new photo at once, and every photo back after the account’s are all deleted', async () => {
      const { tablet } = await removedOnPhone()
      // A new revision is a new name: nothing deleted it.
      tablet.files.set(picked('c1', 'r5'), new Uint8Array([5]))
      tablet.useContacts
        .getState()
        .updateContact(
          withPhoto(contact('c1', 'Ada', Date.now() + 60_000), 'r5') as never
        )
      await publish(tablet)
      const r5 = 'witness-work-img-contact-c1--r5.jpg'
      expect(await listed(tablet)).toEqual([r5])

      // Every photo of the account deleted at once (the account had no slot
      // for a day): the devices that still refer to them put them back.
      await tablet.cloudTransport.deleteAllBinaries()
      await publish(tablet)
      await tablet.iCloudSync.pullAndMerge('manual')
      await tablet.iCloudSync.imageWorkSettled()
      expect(await listed(tablet)).toEqual([r5])
    })
  })

  it('downloads a photo once, even after its listing time is forgotten', async () => {
    const phone = await device('phone')
    phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
    phone.useContacts.setState({
      contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
    })
    await publish(phone)
    const tablet = await device('tablet')
    await tablet.iCloudSync.pullAndMerge('manual')
    const { bookkeepingForNewTransport } = await import('@/app/sync/imageSync')
    tablet.usePreferences.setState({
      iCloudImageSync: bookkeepingForNewTransport(
        tablet.usePreferences.getState().iCloudImageSync
      ),
    })
    server.state.log.length = 0
    await tablet.iCloudSync.pullAndMerge('manual')
    expect(server.state.log).not.toContain('POST sync/photos/get')
  })

  it('moves photos from Google Drive to Cloud Sync, uploading them there', async () => {
    const phone = await device('phone', { option: 'platform' })
    phone.usePreferences.setState({ iCloudSyncIncludeImages: true })
    phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
    phone.useContacts.setState({
      contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
    })
    await publish(phone)
    expect(driveNames()).toContain('witness-work-img-contact-c1--r1.jpg')

    expect((await phone.switchSyncOption('cloud', 'settings')).outcome).toBe(
      'switched'
    )
    await phone.iCloudSync.imageWorkSettled()
    // Uploaded to Drive isn't uploaded to Cloud Sync.
    expect(server.photoNames('family')).toHaveLength(1)
    const entry =
      phone.usePreferences.getState().iCloudImageSync[
        'witness-work-img-contact-c1--r1.jpg'
      ]
    expect(entry.containerMtime).toBeGreaterThan(0)
  })

  it('cleans up photos nothing refers to on Keep This Device’s Data', async () => {
    const phone = await device('phone')
    phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
    phone.files.set(picked('c2', 'r2'), new Uint8Array([2]))
    phone.useContacts.setState({
      contacts: [
        withPhoto(contact('c1', 'Ada', NOW), 'r1'),
        withPhoto(contact('c2', 'Bo', NOW), 'r2'),
      ] as never,
    })
    await publish(phone)
    const tablet = await device('tablet')
    tablet.useContacts.setState({
      contacts: [contact('c3', 'Cy', NOW)] as never,
    })
    await tablet.iCloudSync.overwriteRemoteWithLocal()
    expect(server.photoNames('family')).toEqual([])
  })

  it('waits on photos’ switch, and holds none on a server without photos', async () => {
    const phone = await device('phone')
    phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
    phone.useContacts.setState({
      contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
    })
    phone.usePreferences.setState({ cloudSyncPhotos: false })
    await publish(phone)
    expect(server.photoNames('family')).toEqual([])
    expect(phone.usePreferences.getState().iCloudSyncIssue).toBeNull()
    // Waiting, not failing: no backoff holds it once the switch is back.
    expect(phone.usePreferences.getState().iCloudImageSync).toEqual({})

    phone.usePreferences.setState({ cloudSyncPhotos: null })
    expect(phone.iCloudSync.photosTravel()).toBe(false)
    phone.usePreferences.setState({ cloudSyncPhotos: true })
    await phone.iCloudSync.pushImagesIfEnabled()
    expect(server.photoNames('family')).toHaveLength(1)
  })
})
