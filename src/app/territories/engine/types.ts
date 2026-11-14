import type { SpaceErrorCode, SpacesClient } from '@/lib/sharedSpaces/client'
import type { SpaceKeyring } from '@/lib/sharedSpaces/keyring'
import type { AppVariant } from '@/lib/toAppVariant'
import type { SharedCarProfile } from '@/app/sharedCars/profile'
import type { TerritoriesState } from '@/features/territories/stores/territories'
import type { TerritoryEnding } from '@/features/territories/types/sharedTerritory'

export type TerritoriesStore = {
  getState: () => TerritoriesState
  subscribe: (
    listener: (state: TerritoriesState, previous: TerritoriesState) => void
  ) => () => void
}

export type TerritorySharingErrorCode =
  | 'no_account_key'
  | 'not_found'
  | 'not_owner'
  | 'not_allowed'
  | 'invalid_invite'
  | 'key_unverified'
  | 'nothing_to_share'

export class TerritorySharingError extends Error {
  constructor(readonly code: TerritorySharingErrorCode) {
    super(`Territories: ${code}`)
    this.name = 'TerritorySharingError'
  }
}

export type TerritorySyncFailure = SpaceErrorCode | TerritorySharingErrorCode

export type TerritoryOutcome =
  | { type: 'shared'; scope: 'whole' | 'streets'; people: number }
  | { type: 'joined'; handoff: boolean }
  | { type: 'link_created'; streets: number; days: number }
  | { type: 'link_ended' }
  | { type: 'link_lifetime_changed'; days: number }
  | { type: 'handoff'; action: 'handed' | 'taken_back' | 'given_back' }
  | { type: 'ended'; reason: TerritoryEnding }
  | { type: 'sync_failed'; reason: TerritorySyncFailure }

export type TerritorySyncOutcome =
  | 'synced'
  | 'waiting'
  | 'skipped'
  | 'ended'
  | 'missing'

export type TerritoryInvitePayload = {
  spaceId: string
  inviteId: string
  joinSecret: string
  epoch: number
  key: string
  title: string
  streets: string[]
  handoff: boolean
  people: number
  expiresAt: number
}

export type TerritoryInvitee = { inboxId: string; name: string; tag: string }

export type TerritoryEnded = {
  spaceId: string
  title: string
  reason: TerritoryEnding
}

export type TerritoryEngineDeps = {
  client: SpacesClient
  store: TerritoriesStore
  keyring: SpaceKeyring
  rootSeed: () => Promise<Uint8Array | null>
  profile: () => SharedCarProfile | Promise<SharedCarProfile>
  privacy: () => boolean
  variant: AppVariant
  randomBytes: (length: number) => Uint8Array
  now: () => number
  syncNow: () => number
  stamp: (previous?: number) => number
  refreshClock?: () => Promise<unknown>
  canSync?: () => boolean
  onOutcome?: (outcome: TerritoryOutcome) => void
  onEnded?: (ended: TerritoryEnded) => void
  onRefused?: (refused: { spaceId: string; title: string }) => void
  onInviteReissued?: (reissue: {
    spaceId: string
    previousInviteId: string
    to: string
    invite: TerritoryInvitePayload
  }) => void
  onError?: (error: unknown, context: string) => void
}
