import { iCloudSync } from '@/app/sync/iCloudSync'
import {
  cloudSyncDiagnostics,
  cloudSyncTransport,
  prepareCloudSync,
  refreshCloudSyncStatus,
} from '@/app/sync/cloudSync'
import {
  currentSyncOption,
  settleSyncProvider,
  switchSyncOption,
  type SyncOption,
} from '@/app/sync/syncOption'
import { syncProvider } from '@/lib/syncTransport/provider'
import { slotIdForFilename } from '@/lib/syncTransport/server/serverTransport'
import { checkAppConfig } from '@/lib/appUpdate'
import { usePreferences } from '@/stores/preferences'
import useContacts from '@/stores/contactsStore'

let cloudSyncLast: unknown = null

/** Starts `work`; its result (or `{ error }`) lands in `cloudSync.last`. */
const tracked = (work: () => Promise<unknown>) => {
  cloudSyncLast = null
  void work()
    .then((value) => {
      cloudSyncLast = value ?? { done: true }
    })
    .catch((error: unknown) => {
      cloudSyncLast = { error: String(error) }
    })
  return 'started'
}

/**
 * Cloud Sync (ADR 0030) for the verify harness. `state()` reads this device's
 * option and sync bookkeeping synchronously; anything that talks to the server
 * starts and puts its result in `last` a moment later. Slots come back as ids,
 * sizes and times, never contents.
 */
export const cloudSyncHarness = {
  state: () => {
    const prefs = usePreferences.getState()
    return {
      option: currentSyncOption(),
      provider: syncProvider(),
      chosen: prefs.syncProvider,
      enabled: prefs.iCloudSyncEnabled,
      setByUser: prefs.iCloudSyncSetByUser,
      entitled: prefs.cloudSyncEntitled,
      config: prefs.cloudSyncConfig,
      offer: prefs.cloudSyncOffer,
      canSync: iCloudSync.canSync(),
      needsResolution: prefs.iCloudSyncNeedsResolution,
      pendingPush: prefs.iCloudSyncPendingPush,
      issue: prefs.iCloudSyncIssue,
      errorCode: prefs.iCloudSyncErrorCode,
      slotId: prefs.iCloudDeviceId,
      lastSyncAt: prefs.lastiCloudSyncAt,
      lastPushedAt: prefs.lastiCloudPushedAt,
      lastPulledAt: prefs.lastiCloudPulledAt,
      lastRemoteDeviceName: prefs.lastiCloudRemoteDeviceName,
      devices: Object.keys(prefs.iCloudSyncDevices ?? {}).length,
      contacts: useContacts.getState().contacts.length,
      lastSeq: cloudSyncDiagnostics.lastSeq(),
      liveEvents: cloudSyncDiagnostics.liveEvents().slice(-10),
    }
  },
  /** `GET /app/v1/config` now, for its `sync` switches (`cloudSyncConfig`). */
  checkConfig: () => tracked(() => checkAppConfig({ force: true })),
  /** `GET /accounts/v1/sync`, stored as `cloudSyncEntitled`/`cloudSyncConfig`. */
  refresh: () => tracked(() => refreshCloudSyncStatus({ force: true })),
  prepare: () => tracked(() => prepareCloudSync()),
  /** The account's slots as this device reads them. */
  list: () =>
    tracked(async () => {
      const own = usePreferences.getState().iCloudDeviceId
      const { files } = await cloudSyncTransport.readFiles(
        (name) => slotIdForFilename(name) !== null
      )
      return files.map((file) => ({
        slotId: slotIdForFilename(file.filename),
        mine: slotIdForFilename(file.filename) === own,
        bytes: file.json.length,
        modifiedAt: file.modifiedAt,
      }))
    }),
  switchTo: (to: SyncOption) => tracked(() => switchSyncOption(to, 'tools')),
  /** Pull then push, as Sync now does. */
  syncNow: () =>
    tracked(async () => ({
      pulled: await iCloudSync.pullAndMerge('manual'),
      pushed: await iCloudSync.push('manual'),
    })),
  /**
   * This device as one upgraded from before Cloud Sync, syncing through iCloud
   * or Google Drive with no recorded option: settles it there with the one-time
   * offer pending.
   */
  simulateUpgradedPlatformDevice: () => {
    usePreferences.setState({
      syncProvider: null,
      iCloudSyncEnabled: true,
      iCloudSyncSetByUser: true,
      cloudSyncOffer: null,
    })
    settleSyncProvider()
    return cloudSyncHarness.state()
  },
  /**
   * This device as one that never chose: the Cloud Sync default runs again on
   * remount.
   */
  forgetChoice: () => {
    usePreferences.setState({
      syncProvider: null,
      iCloudSyncEnabled: false,
      iCloudSyncSetByUser: false,
      iCloudSyncNeedsResolution: false,
      cloudSyncOffer: null,
    })
    return cloudSyncHarness.state()
  },
  get last() {
    return cloudSyncLast
  },
}
