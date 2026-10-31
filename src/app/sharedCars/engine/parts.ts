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

/**
 * The engine's parts, each made with the others: one part's step calls
 * another's (a sync closes invitations and may end the car; leaving syncs
 * first), and the facade fills this in before anything runs. What each part
 * offers the others is declared here, so the parts depend on this file and not
 * on each other. Each part's own file documents its steps.
 */
export type EngineParts = {
  keys: KeyManagement
  sync: CarSync
  invites: Invitations
  endings: Endings
  sharing: Sharing
}

/** What this device's own wrap gave, against the keyring. */
export type OwnWrap =
  /** The key this device trusts for the epoch. */
  | 'trusted'
  /** Another key than the one trusted for the epoch: kept out. */
  | 'mismatch'
  /** A key for an epoch this device trusts none for yet. */
  | 'candidate'
  /** It didn't open. */
  | 'unopened'

/** What one record says on the wire, before it's sealed. */
export type WireRecord = {
  recordId: string
  kind: string
  data?: Record<string, unknown>
  deleted: boolean
  stamp: number
}

/** One `put`: its sealed records, and each one's stamp and kind. */
export type PutBatch = {
  records: SpacePutRecord[]
  stamps: Map<string, number>
  kinds: Map<string, string>
}

/** The space keys: the keyring, own wraps, the key chain, and rekeys. */
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
  /** Forgets what this device opened and reported for `spaceId`. */
  forget: (spaceId: string) => void
  forgetAll: () => void
}

/** Keeping one car in step with its space: pull, merge, upkeep, and put. */
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
  /** Forgets what this launch read again of `spaceId`. */
  forget: (spaceId: string) => void
  forgetAll: () => void
}

/** Invitations and joins. */
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

/** How a car ends for the User: leaving, removal, and stopping. */
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

/** Sharing one of the User's own cars. */
export type Sharing = {
  shareCar: (vehicleId: string) => Promise<{ spaceId: string }>
  resumeShares: () => Promise<void>
  abandonShares: () => Promise<void>
}
