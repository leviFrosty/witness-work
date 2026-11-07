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
import { completedPullThisLaunch } from '@/lib/cloudSyncPullSettled'
import { refreshCloudSyncPhotoUsage } from '@/app/sync/cloudSync'
import { localAvatarPathForContact } from '@/app/sync/imageSources'
import { fromB64u } from '@/lib/bytes'

let cloudSyncLast: unknown = null

const SAMPLE_PHOTO =
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAMKADAAQAAAABAAAAMAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAMAAwAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMACQkJCQkJEAkJEBYQEBAWHhYWFhYeJh4eHh4eJi4mJiYmJiYuLi4uLi4uLjc3Nzc3N0BAQEBASEhISEhISEhISP/bAEMBCwwMEhESHxERH0szKjNLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS//dAAQAA//aAAwDAQACEQMRAD8AwljqysdSLHVhY696UzzKNQjWOrKx1IsdWFjrnlM9ejUI1jqysdSLHVhY655TPXo1D//QjWOrKx1IsdWFjr0pTPnaNQjWOrKx1IsdWFjrnlM9ejUI1jqysdSLHVhY6wlM9ijUP//R1VjqysdSLHVhY63lM+Po1CNY6srHUix1YWOueUz16NQjWOrKx1IsdWFjrnlM9ejUP//Z'

const peekAccountKey = async () => {
  const key = await accountKey.peek()
  if (!key) throw new Error('No account key on this device')
  return key
}

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

      completePull: completedPullThisLaunch(),
    }
  },

  checkConfig: () => tracked(() => checkAppConfig({ force: true })),

  refresh: () => tracked(() => refreshCloudSyncStatus({ force: true })),
  prepare: () => tracked(() => prepareCloudSync()),

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

  syncNow: () =>
    tracked(async () => ({
      pulled: await iCloudSync.pullAndMerge('manual'),
      pushed: await iCloudSync.push('manual'),
    })),

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

  setContactPhoto: (id: string, megabytes?: number) =>
    tracked(async () => {
      const revision = Date.now().toString(36)
      const value = `${FileSystem.documentDirectory}contact-${id}-avatar-picked-${revision}.jpg`
      if (megabytes) {
        const bytes = new Uint8Array(megabytes * 1024 * 1024)
        for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff
        await photoFiles.write(value, bytes)
      } else {
        await FileSystem.writeAsStringAsync(value, SAMPLE_PHOTO, {
          encoding: FileSystem.EncodingType.Base64,
        })
      }
      useContacts
        .getState()
        .updateContact({ id, avatar: { type: 'image', value, revision } })
      return { revision }
    }),

  removeContactPhoto: (id: string) => {
    useContacts
      .getState()
      .updateContact({ id, avatar: { type: 'none', value: '' } })
    return useContacts.getState().contacts.find((c) => c.id === id)?.avatar
  },

  photoPass: () => tracked(() => iCloudSync.pushImagesIfEnabled()),

  photos: () => tracked(() => cloudSyncTransport.listBinaryFiles()),

  photoUsage: () => tracked(() => refreshCloudSyncPhotoUsage()),

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

      await cloudSyncTransport.listBinaryFiles()
      const downloadPath = `${path}.download`
      let downloadMs = Date.now()
      await cloudSyncTransport.readBinary(filename, downloadPath)
      downloadMs = Date.now() - downloadMs
      await cloudSyncTransport.deleteBinaryFile(filename)
      await FileSystem.deleteAsync(path, { idempotent: true })
      await FileSystem.deleteAsync(downloadPath, { idempotent: true })
      return { megabytes, readMs, sealMs, longestMs, uploadMs, downloadMs }
    }),

  setInstalledBeforeFreeSync: (value = true) => {
    usePreferences.setState({ installedBeforeFreeSync: value })
    return cloudSyncHarness.state()
  },

  showTrayOffer: (variant: CloudSyncTrayOfferVariant) => {
    showCloudSyncTrayOffer(variant)
    return cloudSyncHarness.state()
  },

  addContactPhotos: (count = 2) =>
    tracked(async () => {
      const directory = FileSystem.documentDirectory ?? ''
      const contacts = useContacts.getState().contacts.slice(0, count)
      for (const contact of contacts) {
        const path = localAvatarPathForContact(directory, contact.id)
        await photoFiles.write(
          path,
          fromB64u(
            SAMPLE_PHOTO.replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/, '')
          )
        )
        useContacts.getState().updateContact({
          ...contact,
          avatar: { type: 'image', value: `${path}?t=${Date.now()}` },
        })
      }
      return contacts.map(({ id }) => id)
    }),
  get last() {
    return cloudSyncLast
  },
}
