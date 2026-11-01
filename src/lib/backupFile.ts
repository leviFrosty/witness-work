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

export function isBackupFile(data: unknown): data is BackupFile {
  return isRecord(data) && BACKUP_STORE_KEYS.some((key) => isRecord(data[key]))
}

export const BACKUP_FILE_VERSION = 1

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
