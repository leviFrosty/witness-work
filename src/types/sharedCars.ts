import type { MileageSnapshot, MileageTombstone } from '@/types/mileage'

/**
 * Shared Cars: one car whose history several people share, kept on ww-api as a
 * space of sealed records (ADR 0037). These types are this device's copy of a
 * space. Wire contract and record kinds: `docs/shared-cars-protocol.md`.
 */

/** A mileage record's kind on the wire. */
export type SharedCarRecordKind = 'car' | 'setup' | 'fuel' | 'price' | 'trip'

/**
 * A person on a Shared Car, from their `member` record (`m.<memberId>`). The
 * member who owns the car is the car's `ownerId`.
 */
export type SharedCarMember = {
  /** Their per-space id (`b64u` of 16 bytes). */
  memberId: string
  /** The name they share in Buddies, at most 40 characters. */
  name: string
  /** An emoji, or a 40 px JPEG of at most 4,000 characters. */
  avatar?: string
  /** Their Buddies inbox, hashed for this space, to match them to a buddy. */
  tag: string
  /** Epoch ms. */
  joinedAt: number
  /** The record's stamp. */
  updatedAt?: number
}

/**
 * Someone on the space as `sync` lists them. Their `memberId` commits to
 * `dhPub`, which is checked before a new key is wrapped to them.
 */
export type SharedCarSpaceMember = {
  memberId: string
  /** Their per-space X25519 public key (`b64u`). */
  dhPub: string
  /** Epoch ms, the server's. */
  joinedAt: number
}

/**
 * An open invitation to a Shared Car, from its `invite` record
 * (`i.<inviteId>`).
 */
export type SharedCarInvite = {
  inviteId: string
  /** The `memberId` of the person who sent it. */
  invitedBy: string
  /** The invitee's Buddy Card name. */
  name: string
  /** The invitee's Buddies inbox, hashed for this space. */
  tag: string
  /** Epoch ms. */
  expiresAt: number
  /** The record's stamp. */
  updatedAt?: number
}

/** A mileage record's tombstone on a Shared Car, with what it was. */
export type SharedCarTombstone = MileageTombstone & {
  /** The deleted record's kind, which its deletion is sealed with. */
  kind?: SharedCarRecordKind
}

/** A deleted `member` or `invite` record. */
export type SharedSpaceTombstone = {
  /** Its record id (`m.<memberId>` or `i.<inviteId>`). */
  id: string
  deletedAt: number
}

/** A record as ww-api holds it, kept until this device has its key. */
export type SealedSpaceRecord = {
  recordId: string
  epoch: number
  stamp: number
  deleted: boolean
  blob: string
  seq: number
}

/**
 * A record this device held the key for but couldn't use: kept, never dropped,
 * and read again after the app updates (a kind or version from a newer app) or
 * once its epoch's key changes here (one that didn't open).
 */
export type UnreadSpaceRecord = SealedSpaceRecord & {
  /**
   * `newer`: from a newer app version. `unknown`: opened, but this version
   * can't use it (an unknown kind, or data it can't read). `decrypt`: didn't
   * open with the key held for its epoch. `format`: not a blob this version
   * knows.
   */
  problem: 'newer' | 'unknown' | 'decrypt' | 'format'
}

/**
 * One Shared Car on this device: its mileage records as last synced plus the
 * changes made here since, and the space's sync state.
 *
 * The collections hold the car itself (its only vehicle), its fuel setups, its
 * own fuels and their prices, and every trip anyone on it logged. Each record's
 * id is its `recordId` and its `updatedAt` (a tombstone's `deletedAt`) its
 * `stamp`, so records merge by mileage's own rule.
 */
export type SharedCar = Omit<MileageSnapshot, 'deletedMileageRecords'> & {
  deletedMileageRecords: SharedCarTombstone[]
  spaceId: string
  /** The User's `memberId` here, derived from their Buddies root seed. */
  myMemberId: string
  /** The member who shared the car, or took it over (sync's `ownerId`). */
  ownerId: string
  /**
   * The people on the car now (sync's `members`), each once their member record
   * has synced, in the order they joined. Derived from `spaceMembers` and
   * `memberRecords` by the engine.
   */
  members: SharedCarMember[]
  /**
   * Open invitations (sync's `invites`), each once its invite record has
   * synced. Derived from `spaceInvites` and `inviteRecords` by the engine.
   */
  invites: SharedCarInvite[]
  /** Sync cursor: the last `seq` merged, the next sync's `since`. */
  seq: number
  /**
   * The key epoch new records are sealed under: the server's, as of the last
   * sync (0 until then).
   */
  epoch: number
  /**
   * Ids of records changed on this device that no `put` has stored yet. They
   * stay until one does, so changes made offline still go out.
   */
  pendingPuts: string[]
  /** Everyone on the space now, as the last sync listed them. */
  spaceMembers: SharedCarSpaceMember[]
  /**
   * People on the car whose member record hasn't synced (a join that never
   * finished): "Someone who joined", whom the owner can remove. Derived from
   * `spaceMembers` and `memberRecords` by the engine.
   */
  unnamedMembers: { memberId: string; joinedAt: number }[]
  /** The invitations open on the server, as the last sync listed them. */
  spaceInvites: { inviteId: string; invitedBy: string; expiresAt: number }[]
  /**
   * A member left or was removed since the current epoch began; the owner's
   * device makes a new key.
   */
  rekeyNeeded: boolean
  /**
   * Every member record, including people no longer on the car: the trips they
   * logged still name them.
   */
  memberRecords: SharedCarMember[]
  /** Every live invite record. */
  inviteRecords: SharedCarInvite[]
  /** The key chain's records (`k.<e>`) by epoch, and each one's stamp. */
  keyRecords: { epoch: number; stamp: number }[]
  /**
   * The key chain's records as sealed, the last version of each that counted
   * here, so the keyring can be rebuilt from them when this device lost it. A
   * newer version that doesn't open or count waits in `unreadRecords` (or
   * `sealedRecords`) until the owner puts the link again past it.
   */
  keyChain: SealedSpaceRecord[]
  /**
   * The last version of the User's own member record whose key check matched
   * here, as sealed, so it can vouch for the car's key again when this device
   * lost its keyring, whatever the space holds now
   * (docs/shared-cars-protocol.md, "Key check").
   */
  sealedOwnRecord?: SealedSpaceRecord
  /** Deleted member and invite records. */
  deletedSpaceRecords: SharedSpaceTombstone[]
  /**
   * Records sealed under a key epoch this device can't open yet. The key chain
   * opens them once its newer records arrive.
   */
  sealedRecords: SealedSpaceRecord[]
  /** Records this version couldn't use, kept to read again. */
  unreadRecords: UnreadSpaceRecord[]
  /**
   * Fields a newer app put in a record's `data` that this version doesn't know,
   * by record id. They go back out when this device writes the record, so an
   * older build never strips what a newer one added.
   */
  extraFields: Record<string, Record<string, unknown>>
  /**
   * Invitations made on this device that are still open, by `inviteId`, with
   * the key epoch each was made under, so a rekey's closing them is told apart
   * from someone joining. `owed`: its `car.invite` can't go any more (the
   * device lost its secrets), so it closes and goes again under a new id, as
   * after a rekey.
   */
  sentInvites: Record<string, { epoch: number; owed?: boolean }>
  /**
   * Someone else has been on the car. Once they've all gone, with no invitation
   * open, the car becomes the owner's own again.
   */
  hadOthers: boolean
  /**
   * The User's own member record here is one of their devices': this device
   * wrote it, or its newest version opened and its key check matched
   * (docs/shared-cars-protocol.md, "Key check"). Until then, the next sync
   * writes it again.
   */
  ownRecordChecked: boolean
  /** When a sync last worked (device clock). */
  lastSyncedAt?: number
  /**
   * The avatar this device last put in the User's own member record here (null
   * for none), absent until it has. Another of the User's devices may word it
   * its own way (its own photo's JPEG, its own emoji), so a device puts its
   * avatar again only when it changed since then, and the two never take turns
   * rewriting the record.
   */
  writtenAvatar?: string | null
  /** The name this device last put in the User's own member record here. */
  writtenName?: string
}

/**
 * An invitation this device is closing (`invite/delete`, then its `i.` record
 * goes), kept until the server has heard. With `tag`, it closes only an
 * invitation to that person: a decline counts only from whoever it was for.
 */
export type SharedCarClosingInvite = { tag?: string }

/**
 * The spaces the User is on and the ones they've left, as the Buddies roster
 * carries them to the User's other devices (`cars`, `leftCars`). They merge as
 * a union; a `leftCars` entry wins over a `cars` entry whose `at` is at or
 * before it.
 */
export type SharedCarMemberships = {
  /** When the User joined or shared each space (epoch ms). */
  cars: Record<string, { at: number }>
  /** When the User left each space (epoch ms). */
  leftCars: Record<string, number>
}

/**
 * Sharing a car that hasn't finished: the space exists (or may), and the
 * records that have landed there. Kept so a seeding that stopped part-way
 * resumes rather than starting over.
 */
export type SharedCarSeeding = {
  spaceId: string
  /** The User's own car being shared. */
  vehicleId: string
  /** Epoch ms. */
  startedAt: number
  /** `create` has worked (or a retry found the space already made). */
  created: boolean
  /** The new id of each of the User's own fuels copied onto the car. */
  fuelCopies: Record<string, string>
  /** The new id of each of those fuels' prices. */
  priceCopies: Record<string, string>
  /**
   * Each record put so far, with the stamp and kind it was put with, so one
   * deleted before the seeding finished is deleted on the car too.
   */
  landed: Record<string, { stamp: number; kind: string }>
  /** The space's `seq` after the last put. */
  seq: number
  /** When the User joined it, as `create` answered. */
  joinedAt?: number
  /**
   * The wrap `create` sent, so a retry after a lost answer is the same request,
   * which the server answers again. It opens only with the User's own key.
   */
  createWrap?: string
  /**
   * The User's member record as the share puts it, its stamp the `updatedAt`:
   * stamped again only when their profile changed, so a share that resumes puts
   * it again only then.
   */
  member?: SharedCarMember
}

/**
 * A join this device started (docs/shared-cars-protocol.md, "Inviting and
 * joining"), saved before `join` goes out. If its answer is lost, the next try
 * syncs with the User's member values, which shows whether it landed. The key
 * the invitation carried is never here.
 */
export type SharedCarJoining = {
  spaceId: string
  inviteId: string
  /** The key epoch the invitation's key belongs to. */
  epoch: number
  /** Epoch ms. */
  startedAt: number
  /**
   * The wrap `join` sent: the invitation's key, wrapped to the User's own key,
   * which alone opens it. A sync that finds the join landed trusts that key
   * only when the User's wrap on the car holds the same one.
   */
  wrap?: string
}

/**
 * Leaving or deleting a space this device has already ended locally, while the
 * server hasn't heard: retried until it has.
 */
export type SharedCarPendingEnd = 'leave' | 'delete'

/**
 * What a `car.invite` Buddies event carries to the invitee (beyond its `v` and
 * `rev`, with `spaceId` as its `id`): everything they need to join, and what
 * the invitation shows before they do.
 */
export type CarInvitePayload = {
  spaceId: string
  inviteId: string
  /** 32 random bytes, `b64u`; the server keeps only its hash. */
  joinSecret: string
  /** The key epoch `key` belongs to. */
  epoch: number
  /** `b64u(K_e)` for `epoch`. */
  key: string
  /** The car's name, at most 60 characters. */
  name: string
  /** How many people are on the car. */
  people: number
  /** Epoch ms. */
  expiresAt: number
}
