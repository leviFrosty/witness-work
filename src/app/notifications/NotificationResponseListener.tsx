import { useEffect, useState } from 'react'
import * as Notifications from 'expo-notifications'
import { navigationRef } from '@/features/contacts/lib/linking'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import {
  openBadgePush,
  openBadgeReactionPush,
  syncBuddyNotifications,
} from '@/features/buddies/hooks/useBuddyNotifications'
import {
  BADGE_PUSH_KIND,
  BADGE_REACTION_PUSH_KIND,
} from '@/features/buddies/lib/engine'
import {
  markSeen,
  requestNotificationsTray,
} from '@/features/notifications/stores/notificationsTray'
import { useIsTakingOver, useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { analytics } from '@/lib/analytics'
import {
  buddiesPushData,
  reminderData,
  type BuddiesPushData,
  type ReminderData,
} from '@/lib/notificationData'
import { reminderOccurrences } from '@/lib/reminderSchedule'
import { unloggedDaySources } from '@/lib/unloggedDayReminders'
import { currentServiceStreak } from '@/lib/currentServiceStreak'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import {
  DEFAULT_PLAN_NOTIFICATION_OFFSET,
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { openReminderTarget } from '@/app/notifications/reminderTargets'
import { reminderTrayId } from '@/app/notifications/useReminderNotifications'

type Pending =
  | { type: 'reminder'; reminder: ReminderData }
  | {
      type: 'buddies'
      push: BuddiesPushData
      /** The sync fetching what the push announced. */
      synced: Promise<void>
    }

/** How long a Buddies tap waits for the Buddies flag before using the tray. */
const RETRY_MS = 300
const MAX_RETRIES = 20
/** How long a badge tap waits for its event to sync before using the tray. */
const BADGE_SYNC_WAIT_MS = 5000

/** Responses already routed, so a remount doesn't replay the launch tap. */
const handled = new Set<string>()

/** Requests and new pairings live on the Buddies screen. */
const opensBuddiesTab = (kind: string) =>
  kind === 'invite.claimed' || kind === 'pair.confirmed' || !kind

/**
 * A buddy's new badge opens that buddy's page, and a buddy's reaction opens the
 * badge it's about, once its event (found by `seq`) has synced. Without `seq`
 * there's nothing to find it by: the tray takes it.
 */
const opensBadgePush = (push: BuddiesPushData) =>
  (push.kind === BADGE_PUSH_KIND || push.kind === BADGE_REACTION_PUSH_KIND) &&
  push.seq !== undefined

/** Where a badge push leads once its event is here (marked read), or null. */
function badgePushTarget(
  push: BuddiesPushData
): { id: string; open: () => void } | null {
  if (push.kind === BADGE_REACTION_PUSH_KIND) {
    const reaction = openBadgeReactionPush(push.seq)
    return (
      reaction && {
        id: reaction.id,
        open: () =>
          navigationRef.navigate('BadgeView', {
            badgeKey: reaction.badgeKey,
            owner: 'me',
          }),
      }
    )
  }
  const badge = openBadgePush(push.seq)
  return (
    badge && {
      id: badge.id,
      open: () => navigationRef.navigate('Buddy', { inboxId: badge.inboxId }),
    }
  )
}

/** Whatever was tapped: the tray lists what's current. */
function openTray() {
  navigationRef.navigate('Root', { screen: 'Home' } as never, { pop: true })
  requestNotificationsTray()
}

/** Resolves once `work` settles or `ms` pass, whichever is first. */
function settledWithin(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

/** The reminder's tray item counts as read once its alert was opened. */
function markReminderSeen(target: ReminderData) {
  const prefs = usePreferences.getState()
  const records = useServiceReport.getState()
  const ids = reminderOccurrences({
    contacts: useContacts.getState().contacts,
    visits: useConversations.getState().conversations,
    plans: records.dayPlans,
    unloggedDays: unloggedDaySources(records, prefs),
    streak: prefs.streakReminders ? currentServiceStreak() : undefined,
    visitOffset: {
      ...DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
      ...prefs.returnVisitNotificationOffset,
    },
    planOffset: {
      ...DEFAULT_PLAN_NOTIFICATION_OFFSET,
      ...prefs.planNotificationOffset,
    },
  })
    .filter((r) => r.kind === target.kind && r.targetId === target.id)
    .map(reminderTrayId)
  markSeen(ids)
}

/**
 * Routes taps on system notifications — local reminders and Buddies pushes —
 * for every app state. A tap that launched the app is read at startup, and a
 * tap that lands before navigation (or the Buddies flag) is ready waits for it
 * instead of being dropped. It also waits for onboarding and for whatever is
 * taking over the screen (the update reveal, a celebration) to finish, so it
 * never opens a screen underneath one (ADR 0021); until it has, nothing new
 * takes over. Mounted for everyone, not just Buddies users.
 */
export default function NotificationResponseListener() {
  const buddiesEnabled = useBuddiesEnabled()
  const onboarded = usePreferences((s) => s.onboardingComplete)
  const takingOver = useIsTakingOver()
  const [pending, setPending] = useState<Pending | null>(null)
  const [retry, setRetry] = useState(0)
  useTakeoverHold('navigation', pending !== null)

  useEffect(() => {
    const accept = (
      response: Notifications.NotificationResponse,
      coldStart: boolean
    ) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
        return
      const { notification } = response
      const key = `${notification.request.identifier}:${notification.date}`
      if (handled.has(key)) return
      handled.add(key)
      Notifications.clearLastNotificationResponse()
      const reminder = reminderData(notification)
      const push = reminder ? null : buddiesPushData(notification)
      if (reminder) {
        analytics.capture('notification_opened', {
          source: 'local',
          kind: reminder.kind,
          cold_start: coldStart,
        })
        setPending({ type: 'reminder', reminder })
      } else if (push) {
        analytics.capture('notification_opened', {
          source: 'push',
          kind: 'buddies',
          cold_start: coldStart,
        })
        // Fetch what the push announced while the screen opens; the tray
        // shows the check and offers Try Again if it fails.
        const synced = syncBuddyNotifications('open')
        setPending({ type: 'buddies', push, synced })
      }
      setRetry(0)
    }

    const initial = Notifications.getLastNotificationResponse()
    if (initial) accept(initial, true)
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => accept(response, false)
    )
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!pending) return
    // Onboarding and takeovers end on their own; this runs again when they do.
    if (!onboarded || takingOver) return
    // Navigation is always waited for; the Buddies flag only for a while,
    // since it may never turn on (then the tray takes the tap).
    const waiting =
      !navigationRef.isReady() ||
      (retry < MAX_RETRIES &&
        pending.type === 'buddies' &&
        (opensBuddiesTab(pending.push.kind) || opensBadgePush(pending.push)) &&
        !buddiesEnabled)
    if (waiting) {
      const timer = setTimeout(() => setRetry((count) => count + 1), RETRY_MS)
      return () => clearTimeout(timer)
    }
    if (
      pending.type === 'buddies' &&
      opensBadgePush(pending.push) &&
      buddiesEnabled
    ) {
      // The badge's event may still be syncing; the tray takes the tap if it
      // doesn't turn up (or the buddy is gone).
      let cancelled = false
      const { push, synced } = pending
      void (async () => {
        let target = badgePushTarget(push)
        if (!target) {
          await settledWithin(synced, BADGE_SYNC_WAIT_MS)
          if (cancelled) return
          target = badgePushTarget(push)
        }
        if (cancelled) return
        if (target) {
          markSeen([target.id])
          target.open()
        } else openTray()
        setPending(null)
      })()
      return () => {
        cancelled = true
      }
    }
    let routed: boolean
    if (pending.type === 'reminder') {
      routed = openReminderTarget(pending.reminder)
      if (routed) markReminderSeen(pending.reminder)
    } else if (opensBuddiesTab(pending.push.kind) && buddiesEnabled) {
      navigationRef.navigate('Buddies')
      routed = true
    } else routed = false
    // A deleted record or unavailable Buddies: the tray still lists what's
    // current, including Buddies invitations and changes.
    if (!routed) openTray()

    setPending(null)
  }, [pending, retry, buddiesEnabled, onboarded, takingOver])

  return null
}
