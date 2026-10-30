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
import * as FileSystem from 'expo-file-system/legacy'
import { photoFiles } from '@/lib/syncTransport/server/photoFiles'
import {
  derivePhotoKeys,
  sealPhoto,
} from '@/lib/syncTransport/server/photoCrypto'
import { useCloudSyncPhotoUsage } from '@/lib/syncTransport/server/photoUsage'
import { refreshCloudSyncPhotoUsage } from '@/app/sync/cloudSync'
import { localAvatarPathForContact } from '@/app/sync/imageSources'
import { fromB64u } from '@/lib/bytes'

/** A 48 px JPEG (b64u), for a contact photo the harness adds. */
const SAMPLE_PHOTO =
  '_9j_4AAQSkZJRgABAQAASABIAAD_4QCARXhpZgAATU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAABIAAAAAQAAAEgAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAABagAwAEAAAAAQAAADAAAAAA_-0AOFBob3Rvc2hvcCAzLjAAOEJJTQQEAAAAAAAAOEJJTQQlAAAAAAAQ1B2M2Y8AsgTpgAmY7PhCfv_AABEIADAAFgMBIgACEQEDEQH_xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv_xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5-jp6vHy8_T19vf4-fr_xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv_xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4-Tl5ufo6ery8_T19vf4-fr_2wBDAAICAgICAgMCAgMFAwMDBQYFBQUFBggGBgYGBggKCAgICAgICgoKCgoKCgoMDAwMDAwODg4ODg8PDw8PDw8PDw__2wBDAQICAgQEBAcEBAcQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD_3QAEAAL_2gAMAwEAAhEDEQA_APIPDPw6t9e0t9Vn1mwstspiFvczvBMcAHeD5Uilecdc9a6OD4Q6ZcROyeJNKWZJNnlNduMgdWDfZ9pX3rq_h_8AB34n-PtNuNR8E2hlsraYQO5uEgXzWAbaAzAnggk4wOOa7-b9l_8AaDt42llsgFHUjUImP5ByTXy0YVmrxhdfM_AaWGzCcVOlh-aL2fva_gfJ-v8AhddEuoYFuoLwTwpNmBi4jL5zGxKr864wcDHpWH9hH92vY_GngjxX4R1WLTPF8LxXckKTx7n8zdE5IUg59QRg4II6VyP2E_3aycmtJbnFUrVIScKq5ZLda6fef__Q-1v2R4NZt_h7qx0iKF2OqMGM27p5MXTbX1hGnjQuu-2tAmRu_wBbux3xxjNeD_sj6asfgXVY7phEDqTsA204xDFyAa-lr3xH4f0-7axv_EdrZzqN3lzzojkeu0sDiuPAv9zE-d4Un_wm0H5H5nftfWG74o2jeWUJ0yAkepMsuTXyv_Z_tX3B-01Z2Or_ABAs7yORbqN9MgKSRuHRkMkpBVl4II5r53_4R-z_AOeZ_M185j_40j8T4rqP-0a1n1P_0fvr4GfEHwD4U0DUtH8TeJ7LR7lr4yGKe6WBwphjAYqXUkHHFe0D4xfBRZGM_wAQLJuCBtvY2XB9ByQfqa-d_hv8D_A_jS31LX9dk1GO9W58sG1u_JTaYo8_Lsbk4GfpXb6h-yj8KtWSOPUrjWLhIiSqveggE-n7viuPAfwYNdj5rhKzyzDuP8qPI_jD4g8N-LvGEd14X1eHWbS3soot8UyTlPnkO1mTjPOQOw4ry37EfSvTvF3ws8LfDbxE2leFBc_ZprWBm-1TecwIaQAA7VwAO2K5_wCxH0FfLZjO1eR-B8Z11HNK6v1_RH__2Q'

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
   * Gives the first `count` contacts a photo, the way the avatar picker saves
   * one, so Cloud Sync uploads them on its next push. Returns their ids.
   */
  addContactPhotos: (count = 2) =>
    tracked(async () => {
      const directory = FileSystem.documentDirectory ?? ''
      const contacts = useContacts.getState().contacts.slice(0, count)
      for (const contact of contacts) {
        const path = localAvatarPathForContact(directory, contact.id)
        await photoFiles.write(path, fromB64u(SAMPLE_PHOTO))
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
