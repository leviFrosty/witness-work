import moment from 'moment'
import useToday from '@/hooks/useToday'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import type { PetVisit } from '@/types/pet'
import { petVisitorsFor } from '@/app/pet/petVisitor'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddySettings } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const NONE: PetVisit[] = []

export default function usePetVisits(): PetVisit[] {
  const enabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies)
  const sharing = useBuddies((state) => state.sharing)
  const shareReplies = useBuddies((state) => state.shareReplies)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const registeredInboxId = useBuddies((state) => state.registeredInboxId)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const visits = useConversations((state) => state.conversations)
  const today = useToday()
  if (!enabled) return NONE

  return petVisitorsFor({
    buddies,
    dayPlans,
    visits,
    incomingShares: Object.values(incomingShares),
    todayKey: moment(today).format('YYYY-MM-DD'),
    now: Date.now(),

    repliesFor: (shareKey) =>
      registeredInboxId !== null
        ? shareReplies[buddiesEngine.shareIdForKey(shareKey)]
        : undefined,
    showsPet: (buddy) => buddySettings(sharing, buddy).settings.petVisits,
  })
}
