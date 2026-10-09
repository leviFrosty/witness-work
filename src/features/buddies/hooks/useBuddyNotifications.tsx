import { useNavigation } from '@react-navigation/native'
import useNow from '@/hooks/useNow'
import moment from 'moment'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { storedDayKey } from '@/lib/normalizeDate'
import type { PlannedDayContribution } from '@/lib/recurrence'
import { useServiceReport } from '@/stores/serviceReport'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddyNewsRow from '@/features/buddies/components/BuddyNewsRow'
import BuddyNotificationRow from '@/features/buddies/components/BuddyNotificationRow'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddyNews, isBuddyNews } from '@/features/buddies/lib/badgeNews'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  findJoinRequestPlan,
  joinRequestInvite,
} from '@/features/buddies/lib/joinRequests'
import sendJoinRequestInvite from '@/features/buddies/lib/sendJoinRequestInvite'
import {
  effectiveShareStatus,
  isOpenPlanInvitation,
} from '@/features/buddies/lib/linkedPlans'
import { holdsBadge, sharedBadgeKey } from '@/features/buddies/lib/sharedBadges'
import { followUpShareKey, planShareKey } from '@/features/buddies/lib/shares'
import {
  awaitsAnswer,
  type BuddyNotification,
  listedNotifications,
  notificationIdForSeq,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddyTraySync } from '@/features/buddies/stores/buddyTraySync'

/**
 * Why the tray checked: it opened, the User tapped Try Again, or a periodic
 * refresh while it's open (which stays quiet unless it changes the outcome).
 */
export type BuddyTraySyncTrigger = 'open' | 'retry' | 'poll'

/**
 * Pulls new buddy events for the tray, tracking how the check went. A poll is
 * automatic, so it waits out the relay's back-off; opening the tray and Try
 * Again don't. `minSeq` (a tapped push's event) skips a sync already past it.
 */
export async function syncBuddyNotifications(
  trigger: BuddyTraySyncTrigger = 'open',
  minSeq?: number
): Promise<void> {
  // Opening the tray never starts Buddies; that's the Buddies screen's job.
  if (useBuddies.getState().registeredInboxId === null) return
  const startedAt = Date.now()
  if (trigger !== 'poll') useBuddyTraySync.setState({ syncing: true })
  try {
    const outcome = await buddiesEngine.sync({
      automatic: trigger === 'poll',
      minSeq,
    })
    // Nothing ran (waiting out the relay's back-off): nothing new to say.
    useBuddyTraySync.setState(
      outcome === 'skipped'
        ? { syncing: false }
        : { syncing: false, failedAt: null }
    )
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
 * The tray entry and buddy a `badge.new` push (by its relay event, `ww.seq`) is
 * about, once the event has synced and while they're still a buddy; marks the
 * entry read. Null otherwise, so the caller can fall back to the tray.
 */
export function openBadgePush(
  seq: number | undefined
): { id: string; inboxId: string } | null {
  if (seq === undefined || !usePreferences.getState().showBadges) return null
  const { notifications, buddies } = useBuddies.getState()
  const entry = notifications.find((n) => n.seq === seq && n.kind === 'badge')
  const inboxId = entry?.from
  if (!entry || !inboxId || !buddies.some((b) => b.inboxId === inboxId))
    return null
  buddiesEngine.markNotificationRead(entry.id)
  return { id: entry.id, inboxId }
}

/**
 * The tray entry and badge a `badge.reaction` push (by its relay event,
 * `ww.seq`) is about, once the event has synced; marks the entry read. Null
 * otherwise (a newer reaction replaced it, say), so the caller can fall back to
 * the tray.
 */
export function openBadgeReactionPush(
  seq: number | undefined
): { id: string; badgeKey: string } | null {
  if (seq === undefined || !usePreferences.getState().showBadges) return null
  const entry = useBuddies
    .getState()
    .notifications.find((n) => n.seq === seq && n.kind === 'badgeReaction')
  const badge = entry?.badges?.[0]
  if (!entry || !badge) return null
  buddiesEngine.markNotificationRead(entry.id)
  return { id: entry.id, badgeKey: sharedBadgeKey(badge) }
}

/**
 * The buddy notification queue as tray items: invitations, changes,
 * cancellations, replies, requests to join, and new pairings, then buddies'
 * news (their new badges, and reactions to this User's badges) while badges are
 * on. News is social: it's grouped apart and never counts (ADR 0021), and only
 * an active buddy's shows. Only once the User has started using Buddies.
 */
export default function useBuddyNotifications(): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const queue = useBuddies((state) => state.notifications)
  const showBadges = usePreferences((state) => state.showBadges)
  const buddies = useBuddies((state) => state.buddies)
  const incomingClaims = useBuddies((state) => state.incomingClaims)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const joinRequests = useBuddies((state) => state.joinRequests)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const visits = useConversations((state) => state.conversations)
  const { now } = useNow()
  if (!enabled || !started) return []

  /** A reply opens the Plan or Contact it's about. */
  const replyTarget = (shareId: string) => {
    const plan = dayPlans.find(
      (candidate) =>
        candidate.buddies?.length &&
        buddiesEngine.shareIdForKey(planShareKey(candidate.id)) === shareId
    )
    if (plan)
      return () => navigation.navigate('Plan Details', { dayPlanId: plan.id })
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

  /** A request to join opens the Plan it's about. */
  const planTarget = (match: PlannedDayContribution, d: string) =>
    match.source === 'day'
      ? () => navigation.navigate('Plan Details', { dayPlanId: match.plan.id })
      : () =>
          navigation.navigate('Plan Details', {
            recurringPlanId: match.plan.id,
            date: moment(d, 'YYYY-MM-DD').hour(12).toISOString(),
          })

  /** A buddy's Plan invitation opens it, answered or not, while it's open. */
  const invitationTarget = (shareKey: string) => {
    const share = incomingShares[shareKey]
    if (!isOpenPlanInvitation(share, now)) return undefined
    const { from, shareId } = share
    return () =>
      navigation.navigate('Plan Details', { share: { from, shareId } })
  }

  /** A new pairing opens that buddy, while they're still a buddy. */
  const buddyTarget = (inboxId: string) =>
    buddies.some((b) => b.inboxId === inboxId)
      ? () => navigation.navigate('Buddy', { inboxId })
      : undefined

  // Entries keep the name they arrived with; a nickname given since applies.
  const buddyName = (entry: BuddyNotification) => {
    const buddy = buddies.find((b) => b.inboxId === entry.from)
    return buddy ? buddyDisplayName(buddy) : entry.name
  }

  const listed = listedNotifications(queue, { showBadges })

  // Buddies' news opens the badge it's about: theirs, or the one of this
  // User's they reacted to. "New" while the row was unread.
  const news = buddyNews(listed).flatMap(
    ({ entry, ids }): NotificationItem[] => {
      const buddy = buddies.find(
        (b) => b.inboxId === entry.from && b.status === 'active'
      )
      const [lead] = entry.badges ?? []
      if (!buddy || !lead) return []
      const theirs = entry.kind === 'badge'
      return [
        {
          id: entry.id,
          kind: 'buddies',
          at: entry.at,
          title: buddyName(entry),
          social: true,
          onView: () => {
            for (const id of ids) buddiesEngine.markNotificationRead(id)
          },
          onDismiss: () => {
            for (const id of ids) buddiesEngine.dismissNotification(id)
          },
          render: ({ unread, dismiss, closeThen }) => (
            <BuddyNewsRow
              entry={entry}
              unread={unread}
              now={now}
              onDismiss={dismiss}
              onOpen={(origin) =>
                closeThen(() =>
                  navigation.navigate('BadgeView', {
                    badgeKey: sharedBadgeKey(lead),
                    owner: theirs ? { inboxId: buddy.inboxId } : 'me',
                    // The tray closes behind the view, taking the coin along.
                    origin: origin && { ...origin, returns: false },
                    isNew: theirs && unread,
                  })
                )
              }
              encourage={
                theirs && holdsBadge(buddy.badges, lead)
                  ? { inboxId: buddy.inboxId, badge: lead }
                  : undefined
              }
            />
          ),
        },
      ]
    }
  )

  const logisticsEntries = listed.filter((entry) => !isBuddyNews(entry))
  const logistics = logisticsEntries.map((entry): NotificationItem => {
    const joinRequest =
      entry.kind === 'joinRequest' && entry.shareKey
        ? joinRequests[entry.shareKey]
        : undefined
    const ownPlan = joinRequest
      ? findJoinRequestPlan(joinRequest, dayPlans, recurringPlans)
      : undefined
    const target =
      entry.kind === 'shareReply' && entry.shareKey
        ? replyTarget(entry.shareKey)
        : entry.kind === 'paired' && entry.from
          ? buddyTarget(entry.from)
          : joinRequest && ownPlan
            ? planTarget(ownPlan, joinRequest.d)
            : (entry.kind === 'shareInvite' || entry.kind === 'shareUpdate') &&
                entry.shareKey
              ? invitationTarget(entry.shareKey)
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
    const invite = joinRequest
      ? joinRequestInvite(joinRequest, dayPlans, recurringPlans)
      : undefined
    // Inviting the buddy to a Plan that day answers the request.
    const invited =
      !!joinRequest &&
      dayPlans.some(
        (plan) =>
          storedDayKey(plan.date) === joinRequest.d &&
          !!plan.buddies?.includes(joinRequest.from)
      )
    return {
      id: entry.id,
      kind: 'buddies',
      at: entry.at,
      title: buddyName(entry),
      sticky: needsAnswer,
      onView: () => buddiesEngine.markNotificationRead(entry.id),
      onDismiss: () => {
        // X, Not Now, and Clear All all pass on a request to join that could
        // have been answered with Invite.
        if (invite?.kind === 'invite' && !invited)
          analytics.capture('buddy_join_request_answered', {
            action: 'not_now',
          })
        buddiesEngine.dismissNotification(entry.id)
      },
      render: ({ unread, dismiss, closeThen }) => (
        <BuddyNotificationRow
          entry={entry}
          unread={unread}
          // Answering is what clears a request; it can't be dismissed.
          onDismiss={needsAnswer ? undefined : dismiss}
          onPress={target ? () => closeThen(target) : undefined}
          ownPlan={ownPlan?.plan}
          invited={invited}
          cantInvite={
            invite?.kind === 'linked'
              ? {
                  reason: 'linked',
                  organizer: buddies.find((b) => b.inboxId === invite.organizer)
                    ?.name,
                }
              : invite?.kind === 'changed'
                ? { reason: 'changed' }
                : undefined
          }
          onInvite={
            invite?.kind === 'invite'
              ? () => sendJoinRequestInvite(invite)
              : undefined
          }
        />
      ),
    }
  })

  return [...logistics, ...news]
}
