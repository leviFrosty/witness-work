import { useEffect, useState } from 'react'
import * as Notifications from 'expo-notifications'
import { navigationRef } from '@/features/contacts/lib/linking'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { syncBuddyNotifications } from '@/features/buddies/hooks/useBuddyNotifications'
import {
  markSeen,
  requestNotificationsTray,
} from '@/features/notifications/stores/notificationsTray'
import { analytics } from '@/lib/analytics'
import {
  buddiesPushData,
  reminderData,
  type BuddiesPushData,
  type ReminderData,
} from '@/lib/notificationData'
import { reminderOccurrences } from '@/lib/reminderSchedule'
import { unloggedDaySources } from '@/lib/unloggedDayReminders'
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
  | { type: 'buddies'; push: BuddiesPushData }

/** How long a Buddies tap waits for the Buddies flag before using the tray. */
const RETRY_MS = 300
const MAX_RETRIES = 20

/** Responses already routed, so a remount doesn't replay the launch tap. */
const handled = new Set<string>()

/** Requests and new pairings live on the Buddies screen. */
const opensBuddiesTab = (kind: string) =>
  kind === 'invite.claimed' || kind === 'pair.confirmed' || !kind

/** The reminder's tray item counts as read once its alert was opened. */
function markReminderSeen(target: ReminderData) {
  const prefs = usePreferences.getState()
  const records = useServiceReport.getState()
  const ids = reminderOccurrences({
    contacts: useContacts.getState().contacts,
    visits: useConversations.getState().conversations,
    plans: records.dayPlans,
    unloggedDays: unloggedDaySources(records, prefs),
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
 * instead of being dropped. Mounted for everyone, not just Buddies users.
 */
export default function NotificationResponseListener() {
  const buddiesEnabled = useBuddiesEnabled()
  const [pending, setPending] = useState<Pending | null>(null)
  const [retry, setRetry] = useState(0)

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
        void syncBuddyNotifications('open')
        setPending({ type: 'buddies', push })
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
    // Navigation is always waited for; the Buddies flag only for a while,
    // since it may never turn on (then the tray takes the tap).
    const waiting =
      !navigationRef.isReady() ||
      (retry < MAX_RETRIES &&
        pending.type === 'buddies' &&
        opensBuddiesTab(pending.push.kind) &&
        !buddiesEnabled)
    if (waiting) {
      const timer = setTimeout(() => setRetry((count) => count + 1), RETRY_MS)
      return () => clearTimeout(timer)
    }
    let routed: boolean
    if (pending.type === 'reminder') {
      routed = openReminderTarget(pending.reminder)
      if (routed) markReminderSeen(pending.reminder)
    } else if (opensBuddiesTab(pending.push.kind) && buddiesEnabled) {
      navigationRef.navigate('Buddies')
      routed = true
    } else routed = false
    if (!routed) {
      // A deleted record or unavailable Buddies: the tray still lists
      // what's current, including Buddies invitations and changes.
      navigationRef.navigate('Root', { screen: 'Home' } as never)
      requestNotificationsTray()
    }

    setPending(null)
  }, [pending, retry, buddiesEnabled])

  return null
}
