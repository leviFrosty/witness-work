import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import useMileage from '@/stores/mileage'
import usePet from '@/stores/pet'
import { petSliceFromBackup } from '@/lib/petBackup'
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

/** The same backup Settings exports, from the stores' current state. */
export function createBackupFile(): BackupFile {
  return {
    serviceReportStore: useServiceReport.getState(),
    contactStore: useContacts.getState(),
    conversationStore: useConversations.getState(),
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
    if (data.mileageStore)
      useMileage
        .getState()
        .set(knownSlice(data.mileageStore, useMileage.getState()))
    // Checked, so a pet without its wake list can't break the replay.
    if (data.petStore) usePet.getState().set(petSliceFromBackup(data.petStore))
    const preferences = extractProfileFromPreferences(
      knownSlice(data.preferencesStore, {
        ...usePreferences.getState(),
        ...useProfile.getState(),
      })
    )
    const restored = syncableValues(preferences.preferences)
    const current = usePreferences.getState()
    usePreferences.getState().set({
      ...restored,
      // Earned badges are keepsakes: a restore adds to them, never removes
      // (a removal would also sync to every other device).
      earnedBadges: {
        ...((restored.earnedBadges as typeof current.earnedBadges) ?? {}),
        ...current.earnedBadges,
      },
      badgeLedger: [
        ...new Set([
          ...((restored.badgeLedger as string[]) ?? []),
          ...current.badgeLedger,
        ]),
      ].sort(),
      // The next evaluation files what the restored records reach as history.
      badgesBackfilledAt: null,
    })
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
