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
  }))

  const sync = await import('@/app/sync/iCloudSync')
  const syncOption = await import('@/app/sync/syncOption')
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
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  const { usePreferences } = await import('@/stores/preferences')
  const { default: useContacts } = await import('@/stores/contactsStore')
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
    onRefused: () => usePreferences.setState({ cloudSyncEntitled: false }),
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
    name,
    account,
    cloudTransport,
    usePreferences,
    useContacts,
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
    expect(server.slotIds('family')).toEqual([])
    server.state.enabled = false
    expect(await phone.switchSyncOption('cloud', 'offer')).toEqual({
      outcome: 'failed',
      reason: 'disabled',
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
