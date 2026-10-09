import { Platform } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import { clearAdoptedAccountId } from '@/lib/account'
import { androidDeviceInstallId, getOrCreateInstallId } from '@/lib/installId'
import { hasSyncTransport, syncTransport } from '@/lib/syncTransport'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'

/**
 * Which physical device and which cloud account sync is talking for — the Apple
 * Account on iOS, the connected Google Account on Android (ADR 0019). Both
 * identities are recorded device-locally (`NON_SYNCABLE_PREFERENCE_KEYS`) and
 * checked before sync reads or writes anything:
 *
 * - **Device.** `iCloudDeviceId` names this device's snapshot file. It lives in
 *   preferences, which iOS device backups and Quick Start copy to a new device;
 *   two devices sharing one id would each skip the other's file as their own
 *   and overwrite each other's snapshot. The id is bound to the Keychain
 *   install id (`AfterFirstUnlockThisDeviceOnly`, non-synchronizing — it never
 *   leaves this device), and a copy gets a fresh id.
 * - **Apple Account.** Signing into another Apple Account switches the iCloud
 *   container. Syncing on would pull the new account's data and push this
 *   device's householder records into another person's iCloud, so sync turns
 *   off as an explicit choice and the shared account id (ADR 0011) is dropped.
 */

export type IdentityDecision =
  /** Signed out, no native support, or the same account: nothing to do. */
  | 'unchanged'
  /**
   * Remember the current account: the first check on this install, the same
   * account archived differently, or a stored token that can't be compared.
   */
  | 'record'
  /** A different Apple Account: stop sync before any read or write. */
  | 'changed'

/**
 * `stored` and `current` are archived identity tokens (`identityToken`). Equal
 * archives are the same account. Otherwise only `matches`, the native
 * `isEqual:` comparison Apple documents, decides: archives of one token aren't
 * guaranteed byte-identical across iOS versions, and a false "changed" would
 * turn sync off. When it can't compare (null), the current token is recorded
 * instead of guessing.
 */
export function decideIdentity(
  stored: string | null,
  current: string | null,
  matches: () => boolean | null
): IdentityDecision {
  // Signed out says nothing about which account comes back.
  if (current === null) return 'unchanged'
  if (stored === null) return 'record'
  if (stored === current) return 'unchanged'
  return matches() === false ? 'changed' : 'record'
}

export type DeviceBindingDecision =
  /** Bound to this device, or the install id is unreadable right now. */
  | 'keep'
  /** No device id yet: create one bound to this device. */
  | 'create'
  /** Existing install from before binding: bind without changing the id. */
  | 'bind'
  /** Copied from another device: replace the id and its bookkeeping. */
  | 'rebind'

export function decideDeviceBinding(args: {
  deviceId: string | null
  binding: string | null
  installId: string | null
}): DeviceBindingDecision {
  const { deviceId, binding, installId } = args
  if (!deviceId) return 'create'
  // A locked Keychain (background launch before first unlock) can't prove a
  // copy; treat the id as ours until it can.
  if (installId === null) return 'keep'
  if (binding === null) return 'bind'
  return binding === installId ? 'keep' : 'rebind'
}

/**
 * Sync bookkeeping that describes the device it was recorded on. A copied
 * device clears it so it joins as a new participant: it recalibrates its own
 * clock, re-verifies its photo uploads, and publishes its snapshot under the
 * new id. The stored identity token is dropped too: tokens are only compared on
 * the device that archived them.
 */
export const COPIED_DEVICE_RESET = {
  iCloudClockOffsetMs: 0,
  iCloudClockCalibrated: false,
  iCloudImageSync: {},
  iCloudSyncPendingPush: true,
  iCloudSyncIssue: null,
  iCloudSyncErrorCode: null,
  lastiCloudSyncAt: null,
  lastiCloudPushedAt: null,
  lastiCloudPulledAt: null,
  lastiCloudUploadedAt: null,
  iCloudUploadPendingSince: null,
  iCloudUploadIssue: null,
  lastiCloudRemoteWrittenAt: null,
  lastiCloudRemoteDeviceId: null,
  lastiCloudRemoteDeviceName: null,
  iCloudIdentityToken: null,
  // `iCloudSyncDevices` stays: a copy reads the same container, and its old
  // own file is now the original device's.
} as const

/**
 * Sync bookkeeping that describes the previous account's container. Turning
 * sync back on goes through the first-enable flow against the new container.
 */
export const ACCOUNT_CHANGE_RESET = {
  iCloudSyncEnabled: false,
  iCloudSyncPausedForLapse: false,
  iCloudSyncNeedsResolution: false,
  iCloudSyncPendingPush: false,
  iCloudSyncIssue: null,
  iCloudSyncErrorCode: null,
  iCloudImageSync: {},
  lastiCloudSyncAt: null,
  lastiCloudPushedAt: null,
  lastiCloudPulledAt: null,
  lastiCloudUploadedAt: null,
  iCloudUploadPendingSince: null,
  iCloudUploadIssue: null,
  lastiCloudRemoteWrittenAt: null,
  lastiCloudRemoteDeviceId: null,
  lastiCloudRemoteDeviceName: null,
  // Reset generations belong to one container; the new account's files are
  // generation zero to this device, not pre-reset snapshots to ignore.
  iCloudResetEpoch: null,
  iCloudResetAdoptedNotice: null,
  // The previous container's files.
  iCloudSyncDevices: {},
} as const

/**
 * Lightweight UUID-ish id. Good enough for attributing writes to a device in
 * the sync payload metadata. Not security-sensitive, so a stronger RNG would be
 * overkill.
 */
function generateDeviceId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  )
}

/**
 * What `iCloudDeviceId` is bound to. Android Auto Backup copies MMKV, and with
 * it the stored install id, to a restored phone, so Android binds to the id
 * derived from `ANDROID_ID`, which a restore can't carry.
 */
function readInstallId(): string | null {
  try {
    return Platform.OS === 'android'
      ? androidDeviceInstallId()
      : getOrCreateInstallId()
  } catch (error) {
    logger.warn('[iCloudIdentity] install id unavailable', error)
    return null
  }
}

/**
 * This device's sync id, created or replaced as `decideDeviceBinding` says.
 * `verified` is false while the Keychain can't be read: the id is kept, but may
 * still be another device's copy.
 */
function settleDeviceBinding(): { id: string; verified: boolean } {
  const prefs = usePreferences.getState()
  const installId = readInstallId()
  const decision = decideDeviceBinding({
    deviceId: prefs.iCloudDeviceId,
    binding: prefs.iCloudDeviceBinding,
    installId,
  })
  if (decision === 'keep')
    return { id: prefs.iCloudDeviceId!, verified: installId !== null }
  if (decision === 'bind') {
    usePreferences.setState({ iCloudDeviceBinding: installId })
    return { id: prefs.iCloudDeviceId!, verified: true }
  }
  const id = generateDeviceId()
  if (decision === 'rebind') {
    logger.warn('[iCloudIdentity] copied device id replaced')
  }
  usePreferences.setState({
    ...(decision === 'rebind' ? COPIED_DEVICE_RESET : {}),
    iCloudDeviceId: id,
    iCloudDeviceBinding: installId,
  })
  return { id, verified: installId !== null }
}

/** This device's sync id. Called before every snapshot read or write. */
export function ensureSyncDeviceId(): string {
  return settleDeviceBinding().id
}

/**
 * Settles an existing id's binding; an install that never synced gets none.
 * False when the binding couldn't be verified (Keychain unreadable).
 */
export function checkDeviceBinding(): boolean {
  if (!usePreferences.getState().iCloudDeviceId) return true
  return settleDeviceBinding().verified
}

export type IdentityCheckSource =
  | 'launch'
  | 'availability'
  | 'can_sync'
  | 'initial_enable'
  | 'account_reconcile'

/** The native `isEqual:` comparison; null when it can't be made. */
function storedTokenMatches(stored: string): boolean | null {
  try {
    return syncTransport().identityTokenMatches(stored)
  } catch (error) {
    logger.warn('[iCloudIdentity] identity comparison unavailable', error)
    return null
  }
}

/**
 * Compares the current Apple Account with the one this device last synced with.
 * Synchronous and cheap (the native side caches the token and the comparison
 * until the identity changes), so `canSync` calls it before every read or
 * write. Returns false when the account changed; by then sync is off, the
 * account-scoped bookkeeping is reset, and the shared account id is cleared, so
 * callers only need to stop.
 */
export function checkICloudIdentity(source: IdentityCheckSource): boolean {
  if (!hasSyncTransport()) return true
  // A copied device's stored token came from another device, so the binding
  // is settled first (see `COPIED_DEVICE_RESET`). Until it can be verified,
  // the stored token may be such a copy and says nothing about this device's
  // account, so nothing is decided.
  if (!checkDeviceBinding()) return true
  const prefs = usePreferences.getState()
  const stored = prefs.iCloudIdentityToken
  let current: string | null
  try {
    current = syncTransport().identityToken()
  } catch (error) {
    logger.warn('[iCloudIdentity] identity token unavailable', error)
    return true
  }
  switch (decideIdentity(stored, current, () => storedTokenMatches(stored!))) {
    case 'unchanged':
      return true
    case 'record':
      usePreferences.setState({ iCloudIdentityToken: current })
      return true
    case 'changed': {
      const wasEnabled = prefs.iCloudSyncEnabled
      usePreferences.setState({
        ...ACCOUNT_CHANGE_RESET,
        // Sync that was on turns off as an explicit choice, so the Supporter
        // auto-enable can't seed the new account with this device's data. A
        // device that never chose keeps the default behaviour.
        iCloudSyncSetByUser: wasEnabled || prefs.iCloudSyncSetByUser,
        iCloudIdentityToken: current,
        // The notice explains a switch that went off on its own; a device
        // the user had already turned off has nothing to explain.
        iCloudAccountChangedAt: wasEnabled
          ? Date.now()
          : prefs.iCloudAccountChangedAt,
      })
      // The previous account's shared id must not claim the new account's
      // account file; AccountProvider logs RevenueCat back in as this
      // device's own id.
      clearAdoptedAccountId()
      logger.warn('[iCloudIdentity] Apple Account changed; sync turned off', {
        source,
        wasEnabled,
      })
      analytics.capture('icloud_account_changed', {
        source,
        sync_was_enabled: wasEnabled,
      })
      if (wasEnabled) {
        analytics.capture('icloud_sync_enabled_changed', {
          enabled: false,
          source: 'icloud_account_change',
        })
      }
      return false
    }
  }
}

/** Hides the Settings notice explaining the account-change turn-off. */
export function dismissICloudAccountChangeNotice(): void {
  usePreferences.setState({ iCloudAccountChangedAt: null })
}
