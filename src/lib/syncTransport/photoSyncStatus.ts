import type { TranslationKey } from '@/lib/locales'
import { usesCloudSync } from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'

/*
 * Why a photo didn't sync to the Cloud Sync account (ADR 0040 §6;
 * docs/cloud-sync-photos.md, "Storage full"). The photo bookkeeping
 * (`iCloudImageSync`, keyed by the engine's photo filename) is the source of
 * truth: the engine records the transport's code when a put is refused, and
 * replaces the entry once the photo uploads. Only Cloud Sync shows it; iCloud
 * and Google Drive report a full account their own way.
 */

type PreferencesState = ReturnType<typeof usePreferences.getState>
type Entry = PreferencesState['iCloudImageSync'][string] | undefined

/** The account's storage is full, or this one photo is over the size limit. */
export type PhotoSyncProblem = 'storage-full' | 'too-large'

export const PHOTO_SYNC_PROBLEM_LABEL = {
  'storage-full': 'photoSync_notSyncedStorageFull',
  'too-large': 'photoSync_notSyncedTooLarge',
} as const satisfies Record<PhotoSyncProblem, TranslationKey>

const problemOf = (entry: Entry): PhotoSyncProblem | null =>
  entry?.errorCode === 'storage-full' || entry?.errorCode === 'too-large'
    ? entry.errorCode
    : null

/** Whether this device syncs through Cloud Sync on a server that has photos. */
export const cloudSyncHoldsPhotos = (
  state: PreferencesState = usePreferences.getState()
) =>
  state.iCloudSyncEnabled && state.cloudSyncPhotos !== null && usesCloudSync()

/** Why this photo didn't sync to Cloud Sync, or null when nothing's wrong. */
export function photoSyncProblem(
  filename: string,
  state: PreferencesState = usePreferences.getState()
): PhotoSyncProblem | null {
  if (!cloudSyncHoldsPhotos(state)) return null
  return problemOf(state.iCloudImageSync?.[filename])
}

/** `photoSyncProblem`, kept current; null for `null`. */
export function usePhotoSyncProblem(
  filename: string | null
): PhotoSyncProblem | null {
  return usePreferences((state) =>
    filename === null ? null : photoSyncProblem(filename, state)
  )
}

/** Whether this photo didn't sync because the account's storage is full. */
export const photoStuckOnFullStorage = (
  filename: string,
  state: PreferencesState = usePreferences.getState()
) => photoSyncProblem(filename, state) === 'storage-full'

/**
 * Which of `filenames` (the photos this device's records refer to) are stuck on
 * a full account. Entries for photos nothing refers to any more don't count.
 */
export function photosStuckOnFullStorage(
  filenames: Iterable<string>,
  state: PreferencesState = usePreferences.getState()
): string[] {
  return [...filenames].filter((filename) =>
    photoStuckOnFullStorage(filename, state)
  )
}
