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

export function mileageRecordData(record: object): Record<string, unknown> {
  const { id: _id, ...rest } = record as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined)
  )
}

export const sharedRecordFits = (kind: string, data: Record<string, unknown>) =>
  encodePlaintext(kind, data, false).length <= RECORD_PLAINTEXT_MAX_BYTES

const MEMBER_ID_ROOM = 'x'.repeat(22)

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

type MileageIndex = Map<string, { key: MileageCollection; at: number }>

const mileageIndexes = new WeakMap<object, MileageIndex>()

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

export function collectionHolding(
  car: Pick<SharedCar, MileageCollection>,
  id: string
): MileageCollection | undefined {
  return mileageIndex(car).get(id)?.key
}

export function mileageRecordOn(
  car: Pick<SharedCar, MileageCollection>,
  id: string
): MileageRecord | undefined {
  const found = mileageIndex(car).get(id)
  return found && (car[found.key][found.at] as MileageRecord)
}

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

export const withSharedCarDefaults = (car: SharedCar): SharedCar =>
  emptySharedCar(car.spaceId, car)

type StateIndex = Map<string, { stamp: number; deleted: boolean }>

const stateIndexes = new WeakMap<SharedCar, StateIndex>()

function stateIndex(car: SharedCar): StateIndex {
  const cached = stateIndexes.get(car)
  if (cached) return cached
  const index: StateIndex = new Map()

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

export function sharedRecordState(
  car: SharedCar,
  id: string
): { stamp: number; deleted: boolean } | undefined {
  return stateIndex(car).get(id)
}

export const sharedRecordStamp = (car: SharedCar, id: string) =>
  sharedRecordState(car, id)?.stamp

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

export const MAX_SHARED_CAR_PEOPLE = 10

export const openCarInvites = (car: Pick<SharedCar, 'invites'>, now: number) =>
  car.invites.filter((invite) => invite.expiresAt > now)

export const takenCarPlaces = (
  car: Pick<SharedCar, 'members' | 'unnamedMembers' | 'invites'>,
  now: number
) =>
  car.members.length +
  (car.unnamedMembers?.length ?? 0) +
  openCarInvites(car, now).length

export function isOnSharedCar(
  memberships: SharedCarMemberships,
  spaceId: string
): boolean {
  const joined = memberships.cars[spaceId]
  if (!joined) return false
  const left = memberships.leftCars[spaceId]
  return left === undefined || joined.at > left
}

export const activeSharedCarIds = (memberships: SharedCarMemberships) =>
  Object.keys(memberships.cars).filter((spaceId) =>
    isOnSharedCar(memberships, spaceId)
  )

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

export const MAX_ROSTER_LEFT_CARS = 100

export function rosterSharedCarMemberships(
  memberships: SharedCarMemberships,
  room = Infinity
): SharedCarMemberships {
  let left = room

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

export type OpenCarInvite = Pick<
  SharedCarInvite,
  'inviteId' | 'tag' | 'expiresAt'
> & { spaceId: string }

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

export const CAR_INVITE_NAME_MAX = 60

const B64U_ID = /^[A-Za-z0-9_-]{22}$/
const B64U_32 = /^[A-Za-z0-9_-]{43}$/

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
