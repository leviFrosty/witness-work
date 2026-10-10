import type { Contact } from '@/types/contact'
import type { ConversationIndex } from '@/lib/conversationIndex'
import useConversations from '@/stores/conversationStore'
import useLocationSnapshot from '@/hooks/useLocationSnapshot'
import { buildSuggestedContacts } from '@/lib/suggestedContacts'
import { buildContactsList } from '@/features/contacts/lib/suggestedContactsList'

/**
 * The Contacts list laid out for the Suggested sort (see `buildContactsList`):
 * Nearby, Follow-ups Due, and Recent sections ahead of everyone else, or the
 * flat list when `enabled` is false.
 *
 * Location and "today" come from `useLocationSnapshot`, read on focus so rows
 * don't move while the User reads (call `markInteracted` from the list's
 * touches). It never asks for location.
 */
export default function useSuggestedContactsList({
  contacts,
  index,
  enabled,
  listVisible,
}: {
  /** The filtered Contacts in Suggested order. */
  contacts: Contact[]
  index: ConversationIndex
  /** The Suggested sort with no search. */
  enabled: boolean
  /** False while the Map shows instead of the list. */
  listVisible: boolean
}) {
  const conversations = useConversations((s) => s.conversations)
  const location = useLocationSnapshot({ enabled: enabled && listVisible })

  const suggested = enabled
    ? buildSuggestedContacts({
        contacts,
        conversations,
        index,
        here: location.here,
        currentTime: new Date(location.at),
      })
    : null
  const list = buildContactsList({
    contacts,
    suggested,
    currentTime: new Date(location.at),
  })

  return {
    ...list,
    /** Whether a Nearby section is showing. */
    showsNearby: list.items.some(
      (item) => item.kind === 'header' && item.section === 'nearby'
    ),
    /** The User touched the list; a late fix no longer reorders it. */
    markInteracted: location.markInteracted,
  }
}
