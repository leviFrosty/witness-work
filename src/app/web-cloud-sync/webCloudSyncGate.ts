import semver from 'semver'
import type { SyncSlotPlatform } from '@/lib/syncTransport/server/syncClient'

/**
 * Whether a browser can go on to the app after signing in (ADR 0037 §2, ADR
 * 0040 §5; docs/cloud-sync-photos.md, "The Cloud Sync request" → "The web").
 * The web stores data only through Cloud Sync, so it needs a phone's data
 * there: a recent slot from a live phone session. Without one, it asks the
 * account's phones to switch, then waits for one to.
 */

/**
 * The first app version that reads the account's Cloud Sync request and answers
 * it. Set at the release cut to the version this ships in.
 */
export const CLOUD_SYNC_REQUEST_MIN_APP_VERSION = '1.47.0'

const DAY_MS = 24 * 60 * 60 * 1000

/** A phone's slot counts only if it was written this recently. */
export const PHONE_SLOT_FRESH_MS = 30 * DAY_MS

export type WebCloudSyncState =
  /** Another device is on Cloud Sync, or there's no phone to wait for. */
  | 'ready'
  /** "Turn on Cloud Sync to use WitnessWork here". */
  | 'turnOn'
  /** Asked; "Open WitnessWork on your phone to finish". */
  | 'waiting'
  /** Asked, but every phone runs a version too old to know it. */
  | 'updatePhone'

/** Asked, and waiting for a phone: Waiting or Update your phone. */
export const isWaitingState = (state: WebCloudSyncState | null) =>
  state === 'waiting' || state === 'updatePhone'

/** One of the account's signed-in sessions, from the devices list. */
export type WebCloudSyncSession = {
  /**
   * `ios`, `android`, `dev` (a development build), or `web`; null for a
   * platform this version doesn't know.
   */
  platform: string | null
  /** The app version the session last reported; null when unknown. */
  appVersion: string | null
}

/** One of the account's slots (`sync/list`). */
export type WebCloudSyncSlot = {
  slotId: string
  /** The platform of the session that last wrote it; null when unknown. */
  platform: SyncSlotPlatform | null
  /** Whether that session is still live. */
  live: boolean
  /** Its last write, the server's epoch ms. */
  updatedAt: number
}

export type WebCloudSyncInput = {
  slots: readonly WebCloudSyncSlot[]
  /** This browser's own slot id, which doesn't count. */
  ownSlotId: string | null
  sessions: readonly WebCloudSyncSession[]
  /** The standing request's time (`GET /accounts/v1/sync`), or null. */
  requestedAt: number | null
  /** The server's clock, as near as this browser knows it. */
  now: number
}

const PHONE_PLATFORMS: ReadonlyArray<string | null> = ['ios', 'android', 'dev']

/**
 * A session that can answer the request, as ww-api counts them when it clears
 * one: not a browser, nor a platform this version doesn't know.
 */
const isPhone = (session: WebCloudSyncSession) =>
  PHONE_PLATFORMS.includes(session.platform)

/** Known to predate the request; an unknown or unreadable version isn't. */
const tooOld = ({ appVersion }: WebCloudSyncSession) => {
  const version = appVersion ? semver.valid(semver.coerce(appVersion)) : null
  return (
    version !== null && semver.lt(version, CLOUD_SYNC_REQUEST_MIN_APP_VERSION)
  )
}

export function decideWebCloudSync({
  slots,
  ownSlotId,
  sessions,
  requestedAt,
  now,
}: WebCloudSyncInput): WebCloudSyncState {
  // A phone is on Cloud Sync: a live phone session wrote a slot lately. This
  // browser's slot, another browser's, or a retired phone's doesn't say so.
  const phoneOnCloudSync = slots.some(
    (slot) =>
      slot.slotId !== ownSlotId &&
      PHONE_PLATFORMS.includes(slot.platform) &&
      slot.live &&
      now - slot.updatedAt < PHONE_SLOT_FRESH_MS
  )
  if (phoneOnCloudSync) return 'ready'
  const phones = sessions.filter(isPhone)
  // A web-only account: the browser seeds Cloud Sync itself.
  if (phones.length === 0) return 'ready'
  // Ww-api lapses a request itself (30 days after the last ask, which a
  // repeated ask restarts without changing `requestedAt`), so a time it
  // answers stands.
  if (requestedAt === null) return 'turnOn'
  return phones.every(tooOld) ? 'updatePhone' : 'waiting'
}
