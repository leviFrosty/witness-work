import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import useMileage from '@/stores/mileage'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { useTerritories } from '@/features/territories/stores/territories'

export type LocalDataStore =
  | 'contacts'
  | 'conversations'
  | 'serviceReports'
  | 'categories'
  | 'mileage'
  | 'pet'
  | 'preferences'
  | 'profile'
  | 'territories'

export function subscribeToLocalDataChanges(
  onChange: (store: LocalDataStore) => void
): () => void {
  const unsubscribers = [
    useContacts.subscribe(() => onChange('contacts')),
    useConversations.subscribe(() => onChange('conversations')),
    useServiceReport.subscribe(() => onChange('serviceReports')),
    useCategories.subscribe(() => onChange('categories')),
    useMileage.subscribe(() => onChange('mileage')),
    usePet.subscribe(() => onChange('pet')),
    usePreferences.subscribe((state, prev) => {
      if (state.preferenceUpdatedAt !== prev.preferenceUpdatedAt)
        onChange('preferences')
    }),
    useProfile.subscribe((state, prev) => {
      if (state.profileUpdatedAt !== prev.profileUpdatedAt) onChange('profile')
    }),
    useTerritories.subscribe((state, prev) => {
      if (state.ledger !== prev.ledger) onChange('territories')
    }),
  ]
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
