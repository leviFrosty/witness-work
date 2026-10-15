import { getContactStaleness, stalenessToColor } from '@/lib/contactStaleness'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'

/**
 * One Contact's staleness stripe color, for a `ContactCard` shown outside a
 * list. Lists should build a `ConversationIndex` once instead.
 */
export function useContactStalenessColor(contact: Contact): string {
  const conversations = useConversations((s) => s.conversations)
  const breakpoints = usePreferences((s) => s.stalenessBreakpoints)
  const markerColors = useMarkerColors()
  return stalenessToColor(
    getContactStaleness(contact, conversations, breakpoints),
    markerColors
  )
}
