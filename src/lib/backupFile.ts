import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { useProfile } from '@/stores/profile'
import {
  syncableValues,
  NON_SYNCABLE_PROFILE_KEYS,
} from '@/lib/syncPreferencePolicy'
import { extractProfileFromPreferences } from '@/lib/profileMigration'
import { withRemoteDataMutation } from '@/lib/remoteDataMutation'

/**
 * The JSON backup file. Any new stores should be added to this type to be
 * included in the import/export.
 */
export type BackupFile = {
  serviceReportStore?: unknown
  contactStore?: unknown
  conversationStore?: unknown
  preferencesStore?: unknown
  categoryStore?: unknown
  profileStore?: unknown
}

/** The same backup Settings exports, from the stores' current state. */
export function createBackupFile(): BackupFile {
  return {
    serviceReportStore: useServiceReport.getState(),
    contactStore: useContacts.getState(),
    conversationStore: useConversations.getState(),
    preferencesStore: syncableValues(usePreferences.getState()),
    categoryStore: useCategories.getState(),
    profileStore: syncableValues(
      useProfile.getState(),
      NON_SYNCABLE_PROFILE_KEYS
    ),
  }
}

function knownSlice(
  value: unknown,
  state: Record<string, unknown>
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => Object.hasOwn(state, key) && typeof state[key] !== 'function'
    )
  )
}

/** Older backups may lack the new stores; never copy identity or consent. */
export function restoreBackupFile(data: BackupFile): void {
  withRemoteDataMutation(() => {
    if (data.contactStore)
      useContacts
        .getState()
        .set(knownSlice(data.contactStore, useContacts.getState()))
    if (data.conversationStore)
      useConversations
        .getState()
        .set(knownSlice(data.conversationStore, useConversations.getState()))
    if (data.serviceReportStore)
      useServiceReport
        .getState()
        .set(knownSlice(data.serviceReportStore, useServiceReport.getState()))
    if (data.categoryStore)
      useCategories
        .getState()
        .set(knownSlice(data.categoryStore, useCategories.getState()))
    const preferences = extractProfileFromPreferences(
      knownSlice(data.preferencesStore, {
        ...usePreferences.getState(),
        ...useProfile.getState(),
      })
    )
    usePreferences.getState().set(syncableValues(preferences.preferences))
    const profile = data.profileStore ?? preferences.profile.values
    useProfile
      .getState()
      .set(
        syncableValues(
          knownSlice(profile, useProfile.getState()),
          NON_SYNCABLE_PROFILE_KEYS
        )
      )
  })
}
