import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buildTogether } from '@/features/buddies/lib/together'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** What's planned with one buddy, split into unanswered and everything else. */
export default function useBuddyTogether(inboxId: string) {
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const shareReplies = useBuddies((state) => state.shareReplies)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const visits = useConversations((state) => state.conversations)
  const contacts = useContacts((state) => state.contacts)

  return buildTogether({
    inboxId,
    incomingShares,
    dayPlans,
    visits,
    contacts,
    // Deriving a share id reads the identity seed, so only once started.
    replyFor: (key) =>
      started
        ? shareReplies[buddiesEngine.shareIdForKey(key)]?.[inboxId]
        : undefined,
    today: new Date(),
  })
}
