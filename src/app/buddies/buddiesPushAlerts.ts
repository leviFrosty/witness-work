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

const DESCRIBE_TIMEOUT_MS = 10 * 1000

type AndroidBuddiesPush = {
  marker: BuddiesPushMarker

  fallback: { title: string; body?: string } | null

  shownBySystem: boolean
}

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

export function remoteMessageData(
  notification: Notifications.Notification
): Record<string, unknown> | undefined {
  const trigger = notification.request.trigger as {
    remoteMessage?: { data?: Record<string, unknown> }
  } | null
  return trigger?.remoteMessage?.data
}

function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  signal?: AbortSignal
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  if (signal?.aborted) controller.abort()
  const timeout = new Promise<never>((_, reject) => {
    const fail = () => reject(new Error('Buddies alert timed out'))
    timer = setTimeout(() => {
      controller.abort()
      fail()
    }, ms)
    controller.signal.addEventListener('abort', fail)
  })
  return Promise.race([work(controller.signal), timeout]).finally(() => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  })
}

export async function postBuddiesAlert(
  data: Record<string, unknown> | undefined,

  signal?: AbortSignal
) {
  if (Platform.OS !== 'android') return
  const push = androidBuddiesPush(data)
  if (!push || push.shownBySystem) return
  let outcome: BuddyAlertOutcome | { failed: 'error' }
  try {
    outcome = await withTimeout(
      (describeSignal) =>
        buddiesEngine.describePush(push.marker, { signal: describeSignal }),
      DESCRIBE_TIMEOUT_MS,
      signal
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

  const news = isBuddiesNewsKind(kind)
  await (news ? ensureBuddiesNewsChannel() : ensureBuddiesChannel())
  await Notifications.scheduleNotificationAsync({
    identifier: `buddies-${seq ?? eventId ?? Date.now()}`,
    content: {
      title: content.title,
      ...(content.body ? { body: content.body } : {}),

      data: { ww: { kind, ...(seq === undefined ? {} : { seq }) } },
    },
    trigger: { channelId: news ? BUDDIES_NEWS_CHANNEL_ID : BUDDIES_CHANNEL_ID },
  })
}
