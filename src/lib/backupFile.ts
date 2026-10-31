import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import useMileage from '@/stores/mileage'
import usePet from '@/stores/pet'
import { useProfile } from '@/stores/profile'
import {
  syncableValues,
  NON_SYNCABLE_PROFILE_KEYS,
} from '@/lib/syncPreferencePolicy'

/**
 * The JSON backup file. Any new stores should be added to this type to be
 * included in the import/export. Shared Cars (`@/stores/sharedCars`) stay out:
 * each lives in its space on ww-api (`docs/shared-cars-protocol.md`).
 */
export type BackupFile = {
  serviceReportStore?: unknown
  contactStore?: unknown
  conversationStore?: unknown
  preferencesStore?: unknown
  categoryStore?: unknown
  profileStore?: unknown
  mileageStore?: unknown
  petStore?: unknown
}

/** Every store a backup file can hold, in the shape createBackupFile writes. */
const BACKUP_STORE_KEYS = Object.keys({
  serviceReportStore: true,
  contactStore: true,
  conversationStore: true,
  preferencesStore: true,
  categoryStore: true,
  profileStore: true,
  mileageStore: true,
  petStore: true,
} satisfies Record<keyof BackupFile, true>) as (keyof BackupFile)[]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Whether parsed JSON looks like a WitnessWork backup: an object holding at
 * least one known store. Another app's JSON or an array restores nothing, so it
 * mustn't count as a successful restore.
 */
export function isBackupFile(data: unknown): data is BackupFile {
  return isRecord(data) && BACKUP_STORE_KEYS.some((key) => isRecord(data[key]))
}

/**
 * The backup file's format. Files from builds before it have no `version`;
 * restoring them reads their app version instead (`backupFileRestore.ts`). Bump
 * it when a record can hold a value older builds reject (a new enum value in
 * `payloadValidation.ts`): they refuse a newer file rather than restore it
 * without those records.
 */
export const BACKUP_FILE_VERSION = 1

/**
 * The same backup Settings exports, from the stores' current state. Carries the
 * sync payload's markers (`explicitFollowUps`, `additivePlans`), so a restore
 * never applies the rules for files from older builds to it.
 */
export function createBackupFile(): BackupFile & { version: number } {
  return {
    version: BACKUP_FILE_VERSION,
    serviceReportStore: {
      ...useServiceReport.getState(),
      additivePlans: true,
    },
    contactStore: useContacts.getState(),
    conversationStore: {
      ...useConversations.getState(),
      explicitFollowUps: true,
    },
    preferencesStore: syncableValues(usePreferences.getState()),
    categoryStore: useCategories.getState(),
    mileageStore: useMileage.getState(),
    petStore: usePet.getState(),
    profileStore: syncableValues(
      useProfile.getState(),
      NON_SYNCABLE_PROFILE_KEYS
    ),
  }
}
