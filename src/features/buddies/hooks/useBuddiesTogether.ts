import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useToday from '@/hooks/useToday'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buildTogetherWithBuddies } from '@/features/buddies/lib/together'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function useBuddiesTogether() {
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const buddies = useBuddies((state) => state.buddies)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const shareReplies = useBuddies((state) => state.shareReplies)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const visits = useConversations((state) => state.conversations)
  const contacts = useContacts((state) => state.contacts)
  const today = useToday()

  return buildTogetherWithBuddies({
    buddies: buddies.filter((buddy) => buddy.status === 'active'),
    incomingShares,
    dayPlans,
    visits,
    contacts,

    replyFor: (inboxId, key) =>
      started
        ? shareReplies[buddiesEngine.shareIdForKey(key)]?.[inboxId]
        : undefined,
    today,
  })
}
