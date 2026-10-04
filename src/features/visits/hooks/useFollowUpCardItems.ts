import { followUpCardItems } from '@/lib/conversations'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'

/** Home's Follow-up card items, limited to active (not archived) Contacts. */
export default function useFollowUpCardItems() {
  const conversations = useConversations((s) => s.conversations)
  const contacts = useContacts((s) => s.contacts)

  const activeIds = new Set(contacts.map((c) => c.id))
  return followUpCardItems({ currentTime: new Date(), conversations }).filter(
    (item) => activeIds.has(item.visit.contact.id)
  )
}
