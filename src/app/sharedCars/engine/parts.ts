import type { SpacePutRecord } from '@/lib/sharedSpaces/client'
import type { SpaceMemberKeys } from '@/lib/sharedSpaces/crypto'
import type { KeyringChange } from '@/lib/sharedSpaces/keyring'
import type { EpochKey } from '@/lib/sharedSpaces/keyTrust'
import type { SharedCarProfile } from '@/app/sharedCars/profile'
import type {
  CarSyncOptions,
  CarSyncOutcome,
  SharedCarEnding,
  SharedCarNotLeft,
} from '@/app/sharedCars/engine/types'
import type {
  CarInvitePayload,
  SealedSpaceRecord,
  SharedCar,
} from '@/types/sharedCars'

export type EngineParts = {
  keys: KeyManagement
  sync: CarSync
  invites: Invitations
  endings: Endings
  sharing: Sharing
}

export type OwnWrap = 'trusted' | 'mismatch' | 'candidate' | 'unopened'

export type WireRecord = {
  recordId: string
  kind: string
  data?: Record<string, unknown>
  deleted: boolean
  stamp: number
}

export type PutBatch = {
  records: SpacePutRecord[]
  stamps: Map<string, number>
  kinds: Map<string, string>
}

export type KeyManagement = {
  trust: (spaceId: string, key: EpochKey) => KeyringChange
  openOwnWrap: (
    spaceId: string,
    epoch: number,
    wrap: string,
    member: SpaceMemberKeys
  ) => OwnWrap
  learnLink: (
    spaceId: string,
    record: Pick<SealedSpaceRecord, 'recordId' | 'epoch' | 'deleted'>,
    data: Record<string, unknown> | undefined
  ) => KeyringChange | null
  rebuildFromChain: (
    spaceId: string,
    links: readonly SealedSpaceRecord[]
  ) => boolean
  settle: (
    spaceId: string,
    links: readonly SealedSpaceRecord[],
    own: readonly SealedSpaceRecord[],
    member: SpaceMemberKeys
  ) => boolean
  trustInvited: (
    spaceId: string,
    invited: EpochKey,
    own: { epoch: number; wrap: string },
    member: SpaceMemberKeys
  ) => boolean
  sealingKey: (car: SharedCar) => Uint8Array | null
  waiting: (car: SharedCar) => boolean
  noteWaiting: (car: SharedCar) => void
  rekeyIfNeeded: (spaceId: string, member: SpaceMemberKeys) => Promise<void>
  linkStamp: (car: SharedCar, epoch: number) => number
  linkOwed: (car: SharedCar, epoch: number) => boolean

  forget: (spaceId: string) => void
  forgetAll: () => void
}

export type CarSync = {
  pull: (spaceId: string, member: SpaceMemberKeys) => Promise<void>
  push: (
    spaceId: string,
    member: SpaceMemberKeys,
    tried?: { resealed: boolean; restamped: boolean; refused: boolean }
  ) => Promise<void>
  seal: (
    member: SpaceMemberKeys,
    epoch: number,
    key: Uint8Array,
    wires: readonly WireRecord[]
  ) => { batches: PutBatch[]; tooLarge: string[]; held: string[] }
  movePersonal: (spaceId: string) => void
  runSteps: (
    spaceId: string,
    member: SpaceMemberKeys
  ) => Promise<CarSyncOutcome>
  syncCar: (
    spaceId: string,
    options?: CarSyncOptions
  ) => Promise<CarSyncOutcome>

  forget: (spaceId: string) => void
  forgetAll: () => void
}

export type Invitations = {
  reissueInvites: (spaceId: string, member: SpaceMemberKeys) => Promise<void>
  closePendingInvites: (
    spaceId: string,
    member: SpaceMemberKeys,
    only?: readonly string[]
  ) => Promise<void>
  closeInvite: (
    spaceId: string,
    inviteId: string,
    tag?: string,
    options?: Pick<CarSyncOptions, 'automatic'>
  ) => Promise<{ pending: boolean }>
  createInvite: (
    spaceId: string,
    invitee: { name: string; tag: string }
  ) => Promise<CarInvitePayload>
  joinCar: (
    payload: CarInvitePayload,
    profile?: SharedCarProfile
  ) => Promise<{ spaceId: string }>
  confirmJoins: () => Promise<void>
}

export type Endings = {
  endLocally: (
    spaceId: string,
    reason: SharedCarEnding,
    leftAt?: number
  ) => void
  finishEnd: (spaceId: string) => Promise<boolean>
  endAndTell: (
    spaceId: string,
    reason: SharedCarEnding,
    end: 'leave' | 'delete'
  ) => Promise<{ pending: boolean }>
  isLastOneLeft: (car: SharedCar) => boolean
  leaveCar: (spaceId: string) => Promise<{ pending: boolean }>
  stopSharing: (spaceId: string) => Promise<{ pending: boolean }>
  removeMember: (spaceId: string, memberId: string) => Promise<CarSyncOutcome>
  dropCarFromRoster: (spaceId: string, leftAt: number) => Promise<void>
  finishPendingEnds: (options?: {
    afterRoster?: boolean
  }) => Promise<{ pending: number }>
  leaveAll: () => Promise<{ pending: number; notLeft: SharedCarNotLeft[] }>
}

export type Sharing = {
  shareCar: (vehicleId: string) => Promise<{ spaceId: string }>
  resumeShares: () => Promise<void>
  abandonShares: () => Promise<void>
}
