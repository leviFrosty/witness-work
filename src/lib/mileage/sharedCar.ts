import {
  MILEAGE_COLLECTIONS,
  type MileageCollection,
  type MileageRecord,
} from '@/lib/mileage/records'
import {
  encodePlaintext,
  RECORD_PLAINTEXT_MAX_BYTES,
} from '@/lib/sharedSpaces/records'
import type { Trip } from '@/types/mileage'
import type {
  CarInvitePayload,
  SharedCar,
  SharedCarInvite,
  SharedCarMember,
  SharedCarMemberships,
  SharedCarRecordKind,
} from '@/types/sharedCars'

/**
 * Pure helpers for one Shared Car's records (`@/types/sharedCars`), shared by
 * its store (`@/stores/sharedCars`) and the engine that syncs it
 * (`src/app/sharedCars`).
 */

/** Each mileage collection's kind on the wire, and back. */
export const KIND_OF_COLLECTION: Record<
  MileageCollection,
  SharedCarRecordKind
> = {
  vehicles: 'car',
  vehicleSetups: 'setup',
  fuels: 'fuel',
  fuelPrices: 'price',
  trips: 'trip',
}

export const COLLECTION_OF_KIND: Record<
  SharedCarRecordKind,
  MileageCollection
> = {
  car: 'vehicles',
  setup: 'vehicleSetups',
  fuel: 'fuels',
  price: 'fuelPrices',
  trip: 'trips',
}

/**
 * A mileage record's `data` on the wire: its fields without its id (which is
 * the `recordId`) or any left undefined.
 */
export function mileageRecordData(record: object): Record<string, unknown> {
  const { id: _id, ...rest } = record as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined)
  )
}

/**
 * Whether a record with this `data` fits the server's 16 KB record cap once
 * sealed. The engine never cuts a record to fit: one that doesn't stays on the
 * device and isn't shared.
 */
export const sharedRecordFits = (kind: string, data: Record<string, unknown>) =>
  encodePlaintext(kind, data, false).length <= RECORD_PLAINTEXT_MAX_BYTES

/** The longest `memberId` a trip names, as `b64u` of 16 bytes. */
const MEMBER_ID_ROOM = 'x'.repeat(22)

/**
 * Whether `trip` fits on a Shared Car once it's sealed, with who logged and
 * edited it, so the trip form can keep a long note within the cap.
 */
export const sharedTripFits = (trip: Trip) =>
  sharedRecordFits(
    'trip',
    mileageRecordData({
      ...trip,
      loggedBy: MEMBER_ID_ROOM,
      editedBy: MEMBER_ID_ROOM,
      updatedAt: trip.updatedAt ?? Number.MAX_SAFE_INTEGER,
    })
  )

type WithId = { id: string; updatedAt?: number }

/** Where each mileage record on a car is: by id, its collection and place. */
type MileageIndex = Map<string, { key: MileageCollection; at: number }>

const mileageIndexes = new WeakMap<object, MileageIndex>()

/**
 * Every live mileage record's collection and place on `car`, by id, built once
 * per set of collections: a car is replaced, never changed, so lookups on the
 * same one (a put's thousand results, a sync's pending records) stay linear.
 */
function mileageIndex(car: Pick<SharedCar, MileageCollection>): MileageIndex {
  const cached = mileageIndexes.get(car)
  if (cached) return cached
  const index: MileageIndex = new Map()
  for (const key of MILEAGE_COLLECTIONS)
    (car[key] as WithId[]).forEach((record, at) => {
      if (!index.has(record.id)) index.set(record.id, { key, at })
    })
  mileageIndexes.set(car, index)
  return index
}

/** The collection holding the live mileage record `id`, if one does. */
export function collectionHolding(
  car: Pick<SharedCar, MileageCollection>,
  id: string
): MileageCollection | undefined {
  return mileageIndex(car).get(id)?.key
}

/** The live mileage record `id` on `car`, if there is one. */
export function mileageRecordOn(
  car: Pick<SharedCar, MileageCollection>,
  id: string
): MileageRecord | undefined {
  const found = mileageIndex(car).get(id)
  return found && (car[found.key][found.at] as MileageRecord)
}

/** A car with nothing on it yet, for `spaceId`. */
export function emptySharedCar(
  spaceId: string,
  fields: Partial<SharedCar> = {}
): SharedCar {
  return {
    spaceId,
    myMemberId: '',
    ownerId: '',
    members: [],
    invites: [],
    seq: 0,
    epoch: 0,
    pendingPuts: [],
    spaceMembers: [],
    spaceInvites: [],
    rekeyNeeded: false,
    unnamedMembers: [],
    memberRecords: [],
    inviteRecords: [],
    keyRecords: [],
    keyChain: [],
    deletedSpaceRecords: [],
    sealedRecords: [],
    unreadRecords: [],
    extraFields: {},
    sentInvites: {},
    hadOthers: false,
    ownRecordChecked: false,
    vehicles: [],
    fuels: [],
    fuelPrices: [],
    vehicleSetups: [],
    trips: [],
    deletedMileageRecords: [],
    ...fields,
  }
}

/** A car as saved by an older build, with every field this one reads. */
export const withSharedCarDefaults = (car: SharedCar): SharedCar =>
  emptySharedCar(car.spaceId, car)

/** Every record's stamp and whether it's a deletion, by id. */
type StateIndex = Map<string, { stamp: number; deleted: boolean }>

const stateIndexes = new WeakMap<SharedCar, StateIndex>()

function stateIndex(car: SharedCar): StateIndex {
  const cached = stateIndexes.get(car)
  if (cached) return cached
  const index: StateIndex = new Map()
  // Tombstones first, so a live record with the same id (the car shows it)
  // wins.
  for (const tombstone of car.deletedMileageRecords)
    index.set(tombstone.id, { stamp: tombstone.deletedAt, deleted: true })
  for (const tombstone of car.deletedSpaceRecords)
    index.set(tombstone.id, { stamp: tombstone.deletedAt, deleted: true })
  for (const key of MILEAGE_COLLECTIONS)
    for (const record of car[key] as WithId[])
      index.set(record.id, { stamp: record.updatedAt ?? 0, deleted: false })
  for (const member of car.memberRecords)
    index.set(`m.${member.memberId}`, {
      stamp: member.updatedAt ?? 0,
      deleted: false,
    })
  for (const invite of car.inviteRecords)
    index.set(`i.${invite.inviteId}`, {
      stamp: invite.updatedAt ?? 0,
      deleted: false,
    })
  for (const key of car.keyRecords)
    index.set(`k.${key.epoch}`, { stamp: key.stamp, deleted: false })
  stateIndexes.set(car, index)
  return index
}

/**
 * Where record `id` stands on `car`: its stamp (`updatedAt`, or the tombstone's
 * `deletedAt`) and whether it's a deletion. Undefined when the car has neither.
 * Covers every kind: mileage records, member (`m.`), invite (`i.`) and key
 * chain (`k.`) records. Indexed once per car, so asking about every record is
 * linear.
 */
export function sharedRecordState(
  car: SharedCar,
  id: string
): { stamp: number; deleted: boolean } | undefined {
  return stateIndex(car).get(id)
}

/** The stamp of record `id` on `car`, whatever its kind; undefined if absent. */
export const sharedRecordStamp = (car: SharedCar, id: string) =>
  sharedRecordState(car, id)?.stamp

/**
 * The newest stamp of any version of record `id` this device has seen, whether
 * it merged, waits sealed under a key this device doesn't trust, couldn't be
 * read, or is kept as the last version that counted (a key chain link, the
 * User's own member record). Undefined when it has seen none. A rewrite or
 * repair goes out past it, so a version that hides the server's can't win.
 */
export function seenRecordStamp(
  car: SharedCar,
  id: string
): number | undefined {
  let stamp = sharedRecordStamp(car, id)
  const kept = [
    ...car.sealedRecords,
    ...car.unreadRecords,
    ...car.keyChain,
    ...(car.sealedOwnRecord ? [car.sealedOwnRecord] : []),
  ]
  for (const record of kept)
    if (record.recordId === id && record.stamp > (stamp ?? -1))
      stamp = record.stamp
  return stamp
}

/**
 * `pending` plus `ids`, without repeats, in order; the same array when it has
 * them all already.
 */
export function withPending(
  pending: readonly string[],
  ids: Iterable<string>
): string[] {
  const held = new Set(pending)
  const added: string[] = []
  for (const id of ids)
    if (!held.has(id)) {
      held.add(id)
      added.push(id)
    }
  return added.length ? [...pending, ...added] : (pending as string[])
}

/**
 * `trip` as this User saves it on `car`: a new trip is logged by them; an edit
 * keeps who logged it and is edited by them. A trip moving here from another
 * Shared Car (`from`) keeps who logged it there too: the User under their id on
 * this car, anyone else under theirs (docs/shared-cars-protocol.md, "Writes").
 */
export function attributedTrip(
  car: SharedCar,
  trip: Trip,
  from?: { car: SharedCar; trip: Trip }
): Trip {
  const { loggedBy: _loggedBy, editedBy: _editedBy, ...fields } = trip
  const existing = car.trips.find((t) => t.id === trip.id)
  if (existing)
    return {
      ...fields,
      ...(existing.loggedBy !== undefined && { loggedBy: existing.loggedBy }),
      editedBy: car.myMemberId,
    }
  if (!from) return { ...fields, loggedBy: car.myMemberId }
  const logger = from.trip.loggedBy
  return {
    ...fields,
    loggedBy:
      logger === undefined || logger === from.car.myMemberId
        ? car.myMemberId
        : logger,
    editedBy: car.myMemberId,
  }
}

/**
 * The people on the car now and its open invitations, from the space's lists
 * and the records that describe them. A person whose record hasn't synced yet
 * is listed apart (`unnamedMembers`); an invitation whose record hasn't waits
 * until it has.
 */
export function withDerivedPeople(car: SharedCar): SharedCar {
  const records = new Map(car.memberRecords.map((m) => [m.memberId, m]))
  const joined = [...car.spaceMembers].sort((a, b) => a.joinedAt - b.joinedAt)
  const members: SharedCarMember[] = joined.flatMap(
    ({ memberId, joinedAt }) => {
      const record = records.get(memberId)
      return record ? [{ ...record, joinedAt }] : []
    }
  )
  const unnamedMembers = joined
    .filter(({ memberId }) => !records.has(memberId))
    .map(({ memberId, joinedAt }) => ({ memberId, joinedAt }))
  const inviteRecords = new Map(car.inviteRecords.map((i) => [i.inviteId, i]))
  const invites: SharedCarInvite[] = car.spaceInvites.flatMap(
    ({ inviteId, invitedBy, expiresAt }) => {
      const record = inviteRecords.get(inviteId)
      return record ? [{ ...record, invitedBy, expiresAt }] : []
    }
  )
  return { ...car, members, unnamedMembers, invites }
}

/**
 * The most people a Shared Car holds, counting open invitations
 * (docs/shared-cars-protocol.md, "Limits and retention"). The server enforces
 * its own setting either way (`limit`); this keeps the app from offering an
 * invitation it would refuse.
 */
export const MAX_SHARED_CAR_PEOPLE = 10

/** The car's invitations still open at `now`. */
export const openCarInvites = (car: Pick<SharedCar, 'invites'>, now: number) =>
  car.invites.filter((invite) => invite.expiresAt > now)

/**
 * How many of the car's places are taken: its people (named or not yet) and
 * open invitations.
 */
export const takenCarPlaces = (
  car: Pick<SharedCar, 'members' | 'unnamedMembers' | 'invites'>,
  now: number
) =>
  car.members.length +
  (car.unnamedMembers?.length ?? 0) +
  openCarInvites(car, now).length

/** The User is on `spaceId`: joined, and not left since. */
export function isOnSharedCar(
  memberships: SharedCarMemberships,
  spaceId: string
): boolean {
  const joined = memberships.cars[spaceId]
  if (!joined) return false
  const left = memberships.leftCars[spaceId]
  return left === undefined || joined.at > left
}

/** Every space the User is on, by the roster's rule. */
export const activeSharedCarIds = (memberships: SharedCarMemberships) =>
  Object.keys(memberships.cars).filter((spaceId) =>
    isOnSharedCar(memberships, spaceId)
  )

/**
 * Two devices' memberships as one (the Buddies roster's `cars` and `leftCars`):
 * a union, keeping the latest time of each.
 */
export function mergeSharedCarMemberships(
  a: SharedCarMemberships,
  b: SharedCarMemberships
): SharedCarMemberships {
  const cars = { ...a.cars }
  for (const [spaceId, { at }] of Object.entries(b.cars))
    if (!cars[spaceId] || cars[spaceId].at < at) cars[spaceId] = { at }
  const leftCars = { ...a.leftCars }
  for (const [spaceId, at] of Object.entries(b.leftCars))
    leftCars[spaceId] = Math.max(leftCars[spaceId] ?? 0, at)
  return { cars, leftCars }
}

/**
 * The most `leftCars` entries the Buddies roster carries, the latest kept:
 * about 4 KB of its 32 KB cap, when the rest leaves that much.
 */
export const MAX_ROSTER_LEFT_CARS = 100

/**
 * The memberships as the Buddies roster carries them, in at most `room` bytes
 * of its JSON, so the roster stays within the relay's 32 KB cap: the cars the
 * User is on, newest first, then the latest cars they've left (at most
 * `MAX_ROSTER_LEFT_CARS`). A car left since it was joined has done its job in
 * `cars` and stays out.
 *
 * Whatever doesn't fit stays on this device only. A device that misses a
 * `leftCars` entry ends that car on its next sync instead, which gets `gone`
 * and keeps the same personal copy, so no data repeats; one that misses a
 * `cars` entry (more cars than fit) doesn't pick that car up.
 */
export function rosterSharedCarMemberships(
  memberships: SharedCarMemberships,
  room = Infinity
): SharedCarMemberships {
  let left = room
  /** Takes an entry's bytes (`"<id>":<value>,`) from the room, if it fits. */
  const fits = (spaceId: string, value: unknown) => {
    const bytes = spaceId.length + JSON.stringify(value).length + 4
    if (bytes > left) return false
    left -= bytes
    return true
  }
  const cars: SharedCarMemberships['cars'] = {}
  for (const [spaceId, entry] of Object.entries(memberships.cars)
    .filter(([spaceId]) => isOnSharedCar(memberships, spaceId))
    .sort(([a, x], [b, y]) => y.at - x.at || a.localeCompare(b)))
    if (fits(spaceId, entry)) cars[spaceId] = { at: entry.at }
  const leftCars: SharedCarMemberships['leftCars'] = {}
  for (const [spaceId, at] of Object.entries(memberships.leftCars)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, MAX_ROSTER_LEFT_CARS))
    if (fits(spaceId, at)) leftCars[spaceId] = at
  return { cars, leftCars }
}

/** One of the User's open invitations on a car, as `car.cancel` names it. */
export type OpenCarInvite = Pick<
  SharedCarInvite,
  'inviteId' | 'tag' | 'expiresAt'
> & { spaceId: string }

/**
 * The open invitations the User sent to the person whose tag on each car is
 * `tagOn(spaceId)`: theirs to cancel, as the inviter.
 */
export function openInvitesTo(
  cars: Record<string, SharedCar>,
  tagOn: (spaceId: string) => string,
  now: number
): OpenCarInvite[] {
  return Object.values(cars).flatMap((car) => {
    const tag = tagOn(car.spaceId)
    return car.invites
      .filter(
        (invite) =>
          invite.tag === tag &&
          invite.invitedBy === car.myMemberId &&
          invite.expiresAt > now
      )
      .map(({ inviteId, expiresAt }) => ({
        spaceId: car.spaceId,
        inviteId,
        tag,
        expiresAt,
      }))
  })
}

/**
 * Whether a buddy's answer (`car.reply`) to invitation `inviteId` on `spaceId`
 * is about a car the User is on and, while its `i.` record is here, an
 * invitation that went to them (`tag`, their inbox hashed for the car).
 */
export function carReplyApplies(
  state: {
    memberships: SharedCarMemberships
    cars: Record<string, SharedCar>
  },
  spaceId: string,
  inviteId: string,
  tag: string
): boolean {
  if (!isOnSharedCar(state.memberships, spaceId)) return false
  const record = state.cars[spaceId]?.inviteRecords.find(
    (invite) => invite.inviteId === inviteId
  )
  return !record || record.tag === tag
}

/** A car's name in an invitation, at most this long. */
export const CAR_INVITE_NAME_MAX = 60

const B64U_ID = /^[A-Za-z0-9_-]{22}$/
const B64U_32 = /^[A-Za-z0-9_-]{43}$/

/**
 * A `car.invite` event's fields as the engine joins with them, or null when
 * they aren't one: ids of 16 bytes, a secret and key of 32, a whole epoch.
 * Unknown fields are dropped.
 */
export function parseCarInvitePayload(value: unknown): CarInvitePayload | null {
  const invite = value as Partial<
    Record<keyof CarInvitePayload, unknown>
  > | null
  if (
    typeof invite?.spaceId !== 'string' ||
    !B64U_ID.test(invite.spaceId) ||
    typeof invite.inviteId !== 'string' ||
    !B64U_ID.test(invite.inviteId) ||
    typeof invite.joinSecret !== 'string' ||
    !B64U_32.test(invite.joinSecret) ||
    typeof invite.key !== 'string' ||
    !B64U_32.test(invite.key) ||
    !Number.isSafeInteger(invite.epoch) ||
    (invite.epoch as number) < 1 ||
    typeof invite.name !== 'string' ||
    !Number.isSafeInteger(invite.people) ||
    typeof invite.expiresAt !== 'number'
  )
    return null
  return {
    spaceId: invite.spaceId,
    inviteId: invite.inviteId,
    joinSecret: invite.joinSecret,
    epoch: invite.epoch as number,
    key: invite.key,
    name: Array.from(invite.name).slice(0, CAR_INVITE_NAME_MAX).join(''),
    people: invite.people as number,
    expiresAt: invite.expiresAt,
  }
}
