import { useEffect } from 'react'
import { AppState } from 'react-native'
import * as Application from 'expo-application'
import * as Crypto from 'expo-crypto'
import * as Notifications from 'expo-notifications'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { navigationRef } from '@/features/contacts/lib/linking'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import type { BuddyPushKind } from '@/features/buddies/lib/engine'
import type { PushTemplate } from '@/features/buddies/lib/relay'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { reconcileLinkedPlans } from '@/features/buddies/lib/linkedPlans'
import { incomingShareKey } from '@/features/buddies/lib/state'
import type { DayPlan } from '@/types/timeEntry'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const SYNC_INTERVAL_MS = 10 * 60 * 1000
const PUBLISH_DEBOUNCE_MS = 30 * 1000

const logFailure = (error: unknown) =>
  logger.warn('[buddies] background', error)

/** Buddies pushes carry a `ww` marker and no user content. */
function isBuddiesPush(notification: Notifications.Notification): boolean {
  const trigger = notification.request.trigger as {
    type?: string
    payload?: Record<string, unknown>
  } | null
  const payload = trigger?.type === 'push' ? trigger.payload : undefined
  const data = notification.request.content.data as
    | Record<string, unknown>
    | undefined
  return typeof (payload?.ww ?? data?.ww) === 'object'
}

/** Localized once per device; the relay fills pushes with no user content. */
const pushTemplates = (): Record<BuddyPushKind, PushTemplate> => ({
  'invite.claimed': {
    title: i18n.t('buddies_pushInviteClaimedTitle'),
    body: i18n.t('buddies_pushInviteClaimedBody'),
  },
  'pair.confirmed': {
    title: i18n.t('buddies_pushPairConfirmedTitle'),
    body: i18n.t('buddies_pushPairConfirmedBody'),
  },
  'plan.invite': {
    title: i18n.t('buddies_pushPlanInviteTitle'),
    body: i18n.t('buddies_pushPlanInviteBody'),
  },
  'plan.update': {
    title: i18n.t('buddies_pushPlanUpdateTitle'),
    body: i18n.t('buddies_pushPlanUpdateBody'),
  },
  'plan.cancel': {
    title: i18n.t('buddies_pushPlanCancelTitle'),
    body: i18n.t('buddies_pushPlanCancelBody'),
  },
  'followup.invite': {
    title: i18n.t('buddies_pushFollowUpInviteTitle'),
    body: i18n.t('buddies_pushFollowUpInviteBody'),
  },
  'followup.update': {
    title: i18n.t('buddies_pushFollowUpUpdateTitle'),
    body: i18n.t('buddies_pushFollowUpUpdateBody'),
  },
  'followup.cancel': {
    title: i18n.t('buddies_pushFollowUpCancelTitle'),
    body: i18n.t('buddies_pushFollowUpCancelBody'),
  },
  'share.reply': {
    title: i18n.t('buddies_pushShareReplyTitle'),
    body: i18n.t('buddies_pushShareReplyBody'),
  },
})

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

async function registerPush() {
  const permission = await Notifications.getPermissionsAsync()
  if (!permission.granted) return
  const token = await Notifications.getDevicePushTokenAsync()
  const environment =
    await Application.getIosPushNotificationServiceEnvironmentAsync()
  await buddiesEngine.registerPush({
    apnsToken: String(token.data),
    // Dev-client and simulator builds talk to the APNs sandbox.
    apnsEnvironment: environment === 'production' ? 'production' : 'sandbox',
    templates: pushTemplates(),
  })
}

/**
 * The background half of Buddies. Renders nothing; runs only once the User has
 * started using Buddies (an inbox exists), so everyone else pays no network or
 * battery cost. Pulls on foreground rather than polling, and publishes a Buddy
 * Card only after Plans change.
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
    const schedulePublish = () => {
      if (publishTimer) clearTimeout(publishTimer)
      publishTimer = setTimeout(publishNow, PUBLISH_DEBOUNCE_MS)
    }
    const syncIfStale = () => {
      if (Date.now() - useBuddies.getState().lastSyncAt < SYNC_INTERVAL_MS)
        return
      void buddiesEngine.sync().catch(logFailure)
      void registerPush().catch(logFailure)
    }

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
    // Follow-up invitations carry the Visit's date and topic and the
    // Contact's first name and address.
    const visits = useConversations.subscribe((state, previous) => {
      if (state.conversations !== previous.conversations) schedulePublish()
    })
    const contacts = useContacts.subscribe((state, previous) => {
      if (state.contacts !== previous.contacts) schedulePublish()
    })
    syncLinkedPlans()
    const invitations = useBuddies.subscribe((state, previous) => {
      if (state.incomingShares !== previous.incomingShares) syncLinkedPlans()
    })
    const received = Notifications.addNotificationReceivedListener(
      (notification) => {
        if (isBuddiesPush(notification))
          void buddiesEngine.sync().catch(logFailure)
      }
    )
    const tapped = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (!isBuddiesPush(response.notification)) return
        void buddiesEngine.sync().catch(logFailure)
        if (navigationRef.isReady())
          navigationRef.navigate('BuddyNotifications')
      }
    )

    return () => {
      if (publishTimer) clearTimeout(publishTimer)
      appState.remove()
      plans()
      visits()
      contacts()
      invitations()
      received.remove()
      tapped.remove()
    }
  }, [running])

  return null
}
