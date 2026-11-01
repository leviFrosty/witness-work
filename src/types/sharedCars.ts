import type { MileageSnapshot, MileageTombstone } from '@/types/mileage'

export type SharedCarRecordKind = 'car' | 'setup' | 'fuel' | 'price' | 'trip'

export type SharedCarMember = {
  memberId: string

  name: string

  avatar?: string

  tag: string

  joinedAt: number

  updatedAt?: number
}

export type SharedCarSpaceMember = {
  memberId: string

  dhPub: string

  joinedAt: number
}

export type SharedCarInvite = {
  inviteId: string

  invitedBy: string

  name: string

  tag: string

  expiresAt: number

  updatedAt?: number
}

export type SharedCarTombstone = MileageTombstone & {
  kind?: SharedCarRecordKind
}

export type SharedSpaceTombstone = {
  id: string
  deletedAt: number
}

export type SealedSpaceRecord = {
  recordId: string
  epoch: number
  stamp: number
  deleted: boolean
  blob: string
  seq: number
}

export type UnreadSpaceRecord = SealedSpaceRecord & {
  problem: 'newer' | 'unknown' | 'decrypt' | 'format'
}

export type SharedCar = Omit<MileageSnapshot, 'deletedMileageRecords'> & {
  deletedMileageRecords: SharedCarTombstone[]
  spaceId: string

  myMemberId: string

  ownerId: string

  members: SharedCarMember[]

  invites: SharedCarInvite[]

  seq: number

  epoch: number

  pendingPuts: string[]

  spaceMembers: SharedCarSpaceMember[]

  unnamedMembers: { memberId: string; joinedAt: number }[]

  spaceInvites: { inviteId: string; invitedBy: string; expiresAt: number }[]

  rekeyNeeded: boolean

  memberRecords: SharedCarMember[]

  inviteRecords: SharedCarInvite[]

  keyRecords: { epoch: number; stamp: number }[]

  keyChain: SealedSpaceRecord[]

  sealedOwnRecord?: SealedSpaceRecord

  deletedSpaceRecords: SharedSpaceTombstone[]

  sealedRecords: SealedSpaceRecord[]

  unreadRecords: UnreadSpaceRecord[]

  extraFields: Record<string, Record<string, unknown>>

  sentInvites: Record<string, { epoch: number; owed?: boolean }>

  hadOthers: boolean

  ownRecordChecked: boolean

  lastSyncedAt?: number

  writtenAvatar?: string | null

  writtenName?: string
}

export type SharedCarClosingInvite = { tag?: string }

export type SharedCarMemberships = {
  cars: Record<string, { at: number }>

  leftCars: Record<string, number>
}

export type SharedCarSeeding = {
  spaceId: string

  vehicleId: string

  startedAt: number

  created: boolean

  fuelCopies: Record<string, string>

  priceCopies: Record<string, string>

  landed: Record<string, { stamp: number; kind: string }>

  seq: number

  joinedAt?: number

  createWrap?: string

  member?: SharedCarMember
}

export type SharedCarJoining = {
  spaceId: string
  inviteId: string

  epoch: number

  startedAt: number

  wrap?: string
}

export type SharedCarPendingEnd = 'leave' | 'delete'

export type CarInvitePayload = {
  spaceId: string
  inviteId: string

  joinSecret: string

  epoch: number

  key: string

  name: string

  people: number

  expiresAt: number
}
