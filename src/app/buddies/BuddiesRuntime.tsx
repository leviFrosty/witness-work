import { isApplyingRemoteData } from '@/lib/remoteDataMutation'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import * as Crypto from 'expo-crypto'
import * as Notifications from 'expo-notifications'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { buddiesPushData } from '@/lib/notificationData'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import useServiceReport from '@/stores/serviceReport'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import {
  buddyNotificationIdForSeq,
  syncBuddyNotifications,
} from '@/features/buddies/hooks/useBuddyNotifications'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { refreshBuddyAvatarThumbnail } from '@/features/buddies/lib/buddyProfile'
import {
  forgetBuddiesInData,
  reconcileLinkedPlans,
} from '@/features/buddies/lib/linkedPlans'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import { Buddy, incomingShareKey } from '@/features/buddies/lib/state'
import { BUDDY_PUSH_KINDS } from '@/features/buddies/lib/engine'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
import type { DayPlan } from '@/types/timeEntry'

/** Returning to the app syncs, but not more often than this. */
const FOREGROUND_SYNC_FLOOR_MS = 30 * 1000
/** While the notifications tray is open, buddy events are checked this often. */
const OPEN_TRAY_REFRESH_MS = 90 * 1000
/**
 * Push registration is checked at most this often; the engine only re-sends an
 * unchanged one once a day.
 */
const PUSH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const PUBLISH_DEBOUNCE_MS = 30 * 1000

const logFailure = (error: unknown) =>
  logger.warn('[buddies] background', error)

/** Adds, updates, and removes the Plans that follow buddies' invitations. */
function syncLinkedPlans() {
  const report = useServiceReport.getState()
  const { add, update, remove } = reconcileLinkedPlans(
    report.dayPlans,
    Object.values(useBuddies.getState().incomingShares),
    () => Crypto.randomUUID()
  )
  for (const plan of add) report.addDayPlan(plan)
  for (const plan of update) report.updateDayPlan(plan)
  for (const id of remove) report.deleteDayPlan(id)
}

/**
 * Deleting a Plan that follows a buddy's invitation means "Can't make it" —
 * otherwise the buddy's next change would bring it back.
 */
function declineDeletedLinkedPlans(previous: DayPlan[], current: DayPlan[]) {
  const remaining = new Set(current.map((plan) => plan.id))
  for (const plan of previous) {
    if (!plan.buddyShare || remaining.has(plan.id)) continue
    const key = incomingShareKey(plan.buddyShare.from, plan.buddyShare.shareId)
    if (useBuddies.getState().incomingShares[key]?.status !== 'going') continue
    // Saved at once, so reconciling won't bring the Plan back; sent when online.
    void buddiesEngine.replyToShare(key, 'declined').catch(logFailure)
  }
}

/**
 * A buddy who is gone (removed, left, or delete-all) is taken off this User's
 * Plans and Follow-ups, so pairing again later never re-sends old invitations,
 * and Plans that followed their invitations become ordinary Plans.
 */
function forgetRemovedBuddies(previous: Buddy[], current: Buddy[]) {
  const remaining = new Set(current.map((buddy) => buddy.inboxId))
  const removed = new Set(
    previous.map((b) => b.inboxId).filter((id) => !remaining.has(id))
  )
  if (removed.size === 0) return
  const report = useServiceReport.getState()
  const visits = useConversations.getState()
  const changes = forgetBuddiesInData(
    report.dayPlans,
    visits.conversations,
    removed
  )
  for (const plan of changes.dayPlans) report.updateDayPlan(plan)
  for (const visit of changes.visits) visits.updateConversation(visit)
}

/** A push kind as a bounded analytics value. */
const pushKindProperty = (kind: string) =>
  (BUDDY_PUSH_KINDS as readonly string[]).includes(kind) ? kind : 'unknown'

/**
 * A Buddies push arrived while the app is open: pull the event it announced,
 * and record whether that reached the tray (kind and outcome only).
 */
function syncAfterPush(push: { kind: string; seq?: number }) {
  const kind = pushKindProperty(push.kind)
  analytics.capture('buddies_push_received', { kind })
  void buddiesEngine.sync().then(
    () =>
      analytics.capture('buddies_push_sync', {
        kind,
        outcome: 'synced',
        ...(push.seq === undefined
          ? {}
          : { in_tray: buddyNotificationIdForSeq(push.seq) !== null }),
      }),
    (error: unknown) => {
      logFailure(error)
      analytics.capture('buddies_push_sync', {
        kind,
        outcome: 'failed',
        reason: buddiesFailureReason(error),
      })
    }
  )
}

/**
 * The background half of Buddies. Renders nothing; runs only once the User has
 * started using Buddies (an inbox exists), so everyone else pays no network or
 * battery cost. Pulls on launch and on every return to the app, and every 90
 * seconds while the notifications tray is open; publishes a Buddy Card and
 * shared Plans only after the data behind them changes.
 */
export default function BuddiesRuntime() {
  const enabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const running = enabled && started

  useEffect(() => {
    if (!running) return
    let publishTimer: ReturnType<typeof setTimeout> | null = null
    let trayTimer: ReturnType<typeof setInterval> | null = null
    let lastSyncAttempt = 0
    let lastPushCheck = 0

    const publishNow = () => {
      if (publishTimer) clearTimeout(publishTimer)
      publishTimer = null
      void buddiesEngine.publishCards().catch(logFailure)
      void buddiesEngine.publishShares().catch(logFailure)
      void buddiesEngine.deliverReplies().catch(logFailure)
    }
    const syncNow = () => {
      const last = Math.max(lastSyncAttempt, useBuddies.getState().lastSyncAt)
      if (Date.now() - last < FOREGROUND_SYNC_FLOOR_MS) return
      lastSyncAttempt = Date.now()
      void buddiesEngine.sync().catch(logFailure)
    }
    const checkPushRegistration = () => {
      if (Date.now() - lastPushCheck < PUSH_CHECK_INTERVAL_MS) return
      lastPushCheck = Date.now()
      void registerBuddiesPush().catch(logFailure)
    }
    const refreshWhileTrayOpen = (open: boolean) => {
      if (trayTimer) clearInterval(trayTimer)
      trayTimer = open
        ? setInterval(() => {
            if (AppState.currentState === 'active')
              void syncBuddyNotifications('poll')
          }, OPEN_TRAY_REFRESH_MS)
        : null
    }

    const schedulePublish = () => {
      if (publishTimer) clearTimeout(publishTimer)
      publishTimer = setTimeout(publishNow, PUBLISH_DEBOUNCE_MS)
    }
    const refreshAvatar = () =>
      refreshBuddyAvatarThumbnail().catch((error) => {
        logFailure(error)
        return false
      })

    void refreshAvatar().then((changed) => {
      if (changed) schedulePublish()
    })
    syncNow()
    checkPushRegistration()
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        buddiesEngine.expire()
        syncNow()
        checkPushRegistration()
      } else if (state === 'background' && publishTimer) publishNow()
    })
    refreshWhileTrayOpen(useNotificationsTray.getState().open)
    const tray = useNotificationsTray.subscribe((state, previous) => {
      if (state.open !== previous.open) refreshWhileTrayOpen(state.open)
    })
    const plans = useServiceReport.subscribe((state, previous) => {
      if (
        state.dayPlans === previous.dayPlans &&
        state.recurringPlans === previous.recurringPlans
      )
        return
      if (!isApplyingRemoteData())
        declineDeletedLinkedPlans(previous.dayPlans, state.dayPlans)
      schedulePublish()
    })
    // Name, photo, and Tenure travel in Buddy Cards too.
    const profile = useProfile.subscribe((state, previous) => {
      if (state.name !== previous.name) schedulePublish()
      if (state.avatar !== previous.avatar)
        void refreshAvatar().then(schedulePublish)
    })
    const tenure = usePreferences.subscribe((state, previous) => {
      if (
        state.role !== previous.role ||
        state.tenureStartDate !== previous.tenureStartDate
      )
        schedulePublish()
    })
    // Follow-up invitations carry the Visit's date and topic and the
    // Contact's first name and address.
    const visits = useConversations.subscribe((state, previous) => {
      if (state.conversations !== previous.conversations) schedulePublish()
    })
    const contacts = useContacts.subscribe((state, previous) => {
      if (state.contacts !== previous.contacts) schedulePublish()
    })
    syncLinkedPlans()
    const buddies = useBuddies.subscribe((state, previous) => {
      if (state.buddies !== previous.buddies)
        forgetRemovedBuddies(previous.buddies, state.buddies)
      if (state.incomingShares !== previous.incomingShares) syncLinkedPlans()
    })
    const received = Notifications.addNotificationReceivedListener(
      (notification) => {
        const push = buddiesPushData(notification)
        if (push) syncAfterPush(push)
      }
    )
    return () => {
      if (publishTimer) clearTimeout(publishTimer)
      if (trayTimer) clearInterval(trayTimer)
      appState.remove()
      tray()
      plans()
      profile()
      tenure()
      visits()
      contacts()
      buddies()
      received.remove()
    }
  }, [running])

  return null
}
