import useNow from '@/hooks/useNow'
import { followUpCardItems } from '@/lib/conversations'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'

/**
 * Home's Follow-up card items, limited to active (not archived) Contacts. They
 * follow the minute clock, so yesterday's leave at midnight and the card looks
 * ahead to tomorrow from 5 PM without a relaunch.
 */
export default function useFollowUpCardItems() {
  const conversations = useConversations((s) => s.conversations)
  const contacts = useContacts((s) => s.contacts)
  const { now } = useNow()

  const items = followUpCardItems({ currentTime: new Date(now), conversations })
  if (items.length === 0) return items
  const activeIds = new Set(contacts.map((c) => c.id))
  return items.filter((item) => activeIds.has(item.visit.contact.id))
}
