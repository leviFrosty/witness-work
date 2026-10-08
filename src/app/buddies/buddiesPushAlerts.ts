import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import {
  alertOutcomeKey,
  recordAlertOutcome,
} from '@/app/buddies/buddiesAlertOutcomes'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  isBuddiesNewsKind,
  pushMarkerOf,
  type BuddiesPushMarker,
  type BuddyAlertOutcome,
} from '@/features/buddies/lib/pushAlerts'
import { buddyAlertText } from '@/features/buddies/lib/pushAlertText'
import {
  BUDDIES_CHANNEL_ID,
  BUDDIES_NEWS_CHANNEL_ID,
  ensureBuddiesChannel,
  ensureBuddiesNewsChannel,
} from '@/features/buddies/lib/pushRegistration'
import { logger } from '@/lib/logger'

/**
 * A push fetches its event when it was too big to ride along; past this the
 * alert goes out with the template text instead.
 */
const DESCRIBE_TIMEOUT_MS = 10 * 1000

type AndroidBuddiesPush = {
  marker: BuddiesPushMarker
  /** The template text, for when the event can't be opened. */
  fallback: { title: string; body?: string } | null
  /**
   * A relay from before named alerts sends `title` and `message`, which
   * expo-notifications shows itself (in the background).
   */
  shownBySystem: boolean
}

/** A Buddies push from FCM's data keys, or null for anything else. */
export function androidBuddiesPush(
  data: Record<string, unknown> | undefined
): AndroidBuddiesPush | null {
  const marker = pushMarkerOf(data)
  if (!marker) return null
  const text = (key: string) => {
    const value = data?.[key]
    return typeof value === 'string' && value ? value : undefined
  }
  const title = text('fallbackTitle')
  const body = text('fallbackBody')
  return {
    marker,
    fallback: title ? { title, ...(body ? { body } : {}) } : null,
    shownBySystem: text('title') !== undefined || text('message') !== undefined,
  }
}

/** FCM's data keys behind a received Android push. */
export function remoteMessageData(
  notification: Notifications.Notification
): Record<string, unknown> | undefined {
  const trigger = notification.request.trigger as {
    remoteMessage?: { data?: Record<string, unknown> }
  } | null
  return trigger?.remoteMessage?.data
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Buddies alert timed out')), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Android: posts the alert for a Buddies push in the `buddies` channel (badge
 * news in the quiet `buddies_news` one). The relay's FCM message has no title,
 * so nothing shows until the app words it: named from the event ("Anna invited
 * you to a Plan"), or with the template text when the event can't be opened.
 * Nothing is posted for a push muted on this device. Runs from the push task in
 * the background and from the received listener in the foreground, where iOS
 * shows alerts too; the same push posted twice replaces itself.
 */
export async function postBuddiesAlert(
  data: Record<string, unknown> | undefined
) {
  if (Platform.OS !== 'android') return
  const push = androidBuddiesPush(data)
  if (!push || push.shownBySystem) return
  let outcome: BuddyAlertOutcome | { failed: 'error' }
  try {
    outcome = await withTimeout(
      buddiesEngine.describePush(push.marker),
      DESCRIBE_TIMEOUT_MS
    )
  } catch (error) {
    logger.warn('[buddies] alert', error)
    outcome = { failed: 'error' }
  }
  recordAlertOutcome(alertOutcomeKey(outcome))
  if ('quiet' in outcome) return
  const content =
    'alert' in outcome ? buddyAlertText(outcome.alert) : push.fallback
  if (!content) return
  const { kind, seq, eventId } = push.marker
  // Badge news goes in its own quiet channel: no sound or heads-up banner.
  const news = isBuddiesNewsKind(kind)
  await (news ? ensureBuddiesNewsChannel() : ensureBuddiesChannel())
  await Notifications.scheduleNotificationAsync({
    identifier: `buddies-${seq ?? eventId ?? Date.now()}`,
    content: {
      title: content.title,
      ...(content.body ? { body: content.body } : {}),
      // Taps route by the same marker as the push.
      data: { ww: { kind, ...(seq === undefined ? {} : { seq }) } },
    },
    trigger: { channelId: news ? BUDDIES_NEWS_CHANNEL_ID : BUDDIES_CHANNEL_ID },
  })
}
