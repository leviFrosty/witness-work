import { useEffect } from 'react'
import { AppState } from 'react-native'
import * as Crypto from 'expo-crypto'
import * as Notifications from 'expo-notifications'
import { logger } from '@/lib/logger'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import useServiceReport from '@/stores/serviceReport'
import { navigationRef } from '@/features/contacts/lib/linking'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { refreshBuddyAvatarThumbnail } from '@/features/buddies/lib/buddyProfile'
import {
  forgetBuddiesInData,
  reconcileLinkedPlans,
} from '@/features/buddies/lib/linkedPlans'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import { Buddy, incomingShareKey } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { requestNotificationsPopover } from '@/features/buddies/stores/notificationsPopover'
import type { DayPlan } from '@/types/timeEntry'

const SYNC_INTERVAL_MS = 10 * 60 * 1000
const PUBLISH_DEBOUNCE_MS = 30 * 1000

const logFailure = (error: unknown) =>
  logger.warn('[buddies] background', error)

/**
 * The push kind of a Buddies push (they carry a `ww` marker and no user
 * content), or null for any other notification.
 */
function buddiesPushKind(
  notification: Notifications.Notification
): string | null {
  const trigger = notification.request.trigger as {
    type?: string
    payload?: Record<string, unknown>
  } | null
  const payload = trigger?.type === 'push' ? trigger.payload : undefined
  const data = notification.request.content.data as
    | Record<string, unknown>
    | undefined
  const marker = payload?.ww ?? data?.ww
  if (typeof marker !== 'object' || marker === null) return null
  const { kind } = marker as { kind?: unknown }
  return typeof kind === 'string' ? kind : ''
}

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

/**
 * The background half of Buddies. Renders nothing; runs only once the User has
 * started using Buddies (an inbox exists), so everyone else pays no network or
 * battery cost. Pulls on foreground rather than polling, and publishes a Buddy
 * Card and shared Plans only after the data behind them changes.
 */
export default function BuddiesRuntime() {
  const enabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const running = enabled && started

  useEffect(() => {
    if (!running) return
    let publishTimer: ReturnType<typeof setTimeout> | null = null

    const publishNow = () => {
      if (publishTimer) clearTimeout(publishTimer)
      publishTimer = null
      void buddiesEngine.publishCards().catch(logFailure)
      void buddiesEngine.publishShares().catch(logFailure)
      void buddiesEngine.deliverReplies().catch(logFailure)
    }
    const syncIfStale = () => {
      if (Date.now() - useBuddies.getState().lastSyncAt < SYNC_INTERVAL_MS)
        return
      void buddiesEngine.sync().catch(logFailure)
      void registerBuddiesPush().catch(logFailure)
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
    syncIfStale()
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        buddiesEngine.expire()
        syncIfStale()
      } else if (state === 'background' && publishTimer) publishNow()
    })
    const plans = useServiceReport.subscribe((state, previous) => {
      if (
        state.dayPlans === previous.dayPlans &&
        state.recurringPlans === previous.recurringPlans
      )
        return
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
        if (buddiesPushKind(notification) !== null)
          void buddiesEngine.sync().catch(logFailure)
      }
    )
    const tapped = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const kind = buddiesPushKind(response.notification)
        if (kind === null) return
        void buddiesEngine.sync().catch(logFailure)
        if (!navigationRef.isReady()) return
        // Requests and new pairings live on the Buddies tab; invitations,
        // changes, and replies in the notification queue.
        if (kind === 'invite.claimed' || kind === 'pair.confirmed' || !kind)
          navigationRef.navigate('Root', { screen: 'Buddies' } as never)
        else {
          navigationRef.navigate('Root', { screen: 'Home' } as never)
          requestNotificationsPopover()
        }
      }
    )

    return () => {
      if (publishTimer) clearTimeout(publishTimer)
      appState.remove()
      plans()
      profile()
      tenure()
      visits()
      contacts()
      buddies()
      received.remove()
      tapped.remove()
    }
  }, [running])

  return null
}
