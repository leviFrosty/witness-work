import type { Contact } from '@/types/contact'
import type { ConversationIndex } from '@/lib/conversationIndex'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useLocationSnapshot from '@/hooks/useLocationSnapshot'
import { buildSuggestedContacts } from '@/lib/suggestedContacts'
import { buildContactsList } from '@/features/contacts/lib/suggestedContactsList'

export default function useSuggestedContactsList({
  contacts,
  index,
  enabled,
  listVisible,
}: {
  contacts: Contact[]
  index: ConversationIndex

  enabled: boolean

  listVisible: boolean
}) {
  const conversations = useConversations((s) => s.conversations)
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const location = useLocationSnapshot({ enabled: enabled && listVisible })

  const suggested = enabled
    ? buildSuggestedContacts({
        contacts,
        conversations,
        index,
        here: location.here,
        currentTime: new Date(location.at),
        beenAWhile: true,
        dataProtectionMode,
      })
    : null
  const list = buildContactsList({
    contacts,
    suggested,
    currentTime: new Date(location.at),
  })

  return {
    ...list,

    showsNearby: list.items.some(
      (item) => item.kind === 'header' && item.section === 'nearby'
    ),

    markInteracted: location.markInteracted,
  }
}
