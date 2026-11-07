import semver from 'semver'
import type { SyncSlotPlatform } from '@/lib/syncTransport/server/syncClient'

export const CLOUD_SYNC_REQUEST_MIN_APP_VERSION = '1.47.0'

const DAY_MS = 24 * 60 * 60 * 1000

export const PHONE_SLOT_FRESH_MS = 30 * DAY_MS

export type WebCloudSyncState = 'ready' | 'turnOn' | 'waiting' | 'updatePhone'

export const isWaitingState = (state: WebCloudSyncState | null) =>
  state === 'waiting' || state === 'updatePhone'

export type WebCloudSyncSession = {
  platform: string | null

  appVersion: string | null
}

export type WebCloudSyncSlot = {
  slotId: string

  platform: SyncSlotPlatform | null

  live: boolean

  updatedAt: number
}

export type WebCloudSyncInput = {
  slots: readonly WebCloudSyncSlot[]

  ownSlotId: string | null
  sessions: readonly WebCloudSyncSession[]

  requestedAt: number | null

  now: number
}

const PHONE_PLATFORMS: ReadonlyArray<string | null> = ['ios', 'android', 'dev']

const isPhone = (session: WebCloudSyncSession) =>
  PHONE_PLATFORMS.includes(session.platform)

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
  const phoneOnCloudSync = slots.some(
    (slot) =>
      slot.slotId !== ownSlotId &&
      PHONE_PLATFORMS.includes(slot.platform) &&
      slot.live &&
      now - slot.updatedAt < PHONE_SLOT_FRESH_MS
  )
  if (phoneOnCloudSync) return 'ready'
  const phones = sessions.filter(isPhone)

  if (phones.length === 0) return 'ready'

  if (requestedAt === null) return 'turnOn'
  return phones.every(tooOld) ? 'updatePhone' : 'waiting'
}
