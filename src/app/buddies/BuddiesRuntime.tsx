import { useEffect } from 'react'
import { AppState } from 'react-native'
import * as Application from 'expo-application'
import * as Notifications from 'expo-notifications'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import useServiceReport from '@/stores/serviceReport'
import { navigationRef } from '@/features/contacts/lib/linking'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
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
    templates: {
      'invite.claimed': {
        title: i18n.t('buddies_pushInviteClaimedTitle'),
        body: i18n.t('buddies_pushInviteClaimedBody'),
      },
      'pair.confirmed': {
        title: i18n.t('buddies_pushPairConfirmedTitle'),
        body: i18n.t('buddies_pushPairConfirmedBody'),
      },
    },
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
    }
    const syncIfStale = () => {
      if (Date.now() - useBuddies.getState().lastSyncAt < SYNC_INTERVAL_MS)
        return
      void buddiesEngine.sync().catch(logFailure)
      void registerPush().catch(logFailure)
    }

    syncIfStale()
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncIfStale()
      else if (state === 'background' && publishTimer) publishNow()
    })
    const plans = useServiceReport.subscribe((state, previous) => {
      if (
        state.dayPlans === previous.dayPlans &&
        state.recurringPlans === previous.recurringPlans
      )
        return
      if (publishTimer) clearTimeout(publishTimer)
      publishTimer = setTimeout(publishNow, PUBLISH_DEBOUNCE_MS)
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
        if (navigationRef.isReady()) navigationRef.navigate('Buddies')
      }
    )

    return () => {
      if (publishTimer) clearTimeout(publishTimer)
      appState.remove()
      plans()
      received.remove()
      tapped.remove()
    }
  }, [running])

  return null
}
