import { useNavigation } from '@react-navigation/native'
import { logger } from '@/lib/logger'
import useConversations from '@/stores/conversationStore'
import { useServiceReport } from '@/stores/serviceReport'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddyNotificationRow from '@/features/buddies/components/BuddyNotificationRow'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { followUpShareKey, planShareKey } from '@/features/buddies/lib/shares'
import type {
  BuddiesState,
  BuddyNotification,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Entries that still need an answer survive "Clear All". */
function needsAnswer(
  entry: BuddyNotification,
  state: Pick<BuddiesState, 'incomingClaims' | 'incomingShares'>
) {
  if (entry.kind === 'claim')
    return state.incomingClaims.some((c) => c.inviteId === entry.inviteId)
  if (entry.kind === 'shareInvite' || entry.kind === 'shareUpdate')
    return state.incomingShares[entry.shareKey ?? '']?.status === 'pending'
  return false
}

/** Pulls new buddy events, e.g. when the tray opens. */
export function syncBuddyNotifications() {
  void buddiesEngine
    .sync()
    .catch((error) => logger.warn('[buddies] notifications sync', error))
}

/**
 * The buddy notification queue as tray items: invitations, changes,
 * cancellations, replies, and new pairings. Only once the User has started
 * using Buddies.
 */
export default function useBuddyNotifications(): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const notifications = useBuddies((state) => state.notifications)
  const buddies = useBuddies((state) => state.buddies)
  const incomingClaims = useBuddies((state) => state.incomingClaims)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const visits = useConversations((state) => state.conversations)
  if (!enabled || !started) return []

  /** A reply opens the Plan or Contact it's about. */
  const replyTarget = (shareId: string) => {
    const plan = dayPlans.find(
      (candidate) =>
        candidate.buddies?.length &&
        buddiesEngine.shareIdForKey(planShareKey(candidate.id)) === shareId
    )
    if (plan)
      return () =>
        navigation.navigate('PlanDay', { existingDayPlanId: plan.id })
    const visit = visits.find(
      (candidate) =>
        candidate.followUp?.buddies?.length &&
        buddiesEngine.shareIdForKey(followUpShareKey(candidate.id)) === shareId
    )
    if (visit)
      return () =>
        navigation.navigate('Contact Details', { id: visit.contact.id })
    return undefined
  }

  /** A new pairing opens that buddy, while they're still a buddy. */
  const buddyTarget = (inboxId: string) =>
    buddies.some((b) => b.inboxId === inboxId)
      ? () => navigation.navigate('Buddy', { inboxId })
      : undefined

  return notifications.map((entry) => {
    const target =
      entry.kind === 'shareReply' && entry.shareKey
        ? replyTarget(entry.shareKey)
        : entry.kind === 'paired' && entry.from
          ? buddyTarget(entry.from)
          : undefined
    return {
      id: entry.id,
      kind: 'buddies',
      at: entry.at,
      title: entry.name,
      sticky: needsAnswer(entry, { incomingClaims, incomingShares }),
      onDismiss: () => buddiesEngine.dismissNotification(entry.id),
      render: ({ unread, dismiss, closeThen }) => (
        <BuddyNotificationRow
          entry={entry}
          unread={unread}
          onDismiss={dismiss}
          onPress={target ? () => closeThen(target) : undefined}
        />
      ),
    }
  })
}
