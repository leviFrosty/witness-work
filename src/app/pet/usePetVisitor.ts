import moment from 'moment'
import useToday from '@/hooks/useToday'
import useServiceReport from '@/stores/serviceReport'
import type { SharedPet } from '@/types/pet'
import { petVisitorFor } from '@/app/pet/petVisitor'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { planShareKey } from '@/features/buddies/lib/shares'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * The buddy's pet visiting the User's today (`petVisitorFor`), or null: none
 * while Buddies is hidden, and none once the day moves on.
 */
export default function usePetVisitor(): SharedPet | null {
  const enabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies)
  const shareReplies = useBuddies((state) => state.shareReplies)
  const registeredInboxId = useBuddies((state) => state.registeredInboxId)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const today = useToday()
  if (!enabled) return null

  return petVisitorFor({
    buddies,
    dayPlans,
    todayKey: moment(today).format('YYYY-MM-DD'),
    // Deriving a share id reads the identity seed, so only once Buddies is in use.
    repliesFor: (plan) =>
      registeredInboxId !== null
        ? shareReplies[buddiesEngine.shareIdForKey(planShareKey(plan.id))]
        : undefined,
  })
}
