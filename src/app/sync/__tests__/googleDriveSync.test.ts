import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeGoogleDrive,
  memoryTransfer,
} from '@/lib/syncTransport/googleDrive/__tests__/driveTestKit'
import {
  type BackupPlaintext,
  deriveBackupKey,
  openBackup,
  sealBackup,
} from '@/lib/serverAccount/backupCrypto'

// Android sync end to end: the real engine on the real Google Drive transport,
// with two or three "devices" (each a fresh module graph with its own stores)
// sharing one in-memory Google Drive. Covers data moving between devices,
// conflict merges, opting out, a Supporter lapse, restoring a fresh install,
// photos, storage running out, a reset, and switching Google Accounts.

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
// Never reached on Android; mocked so the native module isn't loaded.
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
const visit = (id: string, contactId: string, updatedAt: number) => ({
  id,
  contact: { id: contactId },
  date: '2026-09-15T12:00:00.000Z',
  isBibleStudy: false,
  updatedAt,
})

let drive = createFakeGoogleDrive()
let listingClock = 0

/**
 * Boots one device: its own engine, stores and Drive transport, signed in to
 * `account`'s Drive. Earlier devices keep running on their own instances.
 */
async function device(
  name: string,
  {
    account = 'family',
    enabled = true,
    supporter = true,
  }: { account?: string; enabled?: boolean; supporter?: boolean } = {}
) {
  vi.resetModules()
  // Registered per device, so each module graph gets its own name, install
  // id and files (`vi.mock` factories run once per test file).
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
  const backupData = await import('@/app/account/backupData')
  const householder = await import('@/stores/householderData')
  const { registerAndroidSyncTransport, usesGoogleDriveSync } = await import(
    '@/lib/syncTransport'
  )
  const { createGoogleDriveTransport } = await import(
    '@/lib/syncTransport/googleDrive/googleDriveTransport'
  )
  const { createDriveApi } = await import(
    '@/lib/syncTransport/googleDrive/driveApi'
  )
  const auth = await import('@/lib/syncTransport/googleDrive/googleDriveAuth')
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  const { usePreferences } = await import('@/stores/preferences')
  const { default: useContacts } = await import('@/stores/contactsStore')
  const { default: useConversations } = await import(
    '@/stores/conversationStore'
  )
  // The production transport wiring, with the dev fake in place of
  // Google's consent screen and photo transfers kept in memory.
  const transport = createGoogleDriveTransport({
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
    // Devices here act within the same millisecond; real ones are seconds
    // apart, past the window in which a listing is reused.
    now: () => (listingClock += 60_000),
  })
  registerAndroidSyncTransport(transport)
  /** Connects `next`'s Google Drive, as Settings does. */
  const connect = async (next: string, selectAccount = false) => {
    auth.setFakeGoogleDrive({ origin: drive.origin, account: next })
    expect(await auth.connectGoogleDrive({ selectAccount })).toBe('connected')
  }
  await connect(account)
  usePreferences.setState({
    iCloudSyncEnabled: enabled,
    hasMigratedToSyncSchema: true,
    hasReconciledSyncDefinitions: true,
  })
  useSupporter.getState().setSupporter(supporter)
  return {
    ...sync,
    backupData,
    householder,
    name,
    files,
    usesGoogleDriveSync,
    transport,
    usePreferences,
    useSupporter,
    useContacts,
    useConversations,
    /** Connects another Google Account, as Settings → Switch would. */
    switchAccount: (next: string) => connect(next, true),
    contactNames: () =>
      useContacts
        .getState()
        .contacts.map((c) => c.name)
        .sort(),
  }
}

const sync = async (...devices: Array<Awaited<ReturnType<typeof device>>>) => {
  for (const d of devices) {
    await d.iCloudSync.pullAndMerge('manual')
    expect(await d.iCloudSync.push('manual')).toBe(true)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  drive = createFakeGoogleDrive()
  // The dev fake stands in for Google's consent screen and token service.
  vi.stubGlobal('__DEV__', true)
  vi.stubGlobal('fetch', drive.fetch)
  runtime.files = {}
  runtime.appState = 'active'
})

describe('Google Drive sync between Android devices', () => {
  it('uses the Drive transport and Google Drive copy', async () => {
    const phone = await device('phone')
    expect(phone.usesGoogleDriveSync()).toBe(true)
    expect(phone.iCloudSync.canSync()).toBe(true)
  })

  it('brings data created on one device to another', async () => {
    const phone = await device('phone')
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    expect(await phone.iCloudSync.push('manual')).toBe(true)
    expect(drive.files('family').map((f) => f.name)).toEqual([
      expect.stringMatching(/^witness-work-.+\.json$/),
    ])

    const tablet = await device('tablet')
    expect(await tablet.iCloudSync.pullAndMerge('manual')).toBe(true)
    expect(tablet.contactNames()).toEqual(['Ada Reyes'])
    expect(tablet.usePreferences.getState().lastiCloudRemoteDeviceName).toBe(
      'phone'
    )

    // Each device keeps one snapshot file; pushing again replaces it.
    await tablet.iCloudSync.push('manual')
    await tablet.iCloudSync.push('manual')
    expect(
      drive
        .files('family')
        .map((f) => f.name)
        .sort()
    ).toHaveLength(2)
    // A write lands in Drive before it resolves, so it counts as uploaded.
    expect(tablet.usePreferences.getState().lastiCloudUploadedAt).not.toBeNull()
  })

  it('records a push in one preferences write', async () => {
    const phone = await device('phone')
    expect(await phone.iCloudSync.push('manual')).toBe(true)
    const { PersistStorage } = await import('@/stores/mmkv')
    const setItem = vi.spyOn(PersistStorage, 'setItem')
    // A minute later: a push in the same millisecond as the last one has
    // nothing new to record, so it rightly writes nothing.
    const later = Date.now() + 60_000
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(later)
    try {
      phone.useContacts.setState({
        contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
      })
      expect(await phone.iCloudSync.push('manual')).toBe(true)
      // Pending flag, last push and confirmed upload together; each write
      // persists the whole store.
      expect(
        setItem.mock.calls.filter(([name]) => name === 'preferences')
      ).toHaveLength(1)
      expect(phone.usePreferences.getState()).toMatchObject({
        iCloudSyncPendingPush: false,
        iCloudUploadPendingSince: null,
        lastiCloudPushedAt: later,
        lastiCloudUploadedAt: later,
      })
    } finally {
      vi.useRealTimers()
      setItem.mockRestore()
    }
  })

  it('merges concurrent edits on both devices', async () => {
    const phone = await device('phone')
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW - 10_000)] as never,
    })
    await phone.iCloudSync.push('manual')
    const tablet = await device('tablet')
    await tablet.iCloudSync.pullAndMerge('manual')

    // Offline on both: the phone renames Ada and logs a visit; the tablet
    // later renames her again and adds another contact.
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada R.', NOW - 5_000)] as never,
    })
    phone.useConversations.setState({
      conversations: [visit('v-phone', 'c1', NOW - 5_000)] as never,
    })
    tablet.useContacts.setState({
      contacts: [
        contact('c1', 'Ada Reyes', NOW - 1_000),
        contact('c2', 'Ben Ito', NOW - 1_000),
      ] as never,
    })

    await sync(phone, tablet, phone)
    for (const d of [phone, tablet]) {
      expect(d.contactNames()).toEqual(['Ada Reyes', 'Ben Ito'])
      expect(
        d.useConversations.getState().conversations.map((v) => v.id)
      ).toEqual(['v-phone'])
    }
  })

  it('leaves a device that opted out alone', async () => {
    const phone = await device('phone')
    const tablet = await device('tablet', { enabled: false })
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await phone.iCloudSync.push('manual')

    expect(tablet.iCloudSync.canSync()).toBe(false)
    expect(await tablet.iCloudSync.pullAndMerge('manual')).toBe(false)
    expect(await tablet.iCloudSync.push('manual')).toBe(false)
    expect(tablet.contactNames()).toEqual([])
    expect(drive.files('family')).toHaveLength(1)
  })

  // Sync is free (ADR 0040 §1): a lapse changes nothing.
  it('keeps syncing when Supporter access lapses', async () => {
    const phone = await device('phone')
    const tablet = await device('tablet')
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await phone.iCloudSync.push('manual')

    tablet.useSupporter.getState().setSupporter(false)
    expect(await tablet.iCloudSync.pullAndMerge('manual')).toBe(true)
    expect(tablet.contactNames()).toEqual(['Ada'])
  })

  it('restores every device’s data onto a fresh install', async () => {
    const phone = await device('phone')
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    const tablet = await device('tablet')
    tablet.useContacts.setState({
      contacts: [contact('c2', 'Ben', NOW)] as never,
    })
    await sync(phone, tablet)

    // A new phone, not a Supporter yet: the onboarding restore.
    const fresh = await device('new-phone', {
      enabled: false,
      supporter: false,
    })
    const peek = await fresh.iCloudSync.peekRemotePayload()
    expect(peek.status).toBe('found')
    if (peek.status !== 'found') return
    fresh.iCloudSync.replaceLocalWithRemote(peek.remote)
    expect(fresh.contactNames()).toEqual(['Ada', 'Ben'])

    // A Supporter's empty install restores and turns sync on.
    const another = await device('second-tablet', { enabled: false })
    const decision = await another.iCloudSync.resolveInitialEnable()
    expect(decision.outcome).toBe('pull')
    if (decision.outcome !== 'pull') return
    another.iCloudSync.applyPullEnable(decision.remote)
    expect(another.contactNames()).toEqual(['Ada', 'Ben'])
    expect(another.usePreferences.getState().iCloudSyncEnabled).toBe(true)
  })

  it('asks before combining a device that already has records', async () => {
    const phone = await device('phone')
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await phone.iCloudSync.push('manual')
    const tablet = await device('tablet', { enabled: false })
    tablet.useContacts.setState({
      contacts: [contact('c9', 'Local only', NOW)] as never,
    })
    expect((await tablet.iCloudSync.resolveInitialEnable()).outcome).toBe(
      'conflict'
    )
  })

  it('syncs photos when both devices opt in', async () => {
    const phone = await device('phone')
    const picked = 'file:///test/Documents/contact-c1-avatar-picked-r1.jpg'
    phone.files.set(picked, new Uint8Array([7, 7, 7]))
    phone.usePreferences.setState({ iCloudSyncIncludeImages: true })
    phone.useContacts.setState({
      contacts: [
        {
          ...contact('c1', 'Ada', NOW),
          avatar: { type: 'image', value: picked, revision: 'r1' },
        },
      ] as never,
    })
    expect(await phone.iCloudSync.push('manual')).toBe(true)
    // Photos upload as their own job after the snapshot.
    await phone.iCloudSync.imagePushesSettled()
    expect(drive.files('family').map((f) => f.name)).toContain(
      'witness-work-img-contact-c1--r1.jpg'
    )

    const tablet = await device('tablet')
    tablet.usePreferences.setState({ iCloudSyncIncludeImages: true })
    await tablet.iCloudSync.pullAndMerge('manual')
    const avatar = tablet.useContacts.getState().contacts[0].avatar
    expect(avatar?.type).toBe('image')
    const local = avatar!.value.split('?')[0]
    expect(local).toBe('file:///test/Documents/contact-c1-avatar-synced-r1.jpg')
    expect([...tablet.files.get(local)!]).toEqual([7, 7, 7])
  })

  it('shows a full Google account and recovers when there is room', async () => {
    const phone = await device('phone')
    drive.setQuota('family', 10)
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    expect(await phone.iCloudSync.push('manual')).toBe(false)
    let prefs = phone.usePreferences.getState()
    expect(prefs.iCloudUploadIssue).toBe('icloud-full')
    expect(prefs.iCloudSyncPendingPush).toBe(true)
    // There's no upload to wait on, so a check can't clear the issue.
    expect(await phone.iCloudSync.checkUpload()).toBeNull()
    expect(phone.usePreferences.getState().iCloudUploadIssue).toBe(
      'icloud-full'
    )
    // A routine failure, not a crash report.
    const { errorTracking } = await import('@/lib/errorTracking')
    expect(errorTracking.captureException).not.toHaveBeenCalled()

    drive.setQuota('family', undefined)
    expect(await phone.iCloudSync.push('manual')).toBe(true)
    prefs = phone.usePreferences.getState()
    expect(prefs.iCloudUploadIssue).toBeNull()
    expect(prefs.iCloudSyncPendingPush).toBe(false)
  })

  it('carries a rebuild to the other device', async () => {
    const phone = await device('phone')
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    const tablet = await device('tablet')
    tablet.useContacts.setState({
      contacts: [contact('c2', 'Stale', NOW)] as never,
    })
    await sync(phone, tablet)

    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await phone.iCloudSync.overwriteRemoteWithLocal()
    expect(await tablet.iCloudSync.pullAndMerge('remote-change')).toBe(true)
    expect(tablet.contactNames()).toEqual(['Ada'])
    expect(
      tablet.usePreferences.getState().iCloudResetAdoptedNotice?.deviceName
    ).toBe('phone')
  })

  it('never finishes a queued write in a Google Account connected meanwhile', async () => {
    const phone = await device('phone')
    await phone.iCloudSync.push('manual')
    const name = 'witness-work-account.json'
    const first = phone.transport.write(name, '{"v":1}')
    const queued = phone.transport.write(name, '{"v":2}')
    await phone.switchAccount('someone-else')
    await first.catch(() => {})
    await expect(queued).rejects.toMatchObject({ code: 'unauthorized' })
    expect(drive.files('someone-else')).toEqual([])
  })

  it('turns sync off before touching another Google Account’s Drive', async () => {
    const phone = await device('phone')
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada', NOW)] as never,
    })
    await phone.iCloudSync.push('manual')

    await phone.switchAccount('someone-else')
    expect(phone.iCloudSync.canSync()).toBe(false)
    const prefs = phone.usePreferences.getState()
    expect(prefs.iCloudSyncEnabled).toBe(false)
    expect(prefs.iCloudAccountChangedAt).not.toBeNull()
    expect(await phone.iCloudSync.push('manual')).toBe(false)
    expect(drive.files('someone-else')).toEqual([])
    expect(phone.contactNames()).toEqual(['Ada'])
  })
})

// The account backup (ADR 0026 §4) reuses the sync payload and merge. These
// run its restore on the same engine and stores, and check that Google Drive
// sync on the restoring device carries on as before.
describe('Account backup restore', () => {
  type Device = Awaited<ReturnType<typeof device>>
  const accountId = 'A'.repeat(22)
  const backupKey = deriveBackupKey(new Uint8Array(32).fill(5))
  let slots = 0

  /** `from`'s slot as the server hands it back, opened and read on `to`. */
  const slotOf = (
    from: Device,
    to: Device,
    tweak: (plaintext: BackupPlaintext) => BackupPlaintext = (p) => p
  ) => {
    const address = { accountId, slotId: `slot-${++slots}`.padEnd(22, 'x') }
    const plaintext = tweak(
      from.backupData.buildBackupPlaintext({
        deviceName: from.name,
        platform: 'android',
        now: NOW,
      })
    )
    const blob = sealBackup(backupKey, plaintext, address, new Uint8Array(24))
    const read = to.backupData.readBackupPayload(
      openBackup(backupKey, blob, address),
      NOW
    )
    if (!read.ok) throw new Error(read.problem)
    return read.payload
  }

  it('folds slots from two devices, whatever their sync histories', async () => {
    const phone = await device('phone', { account: 'phone-drive' })
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    phone.usePreferences.setState({
      iCloudResetEpoch: { id: 'phone-reset', at: NOW, deviceId: 'phone' },
    })
    const tablet = await device('tablet', { account: 'tablet-drive' })
    tablet.useContacts.setState({
      contacts: [contact('c2', 'Ben Ito', NOW)] as never,
    })
    tablet.useConversations.setState({
      conversations: [visit('v1', 'c2', NOW)] as never,
    })
    // A backup never carries a sync reset generation…
    expect(
      phone.backupData.buildBackupPlaintext({
        deviceName: 'phone',
        platform: 'android',
        now: NOW,
      }).payload
    ).not.toHaveProperty('resetEpoch')

    const fresh = await device('new-phone', { enabled: false })
    const fromPhone = slotOf(phone, fresh, (plaintext) => ({
      ...plaintext,
      // …and one that did (an older writer) still folds with the others.
      payload: {
        ...(plaintext.payload as object),
        resetEpoch: { id: 'old', at: NOW + 5, deviceId: 'phone' },
      },
    }))
    const folded = fresh.backupData.foldBackupPayloads([
      fromPhone,
      slotOf(tablet, fresh),
    ])!
    fresh.backupData.replaceLocalWithBackup(folded)
    expect(fresh.contactNames()).toEqual(['Ada Reyes', 'Ben Ito'])
    expect(fresh.useConversations.getState().conversations).toHaveLength(1)
    expect(fresh.usePreferences.getState().iCloudResetEpoch).toBeNull()
  })

  it('Replace keeps this device’s sync history, so its next pull merges', async () => {
    const phone = await device('phone')
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW)] as never,
    })
    await phone.iCloudSync.overwriteRemoteWithLocal()
    const epoch = phone.usePreferences.getState().iCloudResetEpoch
    expect(epoch).not.toBeNull()

    const tablet = await device('tablet')
    await tablet.iCloudSync.pullAndMerge('manual')
    expect(tablet.contactNames()).toEqual(['Ada Reyes'])
    const before = tablet.usePreferences.getState()
    expect(before.iCloudResetEpoch).toEqual(epoch)

    // An iPhone that never synced with this Drive backs up Ben.
    const iphone = await device('iphone', {
      account: 'other',
      enabled: false,
    })
    iphone.useContacts.setState({
      contacts: [contact('c2', 'Ben Ito', NOW)] as never,
    })
    const folded = tablet.backupData.foldBackupPayloads([
      slotOf(iphone, tablet),
    ])!
    tablet.backupData.replaceLocalWithBackup(folded)
    expect(tablet.contactNames()).toEqual(['Ben Ito'])
    const after = tablet.usePreferences.getState()
    expect(after.iCloudResetEpoch).toEqual(epoch)
    expect(after.lastiCloudPulledAt).toBe(before.lastiCloudPulledAt)
    expect(after.lastiCloudRemoteDeviceName).toBe(
      before.lastiCloudRemoteDeviceName
    )
    // Drive sync merges rather than adopting a reset or ignoring its files.
    await tablet.iCloudSync.pullAndMerge('manual')
    expect(tablet.contactNames()).toEqual(['Ada Reyes', 'Ben Ito'])
    // Still the one reset it adopted before the restore; no new one.
    expect(tablet.usePreferences.getState().iCloudResetAdoptedNotice).toEqual(
      before.iCloudResetAdoptedNotice
    )
    expect(await tablet.iCloudSync.push('manual')).toBe(true)
    await phone.iCloudSync.pullAndMerge('manual')
    expect(phone.contactNames()).toEqual(['Ada Reyes', 'Ben Ito'])
    expect(phone.usePreferences.getState().iCloudResetEpoch).toEqual(epoch)
    expect(phone.usePreferences.getState().iCloudResetAdoptedNotice).toBeNull()
  })

  it('Combine keeps this device’s records and adds the backup’s', async () => {
    const phone = await device('phone', { enabled: false })
    phone.useContacts.setState({
      contacts: [
        contact('c1', 'Ada Reyes', NOW - 10_000),
        contact('c2', 'Ben Ito', NOW),
      ] as never,
    })
    const tablet = await device('tablet', { enabled: false })
    tablet.useContacts.setState({
      contacts: [
        contact('c1', 'Ada R.', NOW - 20_000),
        contact('c3', 'Cara Diaz', NOW),
      ] as never,
    })
    const payload = slotOf(phone, tablet)
    const preview = tablet.backupData.previewCombine([payload])
    expect(preview).toMatchObject({
      changed: true,
      before: { contacts: 2 },
      after: { contacts: 3 },
    })
    // The dry run wrote nothing.
    expect(tablet.contactNames()).toEqual(['Ada R.', 'Cara Diaz'])
    expect(tablet.backupData.combineLocalWithBackup([payload])).toBe(true)
    // Last writer wins per record, as in sync.
    expect(tablet.contactNames()).toEqual(['Ada Reyes', 'Ben Ito', 'Cara Diaz'])
    expect(tablet.backupData.combineLocalWithBackup([payload])).toBe(false)
  })

  it('carries data protection erasures, never the erased details', async () => {
    const phone = await device('phone', { enabled: false })
    phone.usePreferences.setState({ dataProtectionMode: true })
    phone.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW - 10_000)] as never,
    })
    phone.householder.deleteHouseholderContact('c1')
    const tablet = await device('tablet', { enabled: false })
    tablet.useContacts.setState({
      contacts: [contact('c1', 'Ada Reyes', NOW - 20_000)] as never,
    })
    const payload = slotOf(phone, tablet)
    expect(JSON.stringify(payload)).not.toContain('Ada Reyes')
    tablet.backupData.combineLocalWithBackup([payload])
    expect(tablet.contactNames()).toEqual([])
    expect(JSON.stringify(tablet.useContacts.getState())).not.toContain(
      'Ada Reyes'
    )
  })

  it('leaves out a payload from a newer app, and one it can’t read', async () => {
    const phone = await device('phone', { enabled: false })
    const plaintext = (payload: unknown): BackupPlaintext => ({
      v: 1,
      deviceName: 'x',
      platform: 'ios',
      createdAt: NOW,
      payload,
    })
    expect(
      phone.backupData.readBackupPayload(plaintext({ version: 99 }), NOW)
    ).toEqual({ ok: false, problem: 'newer' })
    expect(
      phone.backupData.readBackupPayload(plaintext({ version: 1 }), NOW)
    ).toEqual({ ok: false, problem: 'unreadable' })
  })
})
