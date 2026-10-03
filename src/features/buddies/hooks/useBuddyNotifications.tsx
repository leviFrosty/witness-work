import { useNavigation } from '@react-navigation/native'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import useConversations from '@/stores/conversationStore'
import { useServiceReport } from '@/stores/serviceReport'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddyNotificationRow from '@/features/buddies/components/BuddyNotificationRow'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { effectiveShareStatus } from '@/features/buddies/lib/linkedPlans'
import { followUpShareKey, planShareKey } from '@/features/buddies/lib/shares'
import {
  awaitsAnswer,
  notificationIdForSeq,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddyTraySync } from '@/features/buddies/stores/buddyTraySync'

/**
 * Why the tray checked: it opened, the User tapped Try Again, or a periodic
 * refresh while it's open (which stays quiet unless it changes the outcome).
 */
export type BuddyTraySyncTrigger = 'open' | 'retry' | 'poll'

/** Pulls new buddy events for the tray, tracking how the check went. */
export async function syncBuddyNotifications(
  trigger: BuddyTraySyncTrigger = 'open'
) {
  // Opening the tray never starts Buddies; that's the Buddies screen's job.
  if (useBuddies.getState().registeredInboxId === null) return
  const startedAt = Date.now()
  if (trigger !== 'poll') useBuddyTraySync.setState({ syncing: true })
  try {
    await buddiesEngine.sync()
    useBuddyTraySync.setState({ syncing: false, failedAt: null })
  } catch (error) {
    // Publishing can fail after the inbox was read; the tray is still current.
    if (useBuddies.getState().lastSyncAt >= startedAt) {
      useBuddyTraySync.setState({ syncing: false, failedAt: null })
      return
    }
    logger.warn('[buddies] notifications sync', error)
    useBuddyTraySync.setState({ syncing: false, failedAt: Date.now() })
    if (trigger !== 'poll')
      analytics.capture('buddies_tray_sync_failed', {
        trigger,
        reason: buddiesFailureReason(error),
      })
  }
}

/**
 * The tray's Buddies check: `syncing` while one it asked for runs, `failed`
 * until any sync succeeds, and a Try Again action.
 */
export function useBuddyTraySyncStatus() {
  const enabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const lastSyncAt = useBuddies((state) => state.lastSyncAt)
  const syncing = useBuddyTraySync((state) => state.syncing)
  const failedAt = useBuddyTraySync((state) => state.failedAt)
  const retry = () => {
    analytics.capture('buddies_tray_sync_retry_tapped')
    void syncBuddyNotifications('retry')
  }
  if (!enabled || !started) return { state: 'idle' as const, retry }
  const state = syncing
    ? ('syncing' as const)
    : failedAt !== null && lastSyncAt < failedAt
      ? ('failed' as const)
      : ('idle' as const)
  return { state, retry }
}

/**
 * The tray item id for the queue entry a Buddies push's relay event (`ww.seq`)
 * produced, or null when that event made no entry or a later one replaced it.
 * Tray item ids are the queue entry ids.
 */
export function buddyNotificationIdForSeq(seq: number): string | null {
  return notificationIdForSeq(useBuddies.getState().notifications, seq)
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
    const share =
      entry.kind !== 'shareReply' && entry.shareKey
        ? incomingShares[entry.shareKey]
        : undefined
    // Answered on another device: the linked Plan already exists.
    const answered =
      !!share && effectiveShareStatus(share, dayPlans) !== 'pending'
    const needsAnswer =
      awaitsAnswer(entry, { incomingClaims, incomingShares }) && !answered
    return {
      id: entry.id,
      kind: 'buddies',
      at: entry.at,
      title: entry.name,
      sticky: needsAnswer,
      onView: () => buddiesEngine.markNotificationRead(entry.id),
      onDismiss: () => buddiesEngine.dismissNotification(entry.id),
      render: ({ unread, dismiss, closeThen, trackAction }) => (
        <BuddyNotificationRow
          entry={entry}
          unread={unread}
          // Answering is what clears a request; it can't be dismissed.
          onDismiss={needsAnswer ? undefined : dismiss}
          onAction={trackAction}
          onPress={target ? () => closeThen(target) : undefined}
        />
      ),
    }
  })
}
