import type { TranslationKey } from '@/lib/locales'
import { usesCloudSync } from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'

type PreferencesState = ReturnType<typeof usePreferences.getState>
type Entry = PreferencesState['iCloudImageSync'][string] | undefined

export type PhotoSyncProblem = 'storage-full' | 'too-large'

export const PHOTO_SYNC_PROBLEM_LABEL = {
  'storage-full': 'photoSync_notSyncedStorageFull',
  'too-large': 'photoSync_notSyncedTooLarge',
} as const satisfies Record<PhotoSyncProblem, TranslationKey>

const problemOf = (entry: Entry): PhotoSyncProblem | null =>
  entry?.errorCode === 'storage-full' || entry?.errorCode === 'too-large'
    ? entry.errorCode
    : null

export const cloudSyncHoldsPhotos = (
  state: PreferencesState = usePreferences.getState()
) =>
  state.iCloudSyncEnabled && state.cloudSyncPhotos !== null && usesCloudSync()

export function photoSyncProblem(
  filename: string,
  state: PreferencesState = usePreferences.getState()
): PhotoSyncProblem | null {
  if (!cloudSyncHoldsPhotos(state)) return null
  return problemOf(state.iCloudImageSync?.[filename])
}

export function usePhotoSyncProblem(
  filename: string | null
): PhotoSyncProblem | null {
  return usePreferences((state) =>
    filename === null ? null : photoSyncProblem(filename, state)
  )
}

export const photoStuckOnFullStorage = (
  filename: string,
  state: PreferencesState = usePreferences.getState()
) => photoSyncProblem(filename, state) === 'storage-full'

export function photosStuckOnFullStorage(
  filenames: Iterable<string>,
  state: PreferencesState = usePreferences.getState()
): string[] {
  return [...filenames].filter((filename) =>
    photoStuckOnFullStorage(filename, state)
  )
}
