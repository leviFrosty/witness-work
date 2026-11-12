import type {
  ScopedInviteEntry,
  ScopedMemberEntry,
  SpaceHolderEntry,
  SpaceLinkEntry,
} from '@/lib/sharedSpaces/client'
import type { SealedSpaceRecord, UnreadSpaceRecord } from '@/types/sharedCars'

export type TerritoryRecordKind =
  | 'territory'
  | 'street'
  | 'worked'
  | 'door'
  | 'doNotCall'
  | 'guest'
  | 'member'
  | 'invite'
  | 'guestKeys'

export type TerritorySpaceRecord = {
  kind: string

  data?: Record<string, unknown>
  stamp: number
  deleted: boolean
}

export type TerritorySentInvite = {
  epoch: number

  to: string

  scopes: string[] | null
  handoff: boolean

  owed?: boolean
}

export type TerritorySpaceLocal = {
  photo?: string

  next: Record<string, number>
}

export type TerritorySpace = {
  spaceId: string
  territoryId: string
  myMemberId: string
  ownerId: string
  epoch: number
  seq: number
  rekeyNeeded: boolean
  members: ScopedMemberEntry[]
  invites: ScopedInviteEntry[]
  holders: SpaceHolderEntry[]
  links: SpaceLinkEntry[]

  records: Record<string, TerritorySpaceRecord>

  pending: string[]

  sealed: SealedSpaceRecord[]

  unread: UnreadSpaceRecord[]

  keyChain: SealedSpaceRecord[]

  keyStamps: Record<string, number>

  sealedOwnRecord?: SealedSpaceRecord

  ownRecordChecked: boolean

  writtenName?: string

  writtenAvatar?: string | null

  sentInvites: Record<string, TerritorySentInvite>

  guestKeyEpochs: Record<string, number>

  local: TerritorySpaceLocal

  hadOthers: boolean

  lastSyncedAt?: number
}

export type TerritoryEnding = 'returned' | 'left' | 'gone' | 'left_elsewhere'

export type TerritorySeeding = {
  spaceId: string
  territoryId: string

  createWrap?: string
  created: boolean
  startedAt: number
}

export type TerritoryJoining = {
  spaceId: string
  inviteId: string
  epoch: number
  startedAt: number

  wrap?: string
}

export type TerritoryMemberships = {
  territories: Record<string, { at: number }>
  leftTerritories: Record<string, number>
}
