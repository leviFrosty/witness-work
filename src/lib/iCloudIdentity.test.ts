import { beforeEach, describe, expect, it, vi } from 'vitest'

// Device binding and Apple Account change handling: what a copied device or a
// different Apple Account resets, and what stays as it was.

// Archived tokens look like `<account>@<encoding>`: one account's archive can
// change bytes (an iOS update) while `isEqual:` still matches it.
const runtime = vi.hoisted(() => ({
  identityToken: null as string | null,
  /** False when a stored archive can't be decoded natively. */
  comparable: true,
  installId: 'install-b' as string | Error,
}))
const accountOf = (token: string) => token.split('@')[0]

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('../../modules/icloud-bridge', () => ({
  identityToken: () => runtime.identityToken,
  identityTokenMatches: (stored: string) =>
    runtime.identityToken === null || !runtime.comparable
      ? null
      : accountOf(stored) === accountOf(runtime.identityToken),
}))
vi.mock('@/lib/installId', () => ({
  getOrCreateInstallId: () => {
    if (runtime.installId instanceof Error) throw runtime.installId
    return runtime.installId
  },
}))
vi.mock('@/lib/account', () => ({ clearAdoptedAccountId: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
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

const load = async () => {
  const identity = await import('./iCloudIdentity')
  const { usePreferences } = await import('@/stores/preferences')
  const { clearAdoptedAccountId } = await import('@/lib/account')
  const { analytics } = await import('@/lib/analytics')
  return { ...identity, usePreferences, clearAdoptedAccountId, analytics }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  runtime.identityToken = null
  runtime.comparable = true
  runtime.installId = 'install-b'
})

describe('decideIdentity', () => {
  const never = () => {
    throw new Error('compared natively')
  }

  it('decides nothing while signed out', async () => {
    const { decideIdentity } = await load()
    expect(decideIdentity('account-a', null, never)).toBe('unchanged')
    expect(decideIdentity(null, null, never)).toBe('unchanged')
  })

  it('records the first account it sees', async () => {
    const { decideIdentity } = await load()
    expect(decideIdentity(null, 'account-a', never)).toBe('record')
  })

  it('treats identical archives as the same account without comparing', async () => {
    const { decideIdentity } = await load()
    expect(decideIdentity('account-a', 'account-a', never)).toBe('unchanged')
  })

  it('reports a change only when the native comparison says so', async () => {
    const { decideIdentity } = await load()
    expect(decideIdentity('account-a', 'account-b', () => false)).toBe(
      'changed'
    )
    // The same account archived differently: remember the new bytes.
    expect(decideIdentity('account-a@1', 'account-a@2', () => true)).toBe(
      'record'
    )
    // Can't compare: remember the current account rather than guess.
    expect(decideIdentity('account-a', 'account-b', () => null)).toBe('record')
  })
})

describe('decideDeviceBinding', () => {
  it.each([
    [{ deviceId: null, binding: null, installId: 'b' }, 'create'],
    [{ deviceId: 'id', binding: null, installId: 'b' }, 'bind'],
    [{ deviceId: 'id', binding: 'b', installId: 'b' }, 'keep'],
    [{ deviceId: 'id', binding: 'a', installId: 'b' }, 'rebind'],
    // A locked Keychain can't prove the id was copied.
    [{ deviceId: 'id', binding: 'a', installId: null }, 'keep'],
  ] as const)('%o → %s', async (args, expected) => {
    const { decideDeviceBinding } = await load()
    expect(decideDeviceBinding(args)).toBe(expected)
  })
})

describe('ensureSyncDeviceId', () => {
  it('binds a new id to this device', async () => {
    const { ensureSyncDeviceId, usePreferences } = await load()

    const id = ensureSyncDeviceId()

    expect(usePreferences.getState()).toMatchObject({
      iCloudDeviceId: id,
      iCloudDeviceBinding: 'install-b',
    })
  })

  it('binds an existing install without changing its id', async () => {
    const { ensureSyncDeviceId, usePreferences } = await load()
    usePreferences.setState({
      iCloudDeviceId: 'existing',
      lastiCloudPushedAt: 5,
    })

    expect(ensureSyncDeviceId()).toBe('existing')
    expect(usePreferences.getState()).toMatchObject({
      iCloudDeviceBinding: 'install-b',
      lastiCloudPushedAt: 5,
    })
  })

  it('gives a copied device its own id and resets its sync bookkeeping', async () => {
    const { ensureSyncDeviceId, usePreferences } = await load()
    usePreferences.setState({
      iCloudSyncEnabled: true,
      iCloudDeviceId: 'original',
      iCloudDeviceBinding: 'install-a',
      iCloudIdentityToken: 'account-a',
      iCloudClockOffsetMs: 4_000,
      iCloudClockCalibrated: true,
      iCloudImageSync: {
        'witness-work-img-profile.jpg': { localMtime: 1, uploadedMtime: 1 },
      },
      iCloudSyncPendingPush: false,
      iCloudSyncIssue: 'read-failed',
      lastiCloudPushedAt: 5,
      lastiCloudPulledAt: 6,
      lastiCloudUploadedAt: 7,
      iCloudUploadPendingSince: 8,
      iCloudUploadIssue: 'icloud-full',
      lastiCloudRemoteDeviceId: 'original',
    })

    const id = ensureSyncDeviceId()

    expect(id).not.toBe('original')
    expect(usePreferences.getState()).toMatchObject({
      iCloudDeviceId: id,
      iCloudDeviceBinding: 'install-b',
      // Still the user's choice; it now syncs as a new participant.
      iCloudSyncEnabled: true,
      iCloudIdentityToken: null,
      iCloudClockOffsetMs: 0,
      iCloudClockCalibrated: false,
      iCloudImageSync: {},
      iCloudSyncPendingPush: true,
      iCloudSyncIssue: null,
      lastiCloudPushedAt: null,
      lastiCloudPulledAt: null,
      // The original device's upload confirmation isn't this one's.
      lastiCloudUploadedAt: null,
      iCloudUploadPendingSince: null,
      iCloudUploadIssue: null,
      lastiCloudRemoteDeviceId: null,
    })
    // Settled: the next call keeps the new id.
    expect(ensureSyncDeviceId()).toBe(id)
  })

  it('keeps the id when the Keychain cannot be read', async () => {
    runtime.installId = new Error('locked')
    const { ensureSyncDeviceId, usePreferences } = await load()
    usePreferences.setState({
      iCloudDeviceId: 'original',
      iCloudDeviceBinding: 'install-a',
      lastiCloudPushedAt: 5,
    })

    expect(ensureSyncDeviceId()).toBe('original')
    expect(usePreferences.getState().lastiCloudPushedAt).toBe(5)
  })

  it('does not create an id for an install that never synced', async () => {
    const { checkDeviceBinding, usePreferences } = await load()

    checkDeviceBinding()

    expect(usePreferences.getState().iCloudDeviceId).toBeNull()
  })
})

describe('checkICloudIdentity', () => {
  const syncing = {
    iCloudSyncEnabled: true,
    iCloudSyncSetByUser: false,
    iCloudDeviceId: 'ipad',
    iCloudDeviceBinding: 'install-b',
    iCloudIdentityToken: 'account-a',
    iCloudSyncPendingPush: true,
    iCloudSyncNeedsResolution: true,
    iCloudSyncPausedForLapse: true,
    iCloudImageSync: {
      'witness-work-img-profile.jpg': { localMtime: 1, uploadedMtime: 1 },
    },
    lastiCloudPushedAt: 5,
    lastiCloudUploadedAt: 6,
    iCloudUploadPendingSince: 7,
    iCloudUploadIssue: 'icloud-full' as const,
    lastiCloudRemoteDeviceName: 'iPhone',
  }

  it('records the account on first run', async () => {
    runtime.identityToken = 'account-a'
    const { checkICloudIdentity, usePreferences } = await load()

    expect(checkICloudIdentity('launch')).toBe(true)
    expect(usePreferences.getState().iCloudIdentityToken).toBe('account-a')
  })

  it('keeps syncing when an iOS update re-encodes the same account', async () => {
    runtime.identityToken = 'account-a@ios-next'
    const { checkICloudIdentity, usePreferences, clearAdoptedAccountId } =
      await load()
    usePreferences.setState({
      ...syncing,
      iCloudIdentityToken: 'account-a@ios',
    })

    expect(checkICloudIdentity('launch')).toBe(true)
    expect(usePreferences.getState()).toMatchObject({
      iCloudSyncEnabled: true,
      iCloudIdentityToken: 'account-a@ios-next',
      iCloudAccountChangedAt: null,
    })
    expect(clearAdoptedAccountId).not.toHaveBeenCalled()
  })

  it('keeps syncing when the stored token cannot be compared', async () => {
    runtime.identityToken = 'account-b'
    runtime.comparable = false
    const { checkICloudIdentity, usePreferences, clearAdoptedAccountId } =
      await load()
    usePreferences.setState(syncing)

    expect(checkICloudIdentity('launch')).toBe(true)
    expect(usePreferences.getState()).toMatchObject({
      iCloudSyncEnabled: true,
      iCloudIdentityToken: 'account-b',
    })
    expect(clearAdoptedAccountId).not.toHaveBeenCalled()
  })

  it('leaves everything as it was while signed out', async () => {
    const { checkICloudIdentity, usePreferences, clearAdoptedAccountId } =
      await load()
    usePreferences.setState(syncing)
    const before = usePreferences.getState()

    expect(checkICloudIdentity('availability')).toBe(true)
    expect(usePreferences.getState()).toBe(before)
    expect(clearAdoptedAccountId).not.toHaveBeenCalled()
  })

  it('stops sync for a different Apple Account', async () => {
    runtime.identityToken = 'account-b'
    const {
      checkICloudIdentity,
      usePreferences,
      clearAdoptedAccountId,
      analytics,
    } = await load()
    usePreferences.setState({
      ...syncing,
      iCloudResetEpoch: { id: 'reset', at: 9, deviceId: 'iphone' },
      iCloudResetAdoptedNotice: { epochId: 'reset', deviceName: null, at: 9 },
    })

    expect(checkICloudIdentity('can_sync')).toBe(false)

    expect(usePreferences.getState()).toMatchObject({
      iCloudSyncEnabled: false,
      // Explicit, so the Supporter default can't seed the new account.
      iCloudSyncSetByUser: true,
      iCloudIdentityToken: 'account-b',
      iCloudSyncPendingPush: false,
      iCloudSyncNeedsResolution: false,
      iCloudSyncPausedForLapse: false,
      iCloudImageSync: {},
      lastiCloudPushedAt: null,
      // Uploads to the previous account's iCloud say nothing about this one.
      lastiCloudUploadedAt: null,
      iCloudUploadPendingSince: null,
      iCloudUploadIssue: null,
      lastiCloudRemoteDeviceName: null,
      // The device id names a file in each container; it stays.
      iCloudDeviceId: 'ipad',
      // The new account's files are generation zero to this device.
      iCloudResetEpoch: null,
      iCloudResetAdoptedNotice: null,
    })
    expect(usePreferences.getState().iCloudAccountChangedAt).toEqual(
      expect.any(Number)
    )
    expect(clearAdoptedAccountId).toHaveBeenCalledOnce()
    expect(analytics.capture).toHaveBeenCalledWith('icloud_account_changed', {
      source: 'can_sync',
      sync_was_enabled: true,
    })
    expect(analytics.capture).toHaveBeenCalledWith(
      'icloud_sync_enabled_changed',
      { enabled: false, source: 'icloud_account_change' }
    )
    // Handled once: the new account is now the recorded one.
    expect(checkICloudIdentity('can_sync')).toBe(true)
    expect(clearAdoptedAccountId).toHaveBeenCalledOnce()
  })

  it('shows no notice when sync was already off', async () => {
    runtime.identityToken = 'account-b'
    const { checkICloudIdentity, usePreferences, clearAdoptedAccountId } =
      await load()
    usePreferences.setState({ ...syncing, iCloudSyncEnabled: false })

    expect(checkICloudIdentity('account_reconcile')).toBe(false)

    expect(usePreferences.getState()).toMatchObject({
      // Never chosen, so the Supporter default still applies to the new
      // account.
      iCloudSyncSetByUser: false,
      iCloudAccountChangedAt: null,
    })
    expect(clearAdoptedAccountId).toHaveBeenCalledOnce()
  })

  it('keeps an explicit off choice through an account change', async () => {
    runtime.identityToken = 'account-b'
    const { checkICloudIdentity, usePreferences } = await load()
    usePreferences.setState({
      ...syncing,
      iCloudSyncEnabled: false,
      iCloudSyncSetByUser: true,
    })

    expect(checkICloudIdentity('launch')).toBe(false)
    expect(usePreferences.getState().iCloudSyncSetByUser).toBe(true)
  })

  it('decides nothing while the Keychain cannot verify the binding', async () => {
    // Possibly a copy restored from another device: its stored token came from
    // there and says nothing about this device's account.
    runtime.installId = new Error('locked')
    runtime.identityToken = 'account-b'
    const { checkICloudIdentity, usePreferences, clearAdoptedAccountId } =
      await load()
    usePreferences.setState({ ...syncing, iCloudDeviceBinding: 'install-a' })
    const before = usePreferences.getState()

    expect(checkICloudIdentity('launch')).toBe(true)
    expect(usePreferences.getState()).toBe(before)
    expect(clearAdoptedAccountId).not.toHaveBeenCalled()
  })

  it('records rather than compares on a copied device', async () => {
    runtime.identityToken = 'account-a-token-on-this-device'
    const { checkICloudIdentity, usePreferences } = await load()
    usePreferences.setState({ ...syncing, iCloudDeviceBinding: 'install-a' })

    expect(checkICloudIdentity('launch')).toBe(true)
    expect(usePreferences.getState()).toMatchObject({
      iCloudSyncEnabled: true,
      iCloudIdentityToken: 'account-a-token-on-this-device',
      iCloudAccountChangedAt: null,
    })
  })

  it('dismisses the notice', async () => {
    const { dismissICloudAccountChangeNotice, usePreferences, analytics } =
      await load()
    usePreferences.setState({ iCloudAccountChangedAt: 1 })

    dismissICloudAccountChangeNotice()

    expect(usePreferences.getState().iCloudAccountChangedAt).toBeNull()
    expect(analytics.capture).not.toHaveBeenCalled()
  })
})
