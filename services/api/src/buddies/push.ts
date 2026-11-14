import type { Environment } from '../types'
import {
  defaultApnsDependencies,
  sendApnsNotifications,
  type ApnsDependencies,
  type ApnsEnv,
} from '../apns'
import { sendFcmNotifications, type FcmEnv } from '../fcm'
import {
  BUDDIES_PASSIVE_PUSH_KINDS,
  type PushJob,
  type PushTarget,
} from './contracts'

/**
 * Buddies on top of the generic APNs and FCM senders. Durable Objects only
 * decide *what* to push; the Worker sends it from `ctx.waitUntil`, so push
 * latency is billed as Worker CPU rather than DO wall-clock.
 *
 * Privacy: nothing here logs tokens, ids, or template text.
 */

export type PushEnv = ApnsEnv & FcmEnv & Pick<Environment, 'BUDDY_INBOX'>

/** `fetch`, clock, and sleep for both senders and Google's token exchange. */
export type PushDependencies = ApnsDependencies

/** The Android notification channel the app creates for Buddies alerts. */
export const BUDDIES_ANDROID_CHANNEL = 'buddies'

/**
 * How long FCM holds an alert for a device that is off or offline. Later than
 * this, the app has synced the event some other way or it's stale.
 */
const FCM_TTL = '86400s'

/** APNs refuses a payload over 4 KB. */
export const APNS_PAYLOAD_LIMIT = 4096
/**
 * FCM refuses a message whose data (keys and values) passes 4 KB; this leaves
 * room for what FCM adds.
 */
export const FCM_DATA_LIMIT = 4000

type ApnsTarget = Extract<PushTarget, { service: 'apns' }>
type FcmTarget = Extract<PushTarget, { service: 'fcm' }>
type Alert = Pick<PushTarget, 'title' | 'body'>

const utf8Length = (text: string) => new TextEncoder().encode(text).length

/**
 * The `ww` marker: the event's kind and `seq`, plus the still-sealed event when
 * `inline`. The app opens the event to name the sender, and fetches it by
 * `seq` when it didn't fit.
 */
const marker = (job: PushJob, inline: boolean) => ({
  kind: job.kind,
  seq: job.seq,
  ...(inline ? { eventId: job.event.eventId, blob: job.event.blob } : {}),
})

/**
 * The exact alert payload from the contract. The alert text is the device's
 * generic template, with sound unless the kind is passive (badge news); `mutable-content` lets the app's Notification Service
 * Extension replace it with a named alert from the sealed event, and an app
 * without one shows the template. `content-available` also lets iOS wake the
 * app to sync before it's opened; the push stays an `alert` (apns-push-type)
 * at the default priority 10.
 */
export const buildBuddiesPayload = (job: PushJob, target: Alert) => {
  // Badge news arrives in Notification Center without sound or a banner.
  const passive = BUDDIES_PASSIVE_PUSH_KINDS.has(job.kind)
  const build = (inline: boolean) => ({
    aps: {
      alert: { title: target.title, body: target.body },
      ...(passive ? { 'interruption-level': 'passive' } : { sound: 'default' }),
      'thread-id': 'buddies',
      'content-available': 1,
      'mutable-content': 1,
    },
    ww: marker(job, inline),
  })
  const full = build(true)
  return utf8Length(JSON.stringify(full)) <= APNS_PAYLOAD_LIMIT
    ? full
    : build(false)
}

/**
 * The FCM counterpart: a data-only, high-priority message, so the app's
 * background push task runs every time and syncs, as `content-available` does
 * on iOS. For a device that posts its own alerts (`appAlerts`) it has no
 * `title` or `message`, so expo-notifications shows nothing itself: the app
 * posts the named alert, or the template (`fallbackTitle`, `fallbackBody`)
 * when it can't open the event. Builds before named alerts get `title` and
 * `message`, which expo-notifications shows in the `buddies` channel. Either
 * way the JSON in `body` (the `ww` marker) reaches the app.
 */
export const buildBuddiesFcmMessage = (
  job: PushJob,
  target: Alert & Pick<FcmTarget, 'appAlerts'>
) => {
  const build = (inline: boolean): Record<string, string> => {
    const body = JSON.stringify({ ww: marker(job, inline) })
    return target.appAlerts
      ? { fallbackTitle: target.title, fallbackBody: target.body, body }
      : {
          title: target.title,
          message: target.body,
          body,
          channelId: BUDDIES_ANDROID_CHANNEL,
        }
  }
  const full = build(true)
  const size = Object.entries(full).reduce(
    (total, [key, value]) => total + utf8Length(key) + utf8Length(value),
    0
  )
  return {
    data: size <= FCM_DATA_LIMIT ? full : build(false),
    android: { priority: 'HIGH', ttl: FCM_TTL },
  }
}

const isApns = (target: PushTarget): target is ApnsTarget =>
  target.service === 'apns'
const isFcm = (target: PushTarget): target is FcmTarget =>
  target.service === 'fcm'

/**
 * Sends one alert per target, through APNs or FCM by the device's service, and
 * deletes devices whose token either reports as unregistered. Never throws: it
 * runs in `waitUntil`.
 */
export const deliverPushJob = async (
  env: PushEnv,
  job: PushJob,
  deps: PushDependencies = defaultApnsDependencies
): Promise<void> => {
  const apns = job.targets.filter(isApns)
  const fcm = job.targets.filter(isFcm)
  const [apnsOutcomes, fcmOutcomes] = await Promise.all([
    sendApnsNotifications(
      env,
      apns.map((target) => ({
        device: {
          token: target.token,
          environment: target.apnsEnvironment,
          ...(target.apnsTopic ? { topic: target.apnsTopic } : {}),
        },
        payload: buildBuddiesPayload(job, target),
      })),
      deps
    ),
    sendFcmNotifications(
      env,
      fcm.map((target) => ({
        token: target.token,
        message: buildBuddiesFcmMessage(job, target),
      })),
      deps
    ),
  ])

  const stale = [
    ...apns.filter((_, index) => apnsOutcomes[index] === 'unregistered'),
    ...fcm.filter((_, index) => fcmOutcomes[index] === 'unregistered'),
  ].map(({ deviceId, token }) => ({ deviceId, token }))
  if (!stale.length) return
  try {
    const inbox = env.BUDDY_INBOX.get(env.BUDDY_INBOX.idFromName(job.inboxId))
    await inbox.removeDevices(stale)
  } catch {
    console.warn('buddies: stale device cleanup failed')
  }
}
