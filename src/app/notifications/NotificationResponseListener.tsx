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
import { weekPlanSources } from '@/lib/weekPlanReminders'
import { currentServiceStreak } from '@/lib/currentServiceStreak'
import { streakRemindersOn } from '@/lib/serviceStreak'
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
import { takeHandedOffNotificationResponse } from '@/app/launch/reloadHandoff'

type Pending =
  | { type: 'reminder'; reminder: ReminderData }
  | {
      type: 'buddies'
      push: BuddiesPushData

      synced: Promise<void>
    }

const RETRY_MS = 300
const MAX_RETRIES = 20

const BADGE_SYNC_WAIT_MS = 5000

const handled = new Set<string>()

const opensBuddiesTab = (kind: string) =>
  kind === 'invite.claimed' || kind === 'pair.confirmed' || !kind

const opensBadgePush = (push: BuddiesPushData) =>
  (push.kind === BADGE_PUSH_KIND || push.kind === BADGE_REACTION_PUSH_KIND) &&
  push.seq !== undefined

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

function openTray() {
  navigationRef.navigate('Root', { screen: 'Home' } as never, { pop: true })
  requestNotificationsTray()
}

function settledWithin(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

function markReminderSeen(target: ReminderData) {
  const prefs = usePreferences.getState()
  const records = useServiceReport.getState()
  const ids = reminderOccurrences({
    contacts: useContacts.getState().contacts,
    visits: useConversations.getState().conversations,
    plans: records.dayPlans,
    recurringPlans: records.recurringPlans,
    unloggedDays: unloggedDaySources(records, prefs),
    streak: streakRemindersOn(prefs) ? currentServiceStreak() : undefined,
    weekPlan: weekPlanSources(records, prefs),
    visitOffset: {
      ...DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
      ...prefs.returnVisitNotificationOffset,
    },
    planOffset: {
      ...DEFAULT_PLAN_NOTIFICATION_OFFSET,
      ...prefs.planNotificationOffset,
    },
  })
    .filter(
      (r) =>
        r.kind === target.kind &&
        r.targetId === target.id &&
        r.day === target.day
    )
    .map(reminderTrayId)
  markSeen(ids)
}

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

        const synced = syncBuddyNotifications('open', push.seq)
        setPending({ type: 'buddies', push, synced })
      }
      setRetry(0)
    }

    const initial =
      Notifications.getLastNotificationResponse() ??
      takeHandedOffNotificationResponse()
    if (initial) accept(initial, true)
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => accept(response, false)
    )
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!pending) return

    if (!onboarded || takingOver) return

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

    if (!routed) openTray()

    setPending(null)
  }, [pending, retry, buddiesEnabled, onboarded, takingOver])

  return null
}
