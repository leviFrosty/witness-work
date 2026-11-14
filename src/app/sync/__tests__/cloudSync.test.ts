import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeGoogleDrive,
  memoryTransfer,
} from '@/lib/syncTransport/googleDrive/__tests__/driveTestKit'
import { createFakeSyncServer } from '@/lib/syncTransport/server/__tests__/fakeSyncServer'

const runtime = vi.hoisted(() => ({
  appState: 'active',
  os: 'android',
  files: {} as Record<string, Map<string, Uint8Array>>,

  mmkv: {} as Record<string, Map<string, string>>,

  slots: {} as Record<
    string,
    Map<string, { accountId: string; etag: string; blob: Uint8Array }>
  >,
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
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

let cryptoPauseMs = 0

type Option = 'cloud' | 'platform' | 'off'

async function device(
  name: string,
  {
    os = 'ios',
    option = 'cloud',
    account = 'family',
    entitled = true,
  }: {
    os?: 'ios' | 'android' | 'web'
    option?: Option
    account?: string
    entitled?: boolean
  } = {}
) {
  vi.resetModules()
  const files = (runtime.files[name] ??= new Map())

  const stored = (runtime.mmkv[name] ??= new Map<string, string>())
  vi.doMock('@/stores/mmkv', async () => ({
    ...(await import('@/__tests__/mocks/mmkv')),
    mmkvStorage: {
      getString: (key: string) => stored.get(key),
      set: (key: string, value: string) => stored.set(key, value),
      delete: (key: string) => stored.delete(key),
    },
  }))
  const web = os === 'web'

  vi.doMock('react-native', () => ({
    Platform: { OS: web ? 'web' : 'android' },
    AppState: {
      get currentState() {
        return runtime.appState
      },
      addEventListener: () => ({ remove: () => {} }),
    },
  }))
  vi.doMock('expo-device', () => ({
    DeviceType: { PHONE: 1, TABLET: 2 },
    deviceType: 1,
    modelName: name,
    osName: os === 'ios' ? 'iOS' : os === 'web' ? 'Web' : 'Android',
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
  const { webPhotoFiles } = await import(
    '@/lib/syncTransport/server/photoFiles'
  )
  const { webPhotos } = await import('@/lib/files/webPhotoStore')
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  const { usePreferences } = await import('@/stores/preferences')
  const { default: useContacts } = await import('@/stores/contactsStore')
  const { default: useConversations } = await import(
    '@/stores/conversationStore'
  )
  const { useProfile } = await import('@/stores/profile')
  const { default: useMileage } = await import('@/stores/mileage')
  const { useUpdateRequired } = await import('@/lib/appUpdate/updateRequired')
  const claims = await import('@/lib/accountClaimRegistry')
  const pullSettled = await import('@/lib/cloudSyncPullSettled')

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
  if (!web) {
    registerAndroidSyncTransport(driveTransport)
    auth.setFakeGoogleDrive({ origin: drive.origin, account })
    expect(await auth.connectGoogleDrive({ selectAccount: false })).toBe(
      'connected'
    )
  }

  const accountKey = new Uint8Array(32).fill(account.length)
  const accountId = `acct-${account}`.padEnd(22, '0')
  const slots = (runtime.slots[name] ??= new Map())
  const cloudTransport = createServerTransport({
    slotStore: web
      ? undefined
      : {
          read: (owner, slotId) => {
            const slot = slots.get(slotId)
            return slot?.accountId === owner ? slot : null
          },
          write: (owner, slotId, etag, blob) => {
            slots.set(slotId, { accountId: owner, etag, blob: blob.slice() })
          },
          remove: (slotId) => {
            slots.delete(slotId)
          },
          prune: (owner, keep) => {
            for (const [slotId, slot] of slots)
              if (!keep.has(slotId) || slot.accountId !== owner)
                slots.delete(slotId)
          },
          clear: () => slots.clear(),
        },
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
    platform: web ? 'ios' : os,
    now: () => Date.now(),
    pause: () =>
      cryptoPauseMs
        ? new Promise<void>((resolve) => setTimeout(resolve, cryptoPauseMs))
        : Promise.resolve(),
    onRefused: (refusal) =>
      refusal !== 'photos_disabled' &&
      usePreferences.setState({ cloudSyncEntitled: false }),
    files: web
      ? webPhotoFiles
      : {
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
    syncProvider: option === 'off' || web ? null : option,
    iCloudSyncEnabled: option !== 'off',
    cloudSyncConfig: { enabled: true, entitlement: 'supporter' },
    cloudSyncEntitled: entitled,
    cloudSyncPhotos: true,
    hasMigratedToSyncSchema: true,
    hasReconciledSyncDefinitions: true,
  })
  if (entitled) server.state.supporters.add(account)

  useSupporter.getState().setSupporter(true)
  if (option !== 'off') identity.checkICloudIdentity('initial_enable')

  return {
    ...sync,
    ...syncOption,
    ...provider,
    ...cloudSyncRequest,

    status: () =>
      fetchSyncStatus({
        baseUrl: 'https://api.test',
        authorize: (run) => run(`Bearer ${account}`),
        fetchImpl: server.fetch,
      }),
    name,
    account,
    os,
    cloudTransport,
    files,
    webPhotos,
    webPhotoBytes: async (id: string) => {
      const blob = await webPhotos.blob(id)
      return blob ? [...new Uint8Array(await blob.arrayBuffer())] : null
    },
    photoUsage,
    usePreferences,
    useContacts,
    useConversations,
    useProfile,
    useMileage,
    useUpdateRequired,
    claims,
    pullSettled,
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
  runtime.mmkv = {}
  runtime.slots = {}
  runtime.appState = 'active'
  runtime.os = 'android'
  cryptoPauseMs = 0
})

const running = async <T>(d: Device, work: () => Promise<T>): Promise<T> => {
  const before = runtime.os
  runtime.os = d.os === 'web' ? 'web' : before
  try {
    return await work()
  } finally {
    runtime.os = before
  }
}

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

    await iphone.iCloudSync.push('manual')
    expect(server.slotIds('family')).toHaveLength(2)
  })

  it('pulls as soon as the live socket says another device changed', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    const pixel = await device('pixel', { os: 'android' })
    const uninstall = pixel.installiCloudSync()
    try {
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

    pixel.usePreferences.setState({ cloudSyncEntitled: true })
    expect(await pixel.iCloudSync.push('manual')).toBe(false)
    expect(pixel.usePreferences.getState().cloudSyncEntitled).toBe(false)
    expect(server.slotIds('family')).toEqual([])

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

    iphone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW), contact('c2', 'Ben', NOW)] as never,
    })
    expect(iphone.iCloudSync.canSync()).toBe(false)
    expect(await iphone.iCloudSync.push('manual')).toBe(false)
    await iphone.iCloudSync.pullAndMerge('manual')
    expect(server.state.log).toHaveLength(sent)
    expect(iphone.usePreferences.getState().iCloudSyncPendingPush).toBe(true)

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

    phone.usePreferences.setState({ iCloudSyncPendingPush: true })

    const outcome = await phone.switchSyncOption('cloud', 'settings')
    expect(outcome).toEqual({ outcome: 'switched', pending: false })
    expect(phone.currentSyncOption()).toBe('cloud')
    expect(phone.contactNames()).toEqual(['Ada', 'Ben', 'Cy'])
    expect(server.slotIds('family')).toEqual([phone.slotId()])

    expect(driveNames()).toEqual(driveBefore)

    expect(phone.usePreferences.getState().cloudSyncTrayOffer).toBe('answered')

    expect(phone.usePreferences.getState().passkeyPrompt.earned).toMatchObject({
      reason: 'cloud_sync',
    })
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

    tablet.useContacts.getState().deleteContact('c1')
    await sync(tablet, tablet)
    expect(tablet.contactNames()).toEqual(['Ben'])

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

    phone.usePreferences.setState({ iCloudSyncPendingPush: true })
    server.state.log.length = 0
    const outcome = await phone.switchSyncOption('platform', 'settings')
    expect(outcome).toEqual({ outcome: 'switched', pending: false })

    expect(server.state.log.filter((op) => op !== 'POST sync/list')).toEqual([
      'POST sync/put',
      'POST sync/delete',
    ])

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
    expect(phone.usePreferences.getState().passkeyPrompt.earned).toBeNull()
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

    const laptop = await device('laptop', { os: 'ios', option: 'cloud' })
    laptop.useContacts.setState({
      contacts: [contact('c9', 'Dee', NOW - 5_000)] as never,
    })
    await sync(laptop)
    const driveBefore = driveNames()

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

    expect(server.requestedAt('family')).toBe(NOW)

    expect(driveNames()).toEqual(driveBefore)
    expect(tablet.currentSyncOption()).toBe('platform')

    await sync(laptop)
    expect(laptop.contactNames()).toEqual(['Ada', 'Ben', 'Dee'])

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

const publish = async (d: Device) => {
  expect(await d.iCloudSync.push('manual')).toBe(true)
  await d.iCloudSync.imageWorkSettled()
}

const launchedDevice = async (...args: Parameters<typeof device>) => {
  const d = await device(...args)
  await d.iCloudSync.pullAndMerge('manual')
  return d
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
    await android.iCloudSync.imageWorkSettled()
    const avatar = android.useContacts.getState().contacts[0].avatar!
    const local = avatar.value.split('?')[0]
    expect(local).toBe(`${DOCS}contact-c1-avatar-synced-r1.jpg`)
    expect([...android.files.get(local)!]).toEqual([1, 1, 1])
    expect([...android.files.get(notePath('photo-0001'))!]).toEqual([2, 2])

    const profilePath = `${DOCS}profile-avatar-picked-p1.jpg`
    android.files.set(profilePath, new Uint8Array([3]))
    android.useProfile
      .getState()
      .setAvatar({ type: 'image', value: profilePath, revision: 'p1' })
    await publish(android)
    await iphone.iCloudSync.pullAndMerge('manual')
    await iphone.iCloudSync.imageWorkSettled()
    const profile = iphone.useProfile.getState().avatar!
    expect(profile.value.split('?')[0]).toBe(
      `${DOCS}profile-avatar-synced-p1.jpg`
    )
    expect([
      ...iphone.files.get(`${DOCS}profile-avatar-synced-p1.jpg`)!,
    ]).toEqual([3])

    for (const name of server.photoNames('family'))
      expect(server.photoBytes('family', name)![0]).toBe(1)
  })

  describe('with a browser on the account (note photos only)', () => {
    const phoneWithPhotos = async () => {
      const iphone = await device('iphone', { os: 'ios' })
      iphone.files.set(picked('c1', 'r1'), new Uint8Array([1, 1, 1]))
      iphone.files.set(notePath('photo-0001'), new Uint8Array([2, 2]))
      const profilePath = `${DOCS}profile-avatar-picked-p1.jpg`
      iphone.files.set(profilePath, new Uint8Array([3]))
      iphone.useProfile
        .getState()
        .setAvatar({ type: 'image', value: profilePath, revision: 'p1' })
      iphone.useContacts.setState({
        contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
      })
      iphone.useConversations.setState({
        conversations: [visit('v1', 'photo-0001')] as never,
      })
      await publish(iphone)
      return iphone
    }

    it('downloads the note photo and leaves contact and profile photos alone', async () => {
      const iphone = await phoneWithPhotos()
      const stored = server.photoNames('family')
      expect(stored).toHaveLength(3)

      const web = await device('browser', { os: 'web' })
      server.state.log.length = 0
      await running(web, async () => {
        expect(web.iCloudSync.photosTravel()).toBe(true)
        await web.iCloudSync.pullAndMerge('manual')
        await web.iCloudSync.imageWorkSettled()
        expect(await web.iCloudSync.push('manual')).toBe(true)
        await web.iCloudSync.imageWorkSettled()
      })

      expect(await web.webPhotoBytes('photo-0001')).toEqual([2, 2])
      expect(web.webPhotos.list().map((photo) => photo.id)).toEqual([
        'photo-0001',
      ])
      expect(
        server.state.log.filter((op) => op === 'POST sync/photos/get')
      ).toHaveLength(1)
      expect(
        server.state.log.filter((op) => /photos\/(put|delete)/.test(op))
      ).toEqual([])

      expect(web.contactNames()).toEqual(['Ada'])
      expect(web.useContacts.getState().contacts[0].avatar).toMatchObject({
        type: 'image',
        revision: 'r1',
      })
      expect([...web.files.keys()]).toEqual([])
      expect(server.photoNames('family')).toEqual(stored)
      expect(iphone.name).toBe('iphone')
    })

    it('sends a note photo added in the browser to the phone', async () => {
      const iphone = await phoneWithPhotos()
      const web = await device('browser', { os: 'web' })
      await running(web, async () => {
        await web.iCloudSync.pullAndMerge('manual')
        await web.iCloudSync.imageWorkSettled()
        web.webPhotos.put(
          'web-photo-0002',
          new Blob([new Uint8Array([7, 7, 7])])
        )
        web.useConversations.setState({
          conversations: [
            ...web.useConversations.getState().conversations,
            visit('v2', 'web-photo-0002', NOW + 10),
          ] as never,
        })
        await publish(web)
      })
      expect(server.photoNames('family')).toHaveLength(4)
      expect(
        web.usePreferences.getState().iCloudImageSync?.[
          'witness-work-note-web-photo-0002.jpg'
        ]
      ).toMatchObject({ uploadedMtime: expect.any(Number) })

      await iphone.iCloudSync.pullAndMerge('manual')
      await iphone.iCloudSync.imageWorkSettled()
      expect([...iphone.files.get(notePath('web-photo-0002'))!]).toEqual([
        7, 7, 7,
      ])
      expect([...iphone.files.get(notePath('photo-0001'))!]).toEqual([2, 2])
    })

    it('deletes a note photo from the account once the browser removes it from its note', async () => {
      const iphone = await phoneWithPhotos()
      const stored = server.photoNames('family')
      const web = await device('browser', { os: 'web' })
      await running(web, async () => {
        await web.iCloudSync.pullAndMerge('manual')
        await web.iCloudSync.imageWorkSettled()
        await publish(web)
        expect(server.photoNames('family')).toEqual(stored)
        web.useConversations.setState({
          conversations: [visit('v1', null, NOW + 10)] as never,
        })
        await publish(web)
        await web.iCloudSync.imageWorkSettled()
      })
      expect(server.photoNames('family')).toHaveLength(stored.length - 1)

      await iphone.iCloudSync.pullAndMerge('manual')
      await iphone.iCloudSync.imageWorkSettled()
      expect(iphone.useContacts.getState().contacts[0].avatar).toMatchObject({
        type: 'image',
        revision: 'r1',
      })
      expect([...iphone.files.get(picked('c1', 'r1'))!]).toEqual([1, 1, 1])
    })

    it('keeps the phone’s photos when the browser edits the records around them', async () => {
      const iphone = await phoneWithPhotos()
      const stored = server.photoNames('family')
      const web = await device('browser', { os: 'web' })
      await running(web, () => web.iCloudSync.pullAndMerge('manual'))

      await running(web, async () => {
        web.useContacts.getState().updateContact({ id: 'c1', name: 'Ada R.' })
        web.useConversations.setState({
          conversations: web.useConversations
            .getState()
            .conversations.map((v) => ({
              ...v,
              note: 'Edited on the web',
              updatedAt: NOW + 10,
            })) as never,
        })
        expect(await web.iCloudSync.push('manual')).toBe(true)
        await web.iCloudSync.imageWorkSettled()
        expect(await web.iCloudSync.push('manual')).toBe(true)
        await web.iCloudSync.imageWorkSettled()
      })

      const before = iphone.useContacts.getState().contacts[0].avatar!.value
      await iphone.iCloudSync.pullAndMerge('manual')
      await iphone.iCloudSync.imageWorkSettled()
      const contactNow = iphone.useContacts.getState().contacts[0]
      expect(contactNow.name).toBe('Ada R.')
      expect(contactNow.avatar).toMatchObject({ type: 'image', revision: 'r1' })
      expect(contactNow.avatar!.value.split('?')[0]).toBe(before.split('?')[0])
      expect([...iphone.files.get(picked('c1', 'r1'))!]).toEqual([1, 1, 1])
      expect([...iphone.files.get(notePath('photo-0001'))!]).toEqual([2, 2])
      expect(iphone.useProfile.getState().avatar).toMatchObject({
        type: 'image',
        revision: 'p1',
      })

      expect(await iphone.iCloudSync.push('manual')).toBe(true)
      await iphone.iCloudSync.imageWorkSettled()
      expect(server.photoNames('family')).toEqual(stored)
    })

    it('does not send a reference to a photo only the browser has', async () => {
      const iphone = await phoneWithPhotos()
      const stored = server.photoNames('family')
      const web = await device('browser', { os: 'web' })
      await running(web, () => web.iCloudSync.pullAndMerge('manual'))

      await running(web, async () => {
        web.useContacts.setState({
          contacts: [
            ...web.useContacts.getState().contacts,
            withPhoto(
              contact('c2', 'Grace', NOW + 20),
              'web1',
              'data:image/jpeg;base64,/9j/AAAA'
            ),
          ] as never,
        })
        expect(await web.iCloudSync.push('manual')).toBe(true)
        await web.iCloudSync.imageWorkSettled()
      })

      await iphone.iCloudSync.pullAndMerge('manual')
      await iphone.iCloudSync.imageWorkSettled()
      const grace = iphone.useContacts
        .getState()
        .contacts.find((c) => c.id === 'c2')!
      expect(grace.avatar?.type ?? 'none').not.toBe('image')

      expect(
        iphone.useContacts.getState().contacts.find((c) => c.id === 'c1')!
          .avatar!.value
      ).toContain('contact-c1-avatar')
      expect(server.photoNames('family')).toEqual(stored)
      const failures = Object.values(
        iphone.usePreferences.getState().iCloudImageSync ?? {}
      ).filter((entry) => entry.lastError)
      expect(failures).toEqual([])
    })
  })

  it('merges another device’s record while a large photo is still downloading', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.files.set(picked('c1', 'r1'), new Uint8Array([1, 1, 1]))
    iphone.useContacts.setState({
      contacts: [
        withPhoto(contact('c1', 'Ada', NOW), 'r1'),
        contact('c2', 'Bo', NOW),
      ] as never,
    })
    await publish(iphone)

    let release = () => {}
    server.state.photoGetGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const android = await device('android', { os: 'android' })
    expect(await android.iCloudSync.pullAndMerge('manual')).toBe(true)
    expect(android.contactNames()).toEqual(['Ada', 'Bo'])

    iphone.useContacts.getState().updateContact({ id: 'c2', name: 'Bo Reyes' })
    expect(await iphone.iCloudSync.push('manual')).toBe(true)
    expect(await android.iCloudSync.pullAndMerge('manual')).toBe(true)
    expect(android.contactNames()).toEqual(['Ada', 'Bo Reyes'])
    const local = `${DOCS}contact-c1-avatar-synced-r1.jpg`
    expect(android.files.has(local)).toBe(false)

    release()
    await android.iCloudSync.imageWorkSettled()
    expect([...android.files.get(local)!]).toEqual([1, 1, 1])
    expect(
      android.useContacts.getState().contacts[0].avatar!.value.split('?')[0]
    ).toBe(local)
  })

  it('covers the pulls that land during a photo transfer with one more photo pass', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.files.set(picked('c1', 'r1'), new Uint8Array([1, 1, 1]))
    iphone.useContacts.setState({
      contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
    })
    await publish(iphone)

    const lists = () =>
      server.state.log.filter((line) => line === 'POST sync/photos/list').length

    const probe = await device('probe', { os: 'android' })
    server.state.log.length = 0
    await probe.iCloudSync.pullAndMerge('manual')
    await probe.iCloudSync.imageWorkSettled()
    const perPass = lists()

    let release = () => {}
    server.state.photoGetGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const android = await device('android', { os: 'android' })
    server.state.log.length = 0
    await android.iCloudSync.pullAndMerge('manual')
    for (let i = 0; i < 6; i++) await android.iCloudSync.pullAndMerge('manual')
    release()
    await android.iCloudSync.imageWorkSettled()

    expect(lists()).toBeLessThanOrEqual(perPass * 2)
  })

  it('records the largest original at the slowest link as uploaded, however long it took to seal', async () => {
    vi.useFakeTimers()
    try {
      const phone = await device('phone')
      const filename = 'witness-work-img-contact-c1--r1.jpg'
      phone.files.set(picked('c1', 'r1'), new Uint8Array(20 * 1024 * 1024))
      phone.useContacts.setState({
        contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
      })

      cryptoPauseMs = 1500
      server.state.photoUploadBytesPerSecond = 55 * 1024
      const published = publish(phone)
      await vi.advanceTimersByTimeAsync(15 * 60_000)
      await published
      expect(server.photoNames('family')).toHaveLength(1)
      const recorded = phone.usePreferences.getState().iCloudImageSync[filename]
      expect(recorded.uploadedMtime).toBeGreaterThan(0)
      expect(recorded.errorCode).toBeUndefined()
      expect(recorded.failures).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('doesn’t make a pull wait for a cleanup queued behind a photo download', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.files.set(picked('c1', 'r1'), new Uint8Array([1, 1, 1]))
    iphone.useContacts.setState({
      contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
    })
    await publish(iphone)

    let release = () => {}
    server.state.photoGetGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const android = await device('android', { os: 'android' })
    await android.iCloudSync.pullAndMerge('manual')

    const cleanup = android.iCloudSync.gcImagesIfEnabled()
    const startedAt = performance.now()
    await android.iCloudSync.pullAndMerge('manual')
    expect(performance.now() - startedAt).toBeLessThan(1_000)
    release()
    await android.iCloudSync.imageWorkSettled()
    await cleanup
  })

  it('doesn’t write a switched-away setup’s photo results over the new one', async () => {
    const iphone = await device('iphone', { os: 'ios' })
    iphone.files.set(picked('c1', 'r1'), new Uint8Array([1, 1, 1]))
    iphone.useContacts.setState({
      contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
    })
    await publish(iphone)

    let release = () => {}
    server.state.photoGetGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const android = await device('android', { os: 'android' })
    await android.iCloudSync.pullAndMerge('manual')
    await vi.waitFor(() =>
      expect(server.state.log).toContain('POST sync/photos/get')
    )

    expect(await android.switchSyncOption('platform', 'tools')).toMatchObject({
      outcome: 'switched',
    })
    const afterSwitch = android.usePreferences.getState().iCloudImageSync
    release()
    await android.iCloudSync.imageWorkSettled()

    expect(android.usePreferences.getState().iCloudImageSync).toBe(afterSwitch)
    expect(
      android.useContacts.getState().contacts[0].avatar!.value
    ).not.toContain('file://')
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

    expect(server.photoNames('family')).toEqual([])
    const revised = phone.useContacts.getState().contacts[0]
    const revision = revised.avatar?.revision
    expect(revision).toMatch(/^[a-z0-9]{10,}$/)
    expect(revised.updatedAt).toBeGreaterThan(NOW)

    await publish(phone)
    expect(server.photoNames('family')).toHaveLength(1)

    const tablet = await device('tablet')
    await tablet.iCloudSync.pullAndMerge('manual')
    await tablet.iCloudSync.imageWorkSettled()
    expect([
      ...tablet.files.get(`${DOCS}contact-c1-avatar-synced-${revision}.jpg`)!,
    ]).toEqual([4])
  })

  it('keeps a photo on its device when storage is full, and retries only on foreground or room', async () => {
    const phone = await device('phone')

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

    expect(phone.usePreferences.getState().iCloudSyncIssue).toBeNull()

    server.state.log.length = 0
    phone.useContacts.getState().updateContact({ id: 'c1', name: 'Ada R.' })
    await publish(phone)
    expect(server.state.log).not.toContain('POST sync/photos/put')

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

    await phone.iCloudSync.pushImagesIfEnabled()
    expect(server.photoNames('family')).toHaveLength(1)
  })

  it('deletes a replaced or removed photo once the snapshot without it is out', async () => {
    const phone = await launchedDevice('phone')
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

      'witness-work-img-contact-c2--r2.jpg',
    ])
    const usage = phone.photoUsage.useCloudSyncPhotoUsage.getState().usage
    expect(usage?.count).toBe(2)

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

    const onR2WithOlderCopy = async () => {
      const phone = await launchedDevice('phone')
      const { parsePayload } = await import('@/app/sync/payload')
      const { restoreBackupFile } = await import('@/app/sync/backupFileRestore')
      phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
      phone.useContacts.setState({
        contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
      })
      await publish(phone)

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
      const phone = await launchedDevice('phone')
      const published = {
        ...(await import('@/app/sync/publishedPhotos')),
        ...(await import('@/app/sync/photoBaseline')),
      }
      const onRevision = (revision: string) =>
        phone.useContacts.setState({
          contacts: [withPhoto(contact('c1', 'Ada', NOW), revision)] as never,
        })

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

      onRevision('r2')
      expect(
        publishing(() => {
          onRevision('r1')
          published.rebasePublishedPhotos()
        })
      ).toEqual([])
      expect(publishing()).toEqual([])

      onRevision('r3')
      expect(publishing()).toEqual([r1])
    })

    it('a merge, either way: the device that replaced it deletes it', async () => {
      const phone = await launchedDevice('phone')
      phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
      phone.useContacts.setState({
        contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
      })
      await publish(phone)

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

      expect(await listed(phone)).toEqual([r1, r2])

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

  describe('deletes a photo removed just before the app was killed', () => {
    const r1 = 'witness-work-img-contact-c1--r1.jpg'
    const listed = async (d: Device) =>
      (await d.cloudTransport.listBinaryFiles()).map((f) => f.filename).sort()
    const dataOf = (state: object) =>
      Object.fromEntries(
        Object.entries(state).filter(([, value]) => typeof value !== 'function')
      )

    const relaunch = async (d: Device) => {
      const saved = {
        preferences: dataOf(d.usePreferences.getState()),
        contacts: dataOf(d.useContacts.getState()),
        profile: dataOf(d.useProfile.getState()),
      }
      const reborn = await device(d.name, { account: d.account })
      reborn.usePreferences.setState(saved.preferences)
      reborn.useContacts.setState(saved.contacts)
      reborn.useProfile.setState(saved.profile)
      return reborn
    }

    const removedBeforeKill = async () => {
      const phone = await launchedDevice('phone')
      phone.files.set(picked('c1', 'r1'), new Uint8Array([1]))
      phone.useContacts.setState({
        contacts: [withPhoto(contact('c1', 'Ada', NOW), 'r1')] as never,
      })
      await publish(phone)
      expect(await listed(phone)).toEqual([r1])
      phone.useContacts.setState({
        contacts: [contact('c1', 'Ada', NOW + 1_000)] as never,
      })
      return phone
    }

    const launch = async (d: Device, reason = 'launch') => {
      await d.iCloudSync.catchUp(reason)
      await d.iCloudSync.imageWorkSettled()
    }

    it('frees the space when the next launch publishes', async () => {
      const reborn = await relaunch(await removedBeforeKill())
      await launch(reborn)
      expect(await listed(reborn)).toEqual([])
      expect(reborn.usePreferences.getState().iCloudImageSync ?? {}).toEqual({})
      expect(
        reborn.photoUsage.useCloudSyncPhotoUsage.getState().usage?.count
      ).toBe(0)
    })

    it('waits for a complete pull, so another device’s newer record keeps it', async () => {
      const phone = await removedBeforeKill()

      const tablet = await device('tablet')
      await tablet.iCloudSync.pullAndMerge('manual')
      tablet.useContacts.setState({
        contacts: tablet.useContacts.getState().contacts.map((c) => ({
          ...c,
          name: 'Ada T.',
          updatedAt: NOW + 60_000,
        })),
      })
      await publish(tablet)

      const reborn = await relaunch(phone)

      server.state.failReads = true
      await launch(reborn)
      expect(await listed(reborn)).toEqual([r1])

      server.state.failReads = false
      await launch(reborn, 'foreground')
      expect(reborn.contactNames()).toEqual(['Ada T.'])
      expect(reborn.useContacts.getState().contacts[0].avatar?.revision).toBe(
        'r1'
      )
      expect(await listed(reborn)).toEqual([r1])
    })

    it('deletes it once a complete pull follows a failed one', async () => {
      const reborn = await relaunch(await removedBeforeKill())
      server.state.failReads = true
      await launch(reborn)
      expect(await listed(reborn)).toEqual([r1])
      server.state.failReads = false
      await launch(reborn, 'foreground')
      expect(await listed(reborn)).toEqual([])
    })

    it('finishes a delete the app was killed or failed before', async () => {
      const phone = await removedBeforeKill()
      server.state.failPhotoDeletes = true
      await publish(phone)
      expect(await listed(phone)).toEqual([r1])
      server.state.failPhotoDeletes = false

      const reborn = await relaunch(phone)
      await launch(reborn)
      expect(await listed(reborn)).toEqual([])
      expect(reborn.usePreferences.getState().iCloudImageSync ?? {}).toEqual({})
    })

    it('doesn’t finish a delete for a photo that came back', async () => {
      const phone = await removedBeforeKill()
      server.state.failPhotoDeletes = true
      await publish(phone)
      server.state.failPhotoDeletes = false
      const reborn = await relaunch(phone)
      reborn.useContacts.setState({
        contacts: [withPhoto(contact('c1', 'Ada', NOW + 5_000), 'r1')] as never,
      })
      await launch(reborn)
      expect(await listed(reborn)).toEqual([r1])
    })

    it('keeps a photo another device’s merged removal already dropped', async () => {
      const phone = await removedBeforeKill()

      const tablet = await device('tablet')
      tablet.useContacts.setState({
        contacts: [contact('c1', 'Ada T.', NOW + 60_000)] as never,
      })
      await tablet.iCloudSync.pullAndMerge('manual')
      await publish(tablet)
      const reborn = await relaunch(phone)
      await reborn.iCloudSync.pullAndMerge('manual')
      expect(reborn.contactNames()).toEqual(['Ada T.'])
      await publish(reborn)

      expect(await listed(reborn)).toEqual([r1])
    })

    it('keeps a photo that came back before the next publish', async () => {
      const phone = await removedBeforeKill()
      const reborn = await relaunch(phone)

      reborn.useContacts.setState({
        contacts: [withPhoto(contact('c1', 'Ada', NOW + 2_000), 'r1')] as never,
      })
      await publish(reborn)
      expect(await listed(reborn)).toEqual([r1])
    })
  })

  describe('keeps a photo deleted on another device deleted', () => {
    const r1 = 'witness-work-img-contact-c1--r1.jpg'
    const p1 = 'witness-work-img-profile--p1.jpg'
    const note = 'witness-work-note-photo-0001.jpg'
    const profilePath = `${DOCS}profile-avatar-picked-p1.jpg`
    const listed = async (d: Device) =>
      (await d.cloudTransport.listBinaryFiles()).map((f) => f.filename).sort()

    afterEach(() => {
      vi.useRealTimers()
    })

    const settled = async (d: Device) => {
      for (let round = 0; round < 4; round++) {
        await d.iCloudSync.waitForSyncIdle()
        await d.iCloudSync.imageWorkSettled()
      }
    }

    const aMinuteLater = () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(Date.now() + 60_000)
    }

    const removedOnPhone = async ({ tabletPublished = true } = {}) => {
      const phone = await launchedDevice('phone')
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

      await tablet.iCloudSync.pushImagesIfEnabled()
      expect(await listed(tablet)).toEqual([])
      await converge({ phone, tablet })
      expect(await listed(phone)).toEqual([])
    })

    it('unless a newer edit on the other device keeps it', async () => {
      const { phone, tablet } = await removedOnPhone()

      aMinuteLater()
      tablet.useContacts
        .getState()
        .updateContact({ id: 'c1', name: 'Ada R.' } as never)
      await publish(tablet)
      expect(await listed(tablet)).toEqual([])

      await tablet.iCloudSync.pullAndMerge('manual')
      await settled(tablet)
      expect(tablet.useContacts.getState().contacts[0].avatar?.revision).toBe(
        'r1'
      )
      expect(await listed(tablet)).toEqual([r1])
      await phone.iCloudSync.pullAndMerge('manual')
      await settled(phone)
      const avatar = phone.useContacts.getState().contacts[0].avatar!
      expect(avatar.revision).toBe('r1')
      expect(phone.files.has(avatar.value.split('?')[0])).toBe(true)
    })

    it('puts a new photo at once, and every photo back after the account’s are all deleted', async () => {
      const { tablet } = await removedOnPhone()

      tablet.files.set(picked('c1', 'r5'), new Uint8Array([5]))
      aMinuteLater()
      tablet.useContacts
        .getState()
        .updateContact(withPhoto(contact('c1', 'Ada', NOW), 'r5') as never)
      await publish(tablet)
      const r5 = 'witness-work-img-contact-c1--r5.jpg'
      expect(await listed(tablet)).toEqual([r5])

      await tablet.cloudTransport.deleteAllBinaries()

      await tablet.iCloudSync.pushImagesIfEnabled()
      await tablet.iCloudSync.pullAndMerge('manual')
      await settled(tablet)
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

    expect(phone.usePreferences.getState().iCloudImageSync).toEqual({})

    phone.usePreferences.setState({ cloudSyncPhotos: null })
    expect(phone.iCloudSync.photosTravel()).toBe(false)
    phone.usePreferences.setState({ cloudSyncPhotos: true })
    await phone.iCloudSync.pushImagesIfEnabled()
    expect(server.photoNames('family')).toHaveLength(1)
  })
})

describe('The web on Cloud Sync', () => {
  const phoneClaim = {
    appUserId: 'phone-customer-0001',
    entitled: false,
    claimedAt: 1_000,
  }
  const webClaim = {
    appUserId: 'web-customer-00001',
    entitled: false,
    claimedAt: 5_000,
  }

  it('runs the engine on Cloud Sync, with no platform option or identity check', async () => {
    const browser = await device('browser', { os: 'web' })
    expect(browser.usePreferences.getState().syncProvider).toBe(null)
    expect(browser.syncProvider()).toBe('cloud')
    expect(browser.activeSyncTransport()).toBe(browser.cloudTransport)
    expect(browser.currentSyncOption()).toBe('cloud')
    expect(browser.iCloudSync.canSync()).toBe(true)

    expect(browser.usePreferences.getState().cloudSyncAccountToken).toBe(null)
  })

  it('still waits for the entitlement and Update Required', async () => {
    const browser = await device('browser', { os: 'web' })
    browser.usePreferences.setState({ cloudSyncEntitled: false })
    expect(browser.iCloudSync.canSync()).toBe(false)
    browser.usePreferences.setState({ cloudSyncEntitled: true })
    browser.useUpdateRequired.setState({
      required: {
        source: 'config',
        currentVersion: '1.0.0',
        minVersion: '99.0.0',
      },
    })
    expect(browser.iCloudSync.canSync()).toBe(false)
    browser.useUpdateRequired.setState({ required: null })
    expect(browser.iCloudSync.canSync()).toBe(true)
  })

  it('shows a phone’s data and claim, and sends its own edits and claim back', async () => {
    const phone = await device('phone', { os: 'ios' })
    phone.claims.setOwnAccountClaim(phoneClaim)
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    expect(await phone.iCloudSync.push('manual')).toBe(true)

    const browser = await device('browser', { os: 'web', option: 'off' })
    expect(await browser.iCloudSync.resolveInitialEnable()).toMatchObject({
      outcome: 'pull',
    })
    expect(await browser.iCloudSync.pullAndMerge('manual')).toBe(false)
    browser.usePreferences.setState({ iCloudSyncEnabled: true })
    expect(await browser.iCloudSync.pullAndMerge('manual')).toBe(true)
    expect(browser.contactNames()).toEqual(['Ada Reyes'])
    expect(browser.claims.peerAccountClaims()).toEqual([phoneClaim])

    browser.claims.setOwnAccountClaim(phoneClaim)
    browser.useContacts.setState({
      contacts: [
        contact('c1', 'Ada Reyes', NOW),
        contact('c2', 'Ben Ito', NOW + 1),
      ] as never,
    })
    expect(await browser.iCloudSync.push('manual')).toBe(true)
    expect(server.slotIds('family').sort()).toEqual(
      [phone.slotId(), browser.slotId()].sort()
    )
    expect(await phone.iCloudSync.pullAndMerge('manual')).toBe(true)
    expect(phone.contactNames()).toEqual(['Ada Reyes', 'Ben Ito'])
    expect(phone.claims.peerAccountClaims()).toEqual([phoneClaim])
  })

  it('moves no contact photo bytes, and keeps the photo references', async () => {
    const phone = await device('phone', { os: 'ios' })
    phone.useContacts.setState({
      contacts: [
        {
          ...contact('c1', 'Ada', NOW),
          avatar: {
            type: 'image',
            value: 'file:///test/a.jpg',
            revision: 'r1',
          },
        },
      ] as never,
    })
    await phone.iCloudSync.push('manual')
    const browser = await device('browser', { os: 'web' })
    const before = server.state.log.length
    await browser.iCloudSync.pullAndMerge('manual')
    expect(await browser.iCloudSync.push('manual')).toBe(true)
    await browser.iCloudSync.imageWorkSettled()
    expect(
      server.state.log
        .slice(before)
        .filter((op) => /photos\/(put|get|delete)/.test(op))
    ).toEqual([])
    const [ada] = browser.useContacts.getState().contacts
    expect(ada.avatar).toMatchObject({ type: 'image', revision: 'r1' })
  })

  describe('a web-only account', () => {
    it('is seeded by its first browser, whose claim becomes the account’s', async () => {
      const first = await device('first', { os: 'web', option: 'off' })
      expect(await first.iCloudSync.resolveInitialEnable()).toEqual({
        outcome: 'seed',
      })
      first.claims.setOwnAccountClaim(webClaim)
      first.useContacts.setState({
        contacts: [contact('c1', 'Ada', NOW)] as never,
      })
      await first.iCloudSync.applySeedEnable('supporter_default')
      expect(server.slotIds('family')).toEqual([first.slotId()])

      const second = await device('second', { os: 'web', option: 'off' })
      const decision = await second.iCloudSync.resolveInitialEnable()
      expect(decision.outcome).toBe('pull')
      if (decision.outcome !== 'pull') return
      second.iCloudSync.applyPullEnable(decision.remote, 'supporter_default')
      expect(second.contactNames()).toEqual(['Ada'])
      await second.iCloudSync.pullAndMerge('manual')
      expect(second.claims.peerAccountClaims()).toEqual([webClaim])
    })
  })

  it('merges, keeping both sides, when the browser and the account both have records', async () => {
    const phone = await device('phone', { os: 'ios' })
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await phone.iCloudSync.push('manual')
    const browser = await device('browser', { os: 'web', option: 'off' })
    browser.useContacts.setState({
      contacts: [contact('c2', 'Ben', NOW)] as never,
    })
    const decision = await browser.iCloudSync.resolveInitialEnable()
    expect(decision.outcome).toBe('conflict')
    if (decision.outcome !== 'conflict') return
    await browser.iCloudSync.applyMergeEnable(
      decision.remote,
      'supporter_default'
    )
    expect(browser.usePreferences.getState().iCloudSyncEnabled).toBe(true)
    expect(browser.contactNames()).toEqual(['Ada', 'Ben'])
    await phone.iCloudSync.pullAndMerge('manual')
    expect(phone.contactNames()).toEqual(['Ada', 'Ben'])
  })

  it('keeps the account’s preferences and profile when it merges records', async () => {
    const phone = await device('phone', { os: 'ios' })
    phone.usePreferences.getState().setRole('regularPioneer')
    phone.useProfile.getState().setName('Sam Rivera')
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await phone.iCloudSync.push('manual')
    await new Promise((resolve) => setTimeout(resolve, 5))

    const browser = await device('browser', { os: 'web', option: 'off' })
    browser.usePreferences.getState().setRole('regularAuxiliary')
    browser.useProfile.getState().setName('New User')
    browser.useContacts.setState({
      contacts: [contact('c2', 'Ben', NOW)] as never,
    })
    const decision = await browser.iCloudSync.resolveInitialEnable()
    expect(decision.outcome).toBe('conflict')
    if (decision.outcome !== 'conflict') return
    await browser.iCloudSync.applyMergeEnable(
      decision.remote,
      'supporter_default',
      { keepRemoteSettings: true }
    )

    expect(browser.contactNames()).toEqual(['Ada', 'Ben'])
    expect(browser.usePreferences.getState().role).toBe('regularPioneer')
    expect(browser.useProfile.getState().name).toBe('Sam Rivera')
    await phone.iCloudSync.pullAndMerge('manual')
    expect(phone.contactNames()).toEqual(['Ada', 'Ben'])
    expect(phone.usePreferences.getState().role).toBe('regularPioneer')
    expect(phone.useProfile.getState().name).toBe('Sam Rivera')
  })

  it('keeps its own photos when a phone edits their records', async () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ'
    const browser = await device('browser', { os: 'web' })
    browser.useContacts.setState({
      contacts: [
        {
          ...contact('c1', 'Ada', NOW),
          avatar: { type: 'image', value: dataUrl, revision: 'r1' },
        },
      ] as never,
    })
    browser.useProfile.setState({
      name: 'Sam',
      avatar: { type: 'image', value: dataUrl, revision: 'p1' },
      profileUpdatedAt: { name: NOW, avatar: NOW },
    })
    expect(await browser.iCloudSync.push('manual')).toBe(true)

    const phone = await device('phone', { os: 'ios' })
    await phone.iCloudSync.pullAndMerge('manual')
    const [ada] = phone.useContacts.getState().contacts
    expect(ada.avatar).toEqual({ type: 'none', value: '' })
    phone.useContacts.setState({
      contacts: [{ ...ada, name: 'Ada Reyes', updatedAt: NOW + 1_000 }],
    })
    phone.useProfile.setState({
      name: 'Sam Rivera',
      profileUpdatedAt: { name: NOW + 1_000, avatar: NOW + 1_000 },
    })
    expect(await phone.iCloudSync.push('manual')).toBe(true)

    await browser.iCloudSync.pullAndMerge('manual')
    expect(browser.contactNames()).toEqual(['Ada Reyes'])
    expect(browser.useContacts.getState().contacts[0].avatar).toEqual({
      type: 'image',
      value: dataUrl,
      revision: 'r1',
    })
    expect(browser.useProfile.getState().name).toBe('Sam Rivera')
    expect(browser.useProfile.getState().avatar).toEqual({
      type: 'image',
      value: dataUrl,
      revision: 'p1',
    })
  })

  describe('old browser slots', () => {
    const signedOutBrowser = async (label: string, name: string) => {
      server.state.platform = 'web'
      const old = await device(label, { os: 'web' })
      old.useContacts.setState({
        contacts: [contact(`${label}-c`, name, NOW)] as never,
      })
      expect(await old.iCloudSync.push('manual')).toBe(true)
      server.state.platform = 'ios'
      server.endSlotSession('family', old.slotId())
      return old.slotId()
    }

    const accountWithOldSlots = async () => {
      const phone = await device('phone', { os: 'ios' })
      phone.useContacts.setState({
        contacts: [contact('p-c', 'Ada', NOW)] as never,
      })
      expect(await phone.iCloudSync.push('manual')).toBe(true)

      const gonePhone = await device('gone-phone', { os: 'ios' })
      expect(await gonePhone.iCloudSync.push('manual')).toBe(true)
      server.endSlotSession('family', gonePhone.slotId())

      server.state.platform = 'web'
      const open = await device('open-browser', { os: 'web' })
      expect(await open.iCloudSync.push('manual')).toBe(true)
      server.state.platform = 'ios'
      const ended = [
        await signedOutBrowser('old-1', 'Ben'),
        await signedOutBrowser('old-2', 'Cy'),
      ]
      return {
        ended,
        kept: [phone.slotId(), gonePhone.slotId(), open.slotId()],
      }
    }

    const newBrowser = async () => {
      server.state.platform = 'web'
      const browser = await device('new-browser', { os: 'web' })
      return browser
    }

    it('removes signed-out browsers’ slots once its own holds their data', async () => {
      const { ended, kept } = await accountWithOldSlots()
      const browser = await newBrowser()
      await browser.iCloudSync.pullAndMerge('manual')
      expect(browser.contactNames()).toEqual(['Ada', 'Ben', 'Cy'])
      expect(server.state.deletedSlots).toEqual([])
      expect(await browser.iCloudSync.push('manual')).toBe(true)

      await vi.waitFor(() =>
        expect([...server.state.deletedSlots].sort()).toEqual([...ended].sort())
      )
      expect(server.slotIds('family')).toEqual(
        [...kept, browser.slotId()].sort()
      )

      const reader = await device('reader', { os: 'web' })
      await reader.iCloudSync.pullAndMerge('manual')
      expect(reader.contactNames()).toEqual(['Ada', 'Ben', 'Cy'])
    })

    it('removes nothing when its push failed, until one succeeds', async () => {
      const { ended } = await accountWithOldSlots()
      const browser = await newBrowser()
      await browser.iCloudSync.pullAndMerge('manual')
      server.state.failPuts = true
      expect(await browser.iCloudSync.push('manual')).toBe(false)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(server.state.deletedSlots).toEqual([])

      server.state.failPuts = false
      browser.iCloudSync.resetPushBackoff()
      expect(await browser.iCloudSync.push('manual')).toBe(true)
      await vi.waitFor(() =>
        expect([...server.state.deletedSlots].sort()).toEqual([...ended].sort())
      )
    })

    it('removes nothing after a pull that couldn’t open every slot', async () => {
      const { ended } = await accountWithOldSlots()
      server.damageSlot('family', ended[0])
      const browser = await newBrowser()
      await browser.iCloudSync.pullAndMerge('manual')
      expect(browser.pullSettled.completedPullThisLaunch()).toBe(false)
      expect(await browser.iCloudSync.push('manual')).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(server.state.deletedSlots).toEqual([])
    })

    it('keeps a slot written after the pull it merged', async () => {
      await accountWithOldSlots()
      const browser = await newBrowser()
      await browser.iCloudSync.pullAndMerge('manual')
      const late = await signedOutBrowser('old-3', 'Dee')
      server.state.platform = 'web'
      expect(await browser.iCloudSync.push('manual')).toBe(true)
      await vi.waitFor(() => expect(server.state.deletedSlots).toHaveLength(2))
      expect(server.slotIds('family')).toContain(late)
    })

    it('keeps a slot whose records it couldn’t all read', async () => {
      const { ended } = await accountWithOldSlots()

      server.state.platform = 'web'
      const old = await device('old-3', { os: 'web' })
      old.useContacts.setState({
        contacts: [contact('old-3-c', 'Dee', NOW)] as never,
      })
      expect(await old.iCloudSync.push('manual')).toBe(true)
      const filename = filenameOf(old.slotId())
      const { files } = await old.cloudTransport.readFiles(
        (name) => name === filename
      )
      const payload = JSON.parse(files[0].json)
      payload.conversationStore.conversations.push({ id: 'v-unreadable' })
      await old.cloudTransport.write(filename, JSON.stringify(payload))
      server.state.platform = 'ios'
      server.endSlotSession('family', old.slotId())

      const browser = await newBrowser()
      await browser.iCloudSync.pullAndMerge('manual')
      expect(browser.contactNames()).toEqual(['Ada', 'Ben', 'Cy', 'Dee'])
      expect(await browser.iCloudSync.push('manual')).toBe(true)
      await vi.waitFor(() =>
        expect([...server.state.deletedSlots].sort()).toEqual([...ended].sort())
      )

      expect(server.slotIds('family')).toContain(old.slotId())
    })

    it('goes on past a slot it can’t open, and leaves it alone', async () => {
      const { ended } = await accountWithOldSlots()
      server.damageSlot('family', ended[0])
      const browser = await newBrowser()
      browser.usePreferences.setState({ iCloudSyncEnabled: false })
      const decision = await browser.iCloudSync.resolveInitialEnable()
      expect(decision).toMatchObject({
        outcome: 'incomplete',
        reason: 'invalid-file',
      })
      if (decision.outcome !== 'incomplete' || !decision.remote)
        throw new Error('expected the readable rest of the account')

      await expect(
        browser.iCloudSync.applyMergeEnable(
          decision.remote,
          'supporter_default',
          { keepRemoteSettings: true }
        )
      ).rejects.toThrow()
      expect(browser.contactNames()).toEqual(['Ada', 'Cy'])
      expect(await browser.iCloudSync.push('manual')).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(server.state.deletedSlots).toEqual([])
      expect(server.slotIds('family')).toContain(ended[0])
    })

    it('removes nothing where the server doesn’t say a session ended', async () => {
      await accountWithOldSlots()
      server.state.listOmitsLive = true
      const browser = await newBrowser()
      await browser.iCloudSync.pullAndMerge('manual')
      expect(await browser.iCloudSync.push('manual')).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(server.state.deletedSlots).toEqual([])
    })

    it('leaves a phone’s old slots alone', async () => {
      await accountWithOldSlots()
      const phone = await device('another-phone', { os: 'ios' })
      await phone.iCloudSync.pullAndMerge('manual')
      expect(await phone.iCloudSync.push('manual')).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(server.state.deletedSlots).toEqual([])
    })
  })

  it('waits only as long as the server asks before its last push', async () => {
    const browser = await device('browser', { os: 'web' })
    server.state.slotPutIntervalMs = 1_000
    expect(await browser.iCloudSync.push('manual')).toBe(true)
    browser.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    browser.usePreferences.setState({ iCloudSyncPendingPush: true })
    const started = Date.now()
    await browser.iCloudSync.flushPendingPush('sign-out')
    expect(browser.usePreferences.getState().iCloudSyncPendingPush).toBe(false)

    expect(Date.now() - started).toBeLessThan(2_000)
    server.state.slotPutIntervalMs = 0
  })

  it('doesn’t wait past its budget when the server asks for longer', async () => {
    const browser = await device('browser', { os: 'web' })
    server.state.slotPutIntervalMs = 30_000
    expect(await browser.iCloudSync.push('manual')).toBe(true)
    browser.usePreferences.setState({ iCloudSyncPendingPush: true })
    const started = Date.now()
    await browser.iCloudSync.flushPendingPush('sign-out')
    expect(Date.now() - started).toBeLessThan(500)
    expect(browser.usePreferences.getState().iCloudSyncPendingPush).toBe(true)
    server.state.slotPutIntervalMs = 0
  })

  it('sends an edit made while a push was going out, before signing out', async () => {
    const browser = await device('browser', { os: 'web' })
    const uninstall = browser.installiCloudSync()
    try {
      await browser.iCloudSync.waitForSyncIdle()
      browser.useContacts.setState({
        contacts: [contact('c1', 'Ada', NOW)] as never,
      })
      server.state.putDelayMs = 200
      const puts = () =>
        server.state.log.filter((op) => op === 'POST sync/put').length
      const before = puts()
      void browser.iCloudSync.push('manual')
      await vi.waitFor(() => expect(puts()).toBe(before + 1))

      browser.useContacts.setState({
        contacts: [
          contact('c1', 'Ada', NOW),
          contact('c2', 'Ben', NOW + 1),
        ] as never,
      })
      await browser.iCloudSync.flushPendingPush('sign-out')
      expect(browser.usePreferences.getState().iCloudSyncPendingPush).toBe(
        false
      )
    } finally {
      uninstall()
    }
    server.state.putDelayMs = 0
    const reader = await device('reader', { os: 'web' })
    await reader.iCloudSync.pullAndMerge('manual')
    expect(reader.contactNames()).toEqual(['Ada', 'Ben'])
  })

  it('waits out the slot’s put limit to send its last edit before signing out', async () => {
    const browser = await device('browser', { os: 'web' })
    server.state.slotPutIntervalMs = 1_000
    expect(await browser.iCloudSync.push('manual')).toBe(true)
    browser.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    browser.usePreferences.setState({ iCloudSyncPendingPush: true })
    await browser.iCloudSync.flushPendingPush('sign-out')
    expect(browser.usePreferences.getState().iCloudSyncPendingPush).toBe(false)
    server.state.slotPutIntervalMs = 0
    const reader = await device('reader', { os: 'web' })
    await reader.iCloudSync.pullAndMerge('manual')
    expect(reader.contactNames()).toEqual(['Ada'])
  })

  it('never leaves Cloud Sync, which would delete its slot', async () => {
    const browser = await device('browser', { os: 'web' })
    await sync(browser)
    for (const to of ['off', 'platform'] as const)
      expect(await browser.switchSyncOption(to, 'settings')).toMatchObject({
        outcome: 'failed',
      })
    expect(browser.currentSyncOption()).toBe('cloud')
    expect(server.slotIds('family')).toEqual([browser.slotId()])
  })

  it('never rebuilds the account’s data from what it holds', async () => {
    const phone = await device('phone', { os: 'ios' })
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    expect(await phone.iCloudSync.push('manual')).toBe(true)
    const browser = await device('browser', { os: 'web' })
    expect(await browser.iCloudSync.push('manual')).toBe(true)
    const epoch = browser.usePreferences.getState().iCloudResetEpoch

    await expect(
      browser.iCloudSync.overwriteRemoteWithLocal()
    ).rejects.toThrow()
    expect(browser.usePreferences.getState().iCloudResetEpoch).toEqual(epoch)
    expect(server.state.deletedSlots).toEqual([])
    expect(server.slotIds('family')).toEqual(
      [phone.slotId(), browser.slotId()].sort()
    )
    await phone.iCloudSync.pullAndMerge('manual')
    expect(phone.contactNames()).toEqual(['Ada'])
  })

  describe('a complete pull', () => {
    it('is marked for an empty account, after the peers’ claims are set', async () => {
      const browser = await device('browser', { os: 'web' })
      browser.claims.setPeerAccountClaims([phoneClaim])
      const seen: unknown[] = []
      browser.pullSettled.onCompletedPull(() =>
        seen.push(browser.claims.peerAccountClaims())
      )
      await browser.iCloudSync.pullAndMerge('manual')
      expect(browser.pullSettled.completedPullThisLaunch()).toBe(true)
      expect(seen).toEqual([[]])
    })

    it('is marked when the only slot is this browser’s own', async () => {
      const browser = await device('browser', { os: 'web' })
      await browser.iCloudSync.push('manual')
      expect(server.slotIds('family')).toEqual([browser.slotId()])
      await browser.iCloudSync.pullAndMerge('manual')
      expect(browser.pullSettled.completedPullThisLaunch()).toBe(true)
    })

    it('is marked once the peers’ claims are in', async () => {
      const phone = await device('phone', { os: 'ios' })
      phone.claims.setOwnAccountClaim(phoneClaim)
      await phone.iCloudSync.push('manual')
      const browser = await device('browser', { os: 'web' })
      const seen: unknown[] = []
      browser.pullSettled.onCompletedPull(() =>
        seen.push(browser.claims.peerAccountClaims())
      )
      await browser.iCloudSync.pullAndMerge('manual')
      expect(seen).toEqual([[phoneClaim]])
    })

    it('is not marked when the listing can’t be read', async () => {
      const browser = await device('browser', { os: 'web' })
      server.state.enabled = false
      await browser.iCloudSync.pullAndMerge('manual')
      expect(browser.pullSettled.completedPullThisLaunch()).toBe(false)
    })

    it('is not marked while another device’s slot can’t be opened', async () => {
      const phone = await device('phone', { os: 'ios' })
      await phone.cloudTransport.write(
        filenameOf('0f0e0d0c-0b0a-4908-8706-050403020100'),
        JSON.stringify({ unreadable: true })
      )
      const browser = await device('browser', { os: 'web' })
      await browser.iCloudSync.pullAndMerge('manual')
      expect(browser.pullSettled.completedPullThisLaunch()).toBe(false)
    })

    it('is not marked on iCloud or Google Drive', async () => {
      const pixel = await device('pixel', { os: 'android', option: 'platform' })
      await pixel.iCloudSync.pullAndMerge('manual')
      expect(pixel.pullSettled.completedPullThisLaunch()).toBe(false)
    })

    it('doesn’t count a pull that started before the account changed', async () => {
      const browser = await device('browser', { os: 'web' })
      server.state.putDelayMs = 0
      const pulled = browser.iCloudSync.pullAndMerge('manual')
      browser.pullSettled.resetCompletePull()
      await pulled
      expect(browser.pullSettled.completedPullThisLaunch()).toBe(false)
      await browser.iCloudSync.pullAndMerge('manual')
      expect(browser.pullSettled.completedPullThisLaunch()).toBe(true)
    })

    it('doesn’t hand over the claims of a pull from before the account changed', async () => {
      const phone = await device('phone', { os: 'ios' })
      phone.claims.setOwnAccountClaim(phoneClaim)
      await phone.iCloudSync.push('manual')
      const browser = await device('browser', { os: 'web' })
      const pulled = browser.iCloudSync.pullAndMerge('manual')
      browser.pullSettled.resetCompletePull()
      await pulled
      expect(browser.claims.peerAccountClaims()).toEqual([])
      await browser.iCloudSync.pullAndMerge('manual')
      expect(browser.claims.peerAccountClaims()).toEqual([phoneClaim])
    })
  })
})

describe('requests at launch', () => {
  const relaunch = async (os: 'ios' | 'web') => {
    const before = await device('returning', { os })
    expect(await before.iCloudSync.push('manual')).toBe(true)
    const slotId = before.slotId()
    const launched = await device('returning', { os })
    launched.usePreferences.setState({ iCloudDeviceId: slotId })
    server.state.log.length = 0
    return launched
  }
  const sync = () =>
    server.state.log.filter((op) => !op.includes('sync/photos'))

  const launch = async (
    launched: Device,
    afterwards: () => Promise<void> = async () => {}
  ) => {
    const uninstall = launched.installiCloudSync()
    try {
      launched.cloudTransport.notifyAvailabilityChange()
      await new Promise((resolve) => setTimeout(resolve, 5))
      launched.cloudTransport.notifyAvailabilityChange()
      await launched.iCloudSync.waitForSyncIdle()
      await new Promise((resolve) => setTimeout(resolve, 50))
      await launched.iCloudSync.waitForSyncIdle()
      await afterwards()
    } finally {
      uninstall()
    }
  }

  it('lists once and uploads once on a phone, without reading its own slot', async () => {
    const phone = await relaunch('ios')
    await launch(phone)
    expect(sync()).toEqual(['POST sync/list', 'POST sync/put'])
  })

  it('lists once more on the web, to remove signed-out browsers’ slots', async () => {
    const browser = await relaunch('web')
    await launch(browser)
    expect(sync()).toEqual([
      'POST sync/list',
      'POST sync/put',
      'POST sync/list',
    ])
  })

  it('downloads another device’s slot once', async () => {
    const tablet = await device('tablet', { os: 'ios' })
    tablet.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    expect(await tablet.iCloudSync.push('manual')).toBe(true)
    const phone = await relaunch('ios')
    await launch(phone)
    expect(sync()).toEqual(['POST sync/list', 'POST sync/get', 'POST sync/put'])
    expect(phone.contactNames()).toEqual(['Ada Reyes'])
  })

  describe('on a later launch', () => {
    const dataOf = (state: object) =>
      Object.fromEntries(
        Object.entries(state).filter(([, value]) => typeof value !== 'function')
      )
    const reopen = async (d: Device, option: Option = 'cloud') => {
      const saved = {
        preferences: dataOf(d.usePreferences.getState()),
        contacts: dataOf(d.useContacts.getState()),
        profile: dataOf(d.useProfile.getState()),
        mileage: dataOf(d.useMileage.getState()),
      }
      const reborn = await device(d.name, {
        os: d.os,
        account: d.account,
        option,
      })
      reborn.usePreferences.setState(saved.preferences)
      reborn.useContacts.setState(saved.contacts)
      reborn.useProfile.setState(saved.profile)
      reborn.useMileage.setState(saved.mileage)
      server.state.log.length = 0
      return reborn
    }
    const launched = async () => {
      const phone = await relaunch('ios')
      phone.useContacts.setState({
        contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
      })
      await launch(phone)
      expect(sync()).toEqual(['POST sync/list', 'POST sync/put'])
      return phone
    }

    it('uploads nothing when nothing changed', async () => {
      const phone = await reopen(await launched())
      phone.usePreferences.setState({
        lastiCloudSyncAt: 1,
        lastiCloudPushedAt: 1,
        lastiCloudUploadedAt: 1,
      })
      await launch(phone)
      expect(sync()).toEqual(['POST sync/list'])
      expect(phone.usePreferences.getState()).toMatchObject({
        iCloudSyncPendingPush: false,
        iCloudSyncIssue: null,
      })
      const { lastiCloudSyncAt, lastiCloudPushedAt, lastiCloudUploadedAt } =
        phone.usePreferences.getState()
      expect(lastiCloudSyncAt).toBeGreaterThan(1)
      expect(lastiCloudPushedAt).toBeGreaterThan(1)
      expect(lastiCloudUploadedAt).toBeGreaterThan(1)

      await phone.iCloudSync.catchUp('foreground')
      expect(sync()).toEqual(['POST sync/list', 'POST sync/list'])
    })

    it('downloads nothing when no other device changed either', async () => {
      const before = await launched()
      const tablet = await device('tablet', { os: 'ios' })
      tablet.useContacts.setState({
        contacts: [contact('c2', 'Ben Ortiz', NOW)] as never,
      })
      expect(await tablet.iCloudSync.push('manual')).toBe(true)
      const first = await reopen(before)
      await launch(first)
      expect(sync()).toEqual([
        'POST sync/list',
        'POST sync/get',
        'POST sync/put',
      ])
      expect(first.contactNames()).toEqual(['Ada Reyes', 'Ben Ortiz'])

      const phone = await reopen(first)
      await launch(phone)
      expect(sync()).toEqual(['POST sync/list'])
      expect(phone.contactNames()).toEqual(['Ada Reyes', 'Ben Ortiz'])
    })

    it('uploads what changed while the app was closed', async () => {
      const phone = await reopen(await launched())
      phone.useContacts.setState({
        contacts: [contact('c1', 'Ada R.', NOW + 1_000)] as never,
      })
      await launch(phone)
      expect(sync()).toEqual(['POST sync/list', 'POST sync/put'])

      const again = await reopen(phone)
      await launch(again)
      expect(sync()).toEqual(['POST sync/list'])
    })

    it('uploads again when its slot is no longer the one it wrote', async () => {
      const before = await launched()
      const tablet = await device('tablet', { os: 'ios' })
      await tablet.cloudTransport.write(filenameOf(before.slotId()), '{}')
      const phone = await reopen(before)
      await launch(phone)
      expect(sync()).toEqual(['POST sync/list', 'POST sync/put'])
    })

    it('leaves Google Drive alone too when nothing changed', async () => {
      const written = () =>
        drive.files('family').map((file) => [file.name, file.modifiedAt])
      const first = await device('phone', { os: 'android', option: 'platform' })
      first.useContacts.setState({
        contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
      })
      await first.iCloudSync.catchUp('launch')
      const before = written()
      expect(before).toHaveLength(1)

      const phone = await reopen(first, 'platform')
      await phone.iCloudSync.catchUp('launch')
      expect(written()).toEqual(before)

      const edited = await reopen(phone, 'platform')
      edited.useContacts.setState({
        contacts: [contact('c1', 'Ada R.', NOW + 1_000)] as never,
      })
      await edited.iCloudSync.catchUp('launch')
      expect(written()).not.toEqual(before)
    })

    const puts = () => sync().filter((op) => op === 'POST sync/put').length
    const unchanged = { ifChanged: true }

    it('uploads nothing for an edit that changed nothing it sends', async () => {
      const phone = await reopen(await launched())
      await launch(phone)
      phone.usePreferences.setState({ iCloudSyncPendingPush: true })
      expect(await phone.iCloudSync.push('store-change', unchanged)).toBe(true)
      expect(puts()).toBe(0)
      expect(phone.usePreferences.getState().iCloudSyncPendingPush).toBe(false)

      phone.useContacts.setState({
        contacts: [contact('c1', 'Ada R.', NOW + 1_000)] as never,
      })
      expect(await phone.iCloudSync.push('store-change', unchanged)).toBe(true)
      expect(puts()).toBe(1)
      expect(await phone.iCloudSync.push('store-change', unchanged)).toBe(true)
      expect(puts()).toBe(1)
    })

    it('still uploads when asked to outright', async () => {
      const phone = await reopen(await launched())
      await launch(phone)
      expect(await phone.iCloudSync.push('manual')).toBe(true)
      expect(puts()).toBe(1)
      await phone.republishSnapshot('account_request')
      expect(puts()).toBe(2)
    })

    it('uploads for a push that must write, even behind one that needn’t', async () => {
      const phone = await reopen(await launched())
      await launch(phone)
      const [skipped, written] = await Promise.all([
        phone.iCloudSync.push('store-change', unchanged),
        phone.iCloudSync.push('key-change'),
      ])
      expect([skipped, written]).toEqual([true, true])
      expect(puts()).toBe(1)
    })

    it('uploads after a push that failed, whatever the slot looked like before', async () => {
      const phone = await reopen(await launched())
      await launch(phone)
      server.state.failPuts = true
      expect(await phone.iCloudSync.push('manual')).toBe(false)
      server.state.failPuts = false
      const before = puts()
      expect(await phone.iCloudSync.push('store-change', unchanged)).toBe(true)
      expect(puts()).toBe(before + 1)
    })

    it('waits for the Supporter claim instead of uploading without it', async () => {
      const claim = { appUserId: 'rc-phone', entitled: true, claimedAt: 5 }
      const before = await launched()
      before.claims.setOwnAccountClaim(claim)
      expect(await before.iCloudSync.push('manual')).toBe(true)

      const phone = await reopen(before)
      await launch(phone, async () => {
        expect(puts()).toBe(0)

        phone.claims.setOwnAccountClaim(claim)
        expect(phone.usePreferences.getState().iCloudSyncPendingPush).toBe(true)
        expect(await phone.iCloudSync.push('store-change', unchanged)).toBe(
          true
        )
        expect(puts()).toBe(0)

        phone.claims.setOwnAccountClaim(null)
        expect(await phone.iCloudSync.push('store-change', unchanged)).toBe(
          true
        )
        expect(puts()).toBe(1)
      })
    })

    it('uploads again once its slot is a day old', async () => {
      const before = await launched()
      const realNow = Date.now
      const later = vi
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow() + 25 * 60 * 60_000)
      try {
        const phone = await reopen(before)
        await launch(phone)
        expect(sync()).toEqual(['POST sync/list', 'POST sync/put'])

        const again = await reopen(phone)
        await launch(again)
        expect(sync()).toEqual(['POST sync/list'])
      } finally {
        later.mockRestore()
      }
    })

    it('uploads again under a new device id', async () => {
      const phone = await reopen(await launched())
      phone.usePreferences.setState({
        iCloudPublished: {
          ...phone.usePreferences.getState().iCloudPublished!,
          deviceId: 'another-device',
        },
      })
      await launch(phone)
      expect(sync()).toEqual(['POST sync/list', 'POST sync/put'])
    })
  })

  it('still notices that its own slot is gone and uploads it again', async () => {
    const phone = await relaunch('ios')
    await phone.iCloudSync.pullAndMerge('manual')
    expect(await phone.iCloudSync.push('manual')).toBe(true)
    await phone.cloudTransport.deleteFile(filenameOf(phone.slotId()))
    expect(server.slotIds('family')).toEqual([])
    server.state.log.length = 0
    await phone.iCloudSync.pullAndMerge('manual')
    expect(sync()).toEqual(['POST sync/list'])
    const uninstall = phone.installiCloudSync()
    try {
      await vi.waitFor(() =>
        expect(server.slotIds('family')).toEqual([phone.slotId()])
      )
    } finally {
      uninstall()
    }
  })
})

const filenameOf = (slotId: string) => `witness-work-${slotId}.json`
