import { Platform } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import { clearAdoptedAccountId } from '@/lib/account'
import { androidDeviceInstallId, getOrCreateInstallId } from '@/lib/installId'
import { hasSyncTransport } from '@/lib/syncTransport'
import {
  activeSyncTransport as syncTransport,
  usesCloudSync,
} from '@/lib/syncTransport/provider'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'

export type IdentityDecision = 'unchanged' | 'record' | 'changed'

export function decideIdentity(
  stored: string | null,
  current: string | null,
  matches: () => boolean | null
): IdentityDecision {
  if (current === null) return 'unchanged'
  if (stored === null) return 'record'
  if (stored === current) return 'unchanged'
  return matches() === false ? 'changed' : 'record'
}

export type DeviceBindingDecision = 'keep' | 'create' | 'bind' | 'rebind'

export function decideDeviceBinding(args: {
  deviceId: string | null
  binding: string | null
  installId: string | null
}): DeviceBindingDecision {
  const { deviceId, binding, installId } = args
  if (!deviceId) return 'create'

  if (installId === null) return 'keep'
  if (binding === null) return 'bind'
  return binding === installId ? 'keep' : 'rebind'
}

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
} as const

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

  iCloudResetEpoch: null,
  iCloudResetAdoptedNotice: null,

  iCloudSyncDevices: {},
} as const

export const CLOUD_ACCOUNT_CHANGE_RESET = {
  ...ACCOUNT_CHANGE_RESET,
  iCloudSyncSetByUser: false,
  syncProvider: null,
  cloudSyncEntitled: null,
} as const

function generateDeviceId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  )
}

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

export function ensureSyncDeviceId(): string {
  return settleDeviceBinding().id
}

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

function storedTokenMatches(stored: string): boolean | null {
  try {
    return syncTransport().identityTokenMatches(stored)
  } catch (error) {
    logger.warn('[iCloudIdentity] identity comparison unavailable', error)
    return null
  }
}

export function checkICloudIdentity(source: IdentityCheckSource): boolean {
  if (!hasSyncTransport()) return true

  if (!checkDeviceBinding()) return true
  const prefs = usePreferences.getState()

  const cloud = usesCloudSync()
  const stored = cloud ? prefs.cloudSyncAccountToken : prefs.iCloudIdentityToken
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
      usePreferences.setState(
        cloud
          ? { cloudSyncAccountToken: current }
          : { iCloudIdentityToken: current }
      )
      return true
    case 'changed': {
      const wasEnabled = prefs.iCloudSyncEnabled
      if (cloud) {
        usePreferences.setState({
          ...CLOUD_ACCOUNT_CHANGE_RESET,
          cloudSyncAccountToken: current,
        })
        logger.warn('[iCloudIdentity] server account changed; Cloud Sync off', {
          source,
          wasEnabled,
        })
        analytics.capture('cloud_sync_account_changed', {
          source,
          sync_was_enabled: wasEnabled,
        })
        return false
      }
      usePreferences.setState({
        ...ACCOUNT_CHANGE_RESET,

        iCloudSyncSetByUser: wasEnabled || prefs.iCloudSyncSetByUser,
        iCloudIdentityToken: current,

        iCloudAccountChangedAt: wasEnabled
          ? Date.now()
          : prefs.iCloudAccountChangedAt,
      })

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

export function dismissICloudAccountChangeNotice(): void {
  usePreferences.setState({ iCloudAccountChangedAt: null })
}
