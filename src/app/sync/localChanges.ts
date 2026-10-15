import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import useMileage from '@/stores/mileage'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'

/** The stores whose data goes into the sync payload. */
export type LocalDataStore =
  | 'contacts'
  | 'conversations'
  | 'serviceReports'
  | 'categories'
  | 'mileage'
  | 'preferences'
  | 'profile'

/**
 * Calls `onChange` whenever data that `buildPayload` snapshots may have
 * changed: what makes iCloud and Google Drive sync push, and the account backup
 * upload. Preferences and profile count only when a syncable key changed: their
 * stamping wrappers re-allocate `preferenceUpdatedAt` / `profileUpdatedAt` iff
 * one did, so a reference check is a cheap and accurate filter. Without it,
 * bookkeeping writes such as `lastiCloudPulledAt` would look like edits.
 */
export function subscribeToLocalDataChanges(
  onChange: (store: LocalDataStore) => void
): () => void {
  const unsubscribers = [
    useContacts.subscribe(() => onChange('contacts')),
    useConversations.subscribe(() => onChange('conversations')),
    useServiceReport.subscribe(() => onChange('serviceReports')),
    useCategories.subscribe(() => onChange('categories')),
    useMileage.subscribe(() => onChange('mileage')),
    usePreferences.subscribe((state, prev) => {
      if (state.preferenceUpdatedAt !== prev.preferenceUpdatedAt)
        onChange('preferences')
    }),
    useProfile.subscribe((state, prev) => {
      if (state.profileUpdatedAt !== prev.profileUpdatedAt) onChange('profile')
    }),
  ]
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
