import { isApplyingRemoteData } from '@/lib/remoteDataMutation'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import * as Notifications from 'expo-notifications'

import { logger } from '@/lib/logger'
import { buddiesPushData } from '@/lib/notificationData'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import useServiceReport from '@/stores/serviceReport'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { syncBuddyNotifications } from '@/features/buddies/hooks/useBuddyNotifications'

import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { refreshBuddyAvatarThumbnail } from '@/features/buddies/lib/buddyProfile'
import {
  forgetBuddiesInData,
  reconcileLinkedPlans,
  sharesJustAccepted,
  sharesLeftUnlinked,
} from '@/features/buddies/lib/linkedPlans'
import { createLiveInbox } from '@/features/buddies/lib/liveInbox'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import { shareRecipientsKey } from '@/features/buddies/lib/shares'
import { Buddy } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import {
  recordLiveEvent,
  useBuddiesDiagnostics,
} from '@/features/buddies/stores/buddiesDiagnostics'
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

/**
 * Adds, updates, and removes the Plans that follow buddies' invitations.
 * `answered` holds the invitations just answered "Going" here, the only ones
 * whose deleted Plan comes back.
 */
function syncLinkedPlans(answered?: ReadonlySet<string>) {
  const report = useServiceReport.getState()
  const { add, update, remove } = reconcileLinkedPlans(
    report.dayPlans,
    Object.values(useBuddies.getState().incomingShares),
    {
      deletedPlanIds: new Set(report.deletedDayPlans.map((plan) => plan.id)),
      answered,
    }
  )
  for (const plan of add) report.addDayPlan(plan)
  for (const plan of update) report.updateDayPlan(plan)
  for (const id of remove) report.deleteDayPlan(id)
}

/**
 * Deleting a Plan that follows a buddy's invitation means "Can't make it" —
 * otherwise the buddy's next change would bring it back. Removing a duplicate
 * while another Plan still follows the invitation doesn't. The caller skips
 * remote mutations (restores, imports, and Plans another device deleted): the
 * device where the user deleted the Plan answers for them.
 */
function declineDeletedLinkedPlans(previous: DayPlan[], current: DayPlan[]) {
  for (const key of sharesLeftUnlinked(previous, current)) {
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

/**
 * A Buddies push arrived while the app is open: pull the event it announced,
 * and report failures through diagnostics.
 */
function syncAfterPush() {
  void buddiesEngine.sync().catch(logFailure)
}

/** Who this User has invited to what; see `shareRecipientsKey`. */
const currentRecipients = () =>
  shareRecipientsKey(
    useServiceReport.getState().dayPlans,
    useConversations.getState().conversations
  )

/**
 * The background half of Buddies. Renders nothing; runs only once the User has
 * started using Buddies (an inbox exists), so everyone else pays no network or
 * battery cost. Pulls on launch, on every return to the app, and whenever the
 * relay's live signal says the inbox changed while the app is open (plus every
 * 90 seconds while the notifications tray is open). Publishes a Buddy Card and
 * shared Plans after the data behind them changes: at once when who's invited
 * changes, so a buddy sees an invitation as it's sent, otherwise debounced.
 */
export default function BuddiesRuntime() {
  const enabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const running = enabled && started

  useEffect(() => {
    if (!running) return
    let publishTimer: ReturnType<typeof setTimeout> | null = null
    let replyTimer: ReturnType<typeof setTimeout> | null = null
    let trayTimer: ReturnType<typeof setInterval> | null = null
    let lastSyncAttempt = 0
    let lastPushCheck = 0
    let recipients = currentRecipients()

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
    /** Plans or Follow-ups changed: invitations go now, edits can wait. */
    const publishSharesChange = () => {
      const next = currentRecipients()
      if (next === recipients) {
        schedulePublish()
        return
      }
      recipients = next
      publishNow()
    }
    /** Sends each held answer when its wait ends (see `replyHoldMs`). */
    const scheduleHeldReplies = () => {
      if (replyTimer) clearTimeout(replyTimer)
      replyTimer = null
      const now = Date.now()
      // Past-due answers that failed are retried by syncs, not in a loop here.
      const due = Object.values(useBuddies.getState().incomingShares)
        .map((share) => share.replySendAt)
        .filter((at): at is number => at !== undefined && at > now)
      if (due.length === 0) return
      replyTimer = setTimeout(
        () => {
          replyTimer = null
          void buddiesEngine.deliverReplies().catch(logFailure)
        },
        Math.min(...due) - now
      )
    }
    const live = createLiveInbox({
      open: () => buddiesEngine.openLive(),
      syncedSeq: () => useBuddies.getState().syncSeq,
      onChange: () => void buddiesEngine.sync().catch(logFailure),
      onEvent: recordLiveEvent,
    })
    useBuddiesDiagnostics.setState({
      controls: { reconnect: live.reconnect, ping: live.ping },
    })
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
    if (AppState.currentState === 'active') live.start()
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        buddiesEngine.expire()
        syncNow()
        checkPushRegistration()
        live.start()
      } else if (state === 'background') {
        live.stop()
        if (publishTimer) publishNow()
        // A held answer goes out now; the app may not run again for a while.
        void buddiesEngine.sendHeldReplies().catch(logFailure)
      }
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
      publishSharesChange()
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
      if (state.conversations !== previous.conversations) publishSharesChange()
    })
    const contacts = useContacts.subscribe((state, previous) => {
      if (state.contacts !== previous.contacts) schedulePublish()
    })
    syncLinkedPlans()
    scheduleHeldReplies()
    /** Whose requests to join may alert this device. */
    const joinRequestAlerts = (state: ReturnType<typeof useBuddies.getState>) =>
      JSON.stringify([
        state.joinRequestNotifications,
        state.mutedJoinRequests,
        state.buddies
          .filter((buddy) => buddy.status === 'active')
          .map((buddy) => buddy.inboxId),
      ])
    const buddies = useBuddies.subscribe((state, previous) => {
      if (state.buddies !== previous.buddies)
        forgetRemovedBuddies(previous.buddies, state.buddies)
      // A new buddy's requests need their own push template, and a muted
      // buddy's template is dropped.
      if (joinRequestAlerts(state) !== joinRequestAlerts(previous))
        void registerBuddiesPush().catch(logFailure)
      if (state.incomingShares !== previous.incomingShares) {
        syncLinkedPlans(
          sharesJustAccepted(previous.incomingShares, state.incomingShares)
        )
        scheduleHeldReplies()
      }
    })
    const received = Notifications.addNotificationReceivedListener(
      (notification) => {
        const push = buddiesPushData(notification)
        if (push) syncAfterPush()
      }
    )
    return () => {
      if (publishTimer) clearTimeout(publishTimer)
      if (trayTimer) clearInterval(trayTimer)
      if (replyTimer) clearTimeout(replyTimer)
      live.stop()
      useBuddiesDiagnostics.setState({ controls: null })
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
