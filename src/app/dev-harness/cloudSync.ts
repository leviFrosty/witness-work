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
import { accountKey } from '@/app/account/accountKey'
import { bearerOptions } from '@/lib/serverAccount'
import { withdrawSyncRequest } from '@/lib/syncTransport/server/syncClient'
import { createWebCloudSyncClient } from '@/app/web-cloud-sync'
import { usePreferences } from '@/stores/preferences'
import { showCloudSyncTrayOffer } from '@/app/notifications/devNotifications'
import type { CloudSyncTrayOfferVariant } from '@/app/sync/cloudSyncTrayOffer'
import useContacts from '@/stores/contactsStore'
import * as FileSystem from 'expo-file-system/legacy'
import { photoFiles } from '@/lib/syncTransport/server/photoFiles'
import {
  derivePhotoKeys,
  sealPhoto,
} from '@/lib/syncTransport/server/photoCrypto'
import { useCloudSyncPhotoUsage } from '@/lib/syncTransport/server/photoUsage'
import { refreshCloudSyncPhotoUsage } from '@/app/sync/cloudSync'

let cloudSyncLast: unknown = null

/** A 48×48 JPEG, for a contact photo without the picker. */
const SAMPLE_PHOTO =
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAMKADAAQAAAABAAAAMAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAMAAwAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMACQkJCQkJEAkJEBYQEBAWHhYWFhYeJh4eHh4eJi4mJiYmJiYuLi4uLi4uLjc3Nzc3N0BAQEBASEhISEhISEhISP/bAEMBCwwMEhESHxERH0szKjNLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS//dAAQAA//aAAwDAQACEQMRAD8AwljqysdSLHVhY696UzzKNQjWOrKx1IsdWFjrnlM9ejUI1jqysdSLHVhY655TPXo1D//QjWOrKx1IsdWFjr0pTPnaNQjWOrKx1IsdWFjrnlM9ejUI1jqysdSLHVhY6wlM9ijUP//R1VjqysdSLHVhY63lM+Po1CNY6srHUix1YWOueUz16NQjWOrKx1IsdWFjrnlM9ejUP//Z'

const peekAccountKey = async () => {
  const key = await accountKey.peek()
  if (!key) throw new Error('No account key on this device')
  return key
}

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
      requestAnswered: prefs.cloudSyncRequestAnswered,
      installedBeforeFreeSync: prefs.installedBeforeFreeSync,
      trayOffer: prefs.cloudSyncTrayOffer,
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
  /**
   * Asks the account's phones to turn Cloud Sync on, as the web's Turn On does
   * (Bearer and the account key's envelope), or with `false` withdraws it;
   * `last` gets `{ requestedAt }`. A phone answers at its next status read
   * (`refresh`, or a foreground a minute after the last read), once per
   * request; the server clears it once every live phone has written a slot.
   */
  request: (requested = true) =>
    tracked(async () => {
      const key = await peekAccountKey()
      if (requested)
        return {
          requestedAt: await createWebCloudSyncClient(key).requestCloudSync(),
        }
      await withdrawSyncRequest(bearerOptions(key))
      return { requestedAt: null }
    }),
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
  /**
   * Photos (ADR 0040 §6): the switch, the account's usage as last heard, and
   * this device's photo bookkeeping (filename → error code, or `synced`).
   */
  photoState: () => {
    const prefs = usePreferences.getState()
    return {
      photos: prefs.cloudSyncPhotos,
      travel: iCloudSync.photosTravel(),
      usage: useCloudSyncPhotoUsage.getState().usage,
      fullAt: useCloudSyncPhotoUsage.getState().fullAt,
      bookkeeping: Object.fromEntries(
        Object.entries(prefs.iCloudImageSync ?? {}).map(([name, entry]) => [
          name,
          entry.errorCode ?? (entry.containerMtime ? 'synced' : 'local'),
        ])
      ),
    }
  },
  /**
   * Gives a contact a new photo revision, as picking one does, without the
   * picker; `last` gets its revision.
   */
  setContactPhoto: (id: string) =>
    tracked(async () => {
      const revision = Date.now().toString(36)
      const value = `${FileSystem.documentDirectory}contact-${id}-avatar-picked-${revision}.jpg`
      await FileSystem.writeAsStringAsync(value, SAMPLE_PHOTO, {
        encoding: FileSystem.EncodingType.Base64,
      })
      useContacts
        .getState()
        .updateContact({ id, avatar: { type: 'image', value, revision } })
      return { revision }
    }),
  /** Removes a contact's photo, as the avatar editor's Remove does. */
  removeContactPhoto: (id: string) => {
    useContacts
      .getState()
      .updateContact({ id, avatar: { type: 'none', value: '' } })
    return useContacts.getState().contacts.find((c) => c.id === id)?.avatar
  },
  /**
   * The photo upload pass on this device's current records, without a pull
   * first: what a foreground return or freed room on a full account runs.
   */
  photoPass: () => tracked(() => iCloudSync.pushImagesIfEnabled()),
  /** The account's photos as this device lists them: filenames and times. */
  photos: () => tracked(() => cloudSyncTransport.listBinaryFiles()),
  /** `photos/usage` now. */
  photoUsage: () => tracked(() => refreshCloudSyncPhotoUsage()),
  /**
   * Seals a `megabytes` photo file and uploads it, timing each step and the
   * longest the JS thread went without a break while sealing; then deletes it.
   */
  photoBenchmark: (megabytes = 10) =>
    tracked(async () => {
      const filename = 'witness-work-note-benchmark-photo.jpg'
      const path = `${FileSystem.cacheDirectory}${filename}`
      const bytes = new Uint8Array(megabytes * 1024 * 1024)
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff
      await photoFiles.write(path, bytes)
      let readMs = Date.now()
      const read = await photoFiles.read(path)
      readMs = Date.now() - readMs
      let longestMs = 0
      let last = Date.now()
      const pause = async () => {
        const now = Date.now()
        longestMs = Math.max(longestMs, now - last)
        await new Promise((resolve) => setTimeout(resolve, 0))
        last = Date.now()
      }
      const key = derivePhotoKeys(new Uint8Array(32).fill(1)).photoKey
      let sealMs = Date.now()
      await sealPhoto(
        key,
        read,
        { accountId: 'benchmark', name: 'benchmark' },
        new Uint8Array(24),
        pause
      )
      sealMs = Date.now() - sealMs
      let uploadMs = Date.now()
      await cloudSyncTransport.writeBinary(filename, path)
      uploadMs = Date.now() - uploadMs
      await cloudSyncTransport.deleteBinaryFile(filename)
      await FileSystem.deleteAsync(path, { idempotent: true })
      return { megabytes, readMs, sealMs, longestMs, uploadMs }
    }),
  /**
   * This device as an install from before sync was free (ADR 0040 §2), which
   * keeps its old sync defaults, or as a new one. A seed makes it new.
   */
  setInstalledBeforeFreeSync: (value = true) => {
    usePreferences.setState({ installedBeforeFreeSync: value })
    return cloudSyncHarness.state()
  },
  /** Lists the tray's Cloud Sync offer again, as the Tools rows do. */
  showTrayOffer: (variant: CloudSyncTrayOfferVariant) => {
    showCloudSyncTrayOffer(variant)
    return cloudSyncHarness.state()
  },
  get last() {
    return cloudSyncLast
  },
}
