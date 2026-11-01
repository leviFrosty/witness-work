import type { SpaceErrorCode, SpacesClient } from '@/lib/sharedSpaces/client'
import type { SpaceKeyring } from '@/lib/sharedSpaces/keyring'
import type { SharedCarsStore } from '@/stores/sharedCars'
import type { SharedCarsSessionStore } from '@/stores/sharedCarsSession'
import type { SharedCarProfileProvider } from '@/app/sharedCars/profile'
import type { MileageSnapshot } from '@/types/mileage'
import type { CarInvitePayload } from '@/types/sharedCars'

export const SUSPENDED_PUT_WAIT_MS = 60 * 1000

export type SharedCarsErrorCode =
  | 'no_account_key'
  | 'not_found'
  | 'not_owner'
  | 'not_ready'
  | 'invalid_invite'
  | 'key_mismatch'
  | 'key_unverified'
  | 'member_unverified'

export class SharedCarsError extends Error {
  constructor(readonly code: SharedCarsErrorCode) {
    super(`Shared Cars: ${code}`)
    this.name = 'SharedCarsError'
  }
}

export type SharedCarEnding =
  | 'left'
  | 'stopped'
  | 'last_member'
  | 'gone'
  | 'left_elsewhere'

export type SharedCarSyncFailure = SpaceErrorCode | SharedCarsErrorCode

export type SharedCarOutcome =
  | { type: 'shared'; resumed: boolean }
  | { type: 'joined'; people: number }
  | { type: 'ended'; reason: SharedCarEnding }
  | { type: 'rekeyed' }
  | { type: 'share_failed'; reason: string }
  | { type: 'sync_failed'; reason: SharedCarSyncFailure }

export type CarSyncOutcome =
  | 'synced'
  | 'waiting'
  | 'skipped'
  | 'ended'
  | 'missing'

export type CarSyncOptions = {
  automatic?: boolean

  minSeq?: number
}

export type PersonalMileage = {
  snapshot: () => MileageSnapshot

  mergeRecords: (records: Partial<MileageSnapshot>) => void
}

export type SharedCarEnded = {
  spaceId: string

  name: string
  reason: SharedCarEnding
}

export type SharedCarShareFailed = {
  vehicleId: string

  name: string

  reason: string
}

export type ReissuedInvite = {
  spaceId: string

  previousInviteId: string

  invite: CarInvitePayload
}

export type SharedCarJoinConfirmed = { spaceId: string; inviteId: string }

export type SharedCarNotLeft = {
  spaceId: string

  name: string
}

export type SharedCarsEngineDeps = {
  client: SpacesClient
  store: SharedCarsStore
  personal: PersonalMileage
  keyring: SpaceKeyring

  rootSeed: () => Promise<Uint8Array | null>

  profile: SharedCarProfileProvider

  status?: SharedCarsSessionStore
  randomBytes: (length: number) => Uint8Array
  randomUUID: () => string

  now: () => number

  syncNow: () => number

  stamp: (previous?: number) => number

  refreshClock?: () => Promise<unknown>

  correctStamp?: (stamp: number) => number

  canSync?: () => boolean

  rosterReadAt?: () => number
  onOutcome?: (outcome: SharedCarOutcome) => void

  onCarEnded?: (ended: SharedCarEnded) => void

  onShareFailed?: (failed: SharedCarShareFailed) => void

  onInviteReissued?: (reissue: ReissuedInvite) => void

  onJoinConfirmed?: (joined: SharedCarJoinConfirmed) => void

  onError?: (error: unknown, context: string) => void
}
