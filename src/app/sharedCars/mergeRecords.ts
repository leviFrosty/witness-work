import type { MileageCollection } from '@/lib/mileage/records'
import { collectionHolding, sharedRecordState } from '@/lib/mileage/sharedCar'
import {
  epochOfKeysRecord,
  idInRecordId,
  MEMBER_RECORD_FIELDS,
  readInviteData,
  readMemberData,
  spaceKindOf,
} from '@/lib/sharedSpaces/records'
import {
  collectionOf,
  isSharedCarKind,
  readMileageRecord,
  unknownFields,
  unreadMileageFields,
} from '@/app/sharedCars/carRecords'
import type {
  SharedCar,
  SharedCarInvite,
  SharedCarMember,
  SharedCarRecordKind,
  SharedCarTombstone,
  SharedSpaceTombstone,
} from '@/types/sharedCars'

/**
 * Merging what a sync pulls into this device's copy of a car, by mileage's
 * per-record rule, which is also the server's: the newest stamp wins, and on an
 * equal stamp a deletion wins. Two live versions with the same stamp are the
 * server's to choose (by blob hash, which this device can't recompute), so the
 * one it returns wins. A record kept here because it's newer is already
 * pending, since only a change made here can be newer than the server's.
 *
 * A page merges in one pass (`createCarMerge`), each record found by id, so a
 * sync of thousands of records stays linear.
 */

/** A record as it opened: its place, its stamp, and its plaintext. */
export type OpenedRecord = {
  recordId: string
  stamp: number
  deleted: boolean
  kind: string
  /** Absent on a deletion. */
  data?: Record<string, unknown>
}

/**
 * What merging one record did: `applied` (it was newer), `kept` (the car's own
 * is newer, or it's one no version uses, such as a second car or a kind that
 * disagrees with its id), or `unusable` (an unknown kind, or data this version
 * can't read, which a newer app may: kept to read again after an update).
 */
export type MergeVerdict = 'applied' | 'kept' | 'unusable'

const INVITE_RECORD_FIELDS = ['invitedBy', 'name', 'tag', 'expiresAt']

type WithId = { id: string; updatedAt?: number }
type RecordState = { stamp: number; deleted: boolean }

/** Whether `incoming` replaces what the car holds for its id. */
export function incomingWins(
  local: RecordState | undefined,
  incoming: RecordState
): boolean {
  if (!local) return true
  if (incoming.stamp !== local.stamp) return incoming.stamp > local.stamp
  if (incoming.deleted !== local.deleted) return incoming.deleted
  return true
}

/** A map from a list, by `keyOf`, keeping the list's order. */
const byKey = <T, K>(items: readonly T[], keyOf: (item: T) => K) =>
  new Map(items.map((item) => [keyOf(item), item]))

/**
 * Merges records into `car` one at a time, then `finish()` makes the merged
 * car, with only what changed copied. Each record's pending mark goes when the
 * server's version replaces it.
 */
export function createCarMerge(car: SharedCar) {
  /** What changed, by record id: its state now, for the next record. */
  const states = new Map<string, RecordState | null>()
  /** The collection holding each moved mileage record now (null: none). */
  const holders = new Map<string, MileageCollection | null>()
  const collections = new Map<MileageCollection, Map<string, WithId>>()
  let tombstones: Map<string, SharedCarTombstone> | null = null
  let members: Map<string, SharedCarMember> | null = null
  let invites: Map<string, SharedCarInvite> | null = null
  let keys: Map<number, { epoch: number; stamp: number }> | null = null
  let spaceTombstones: Map<string, SharedSpaceTombstone> | null = null
  let extras: Record<string, Record<string, unknown>> | null = null
  const settled = new Set<string>()

  const stateOf = (id: string) =>
    states.has(id) ? (states.get(id) ?? undefined) : sharedRecordState(car, id)
  const holderOf = (id: string) =>
    holders.has(id) ? holders.get(id) : collectionHolding(car, id)
  const collection = (key: MileageCollection) => {
    let records = collections.get(key)
    if (!records) {
      records = byKey(car[key] as WithId[], (record) => record.id)
      collections.set(key, records)
    }
    return records
  }
  const mileageTombstones = () =>
    (tombstones ??= byKey(car.deletedMileageRecords, (t) => t.id))
  const memberRecords = () =>
    (members ??= byKey(car.memberRecords, (m) => m.memberId))
  const inviteRecords = () =>
    (invites ??= byKey(car.inviteRecords, (i) => i.inviteId))
  const keyRecords = () => (keys ??= byKey(car.keyRecords, (k) => k.epoch))
  const deletedSpaceRecords = () =>
    (spaceTombstones ??= byKey(car.deletedSpaceRecords, (t) => t.id))
  const setExtra = (id: string, extra: Record<string, unknown> | null) => {
    if (!extra && !(extras ?? car.extraFields)[id]) return
    extras ??= { ...car.extraFields }
    if (extra) extras[id] = extra
    else delete extras[id]
  }

  /** The mileage record `id` out of whichever collection holds it. */
  function removeMileage(id: string) {
    const holder = holderOf(id)
    if (holder) collection(holder).delete(id)
    holders.set(id, null)
  }

  function applyMileage(
    kind: SharedCarRecordKind,
    record: OpenedRecord
  ): MergeVerdict {
    if (record.deleted) {
      removeMileage(record.recordId)
      mileageTombstones().set(record.recordId, {
        id: record.recordId,
        deletedAt: record.stamp,
        kind,
      })
      setExtra(record.recordId, null)
      return 'applied'
    }
    const data = record.data ?? {}
    const parsed = readMileageRecord(kind, record.recordId, record.stamp, data)
    if (!parsed) return 'unusable'
    const key = collectionOf(kind)
    // One car per space: another `car` record can't add a second.
    if (
      kind === 'car' &&
      [...collection('vehicles').keys()].some((id) => id !== record.recordId)
    )
      return 'kept'
    removeMileage(record.recordId)
    collection(key).set(record.recordId, parsed)
    holders.set(record.recordId, key)
    mileageTombstones().delete(record.recordId)
    setExtra(record.recordId, unreadMileageFields(data, parsed))
    return 'applied'
  }

  function applySpaceDeletion(record: OpenedRecord) {
    const id = idInRecordId(record.recordId)
    if (id !== null) {
      memberRecords().delete(id)
      inviteRecords().delete(id)
    }
    deletedSpaceRecords().set(record.recordId, {
      id: record.recordId,
      deletedAt: record.stamp,
    })
    setExtra(record.recordId, null)
  }

  function applyMember(memberId: string, record: OpenedRecord): MergeVerdict {
    if (record.deleted) {
      applySpaceDeletion(record)
      return 'applied'
    }
    const data = readMemberData(record.data ?? {})
    if (!data) return 'unusable'
    deletedSpaceRecords().delete(record.recordId)
    memberRecords().set(memberId, {
      memberId,
      ...data,
      updatedAt: record.stamp,
    })
    setExtra(
      record.recordId,
      unknownFields(record.data ?? {}, MEMBER_RECORD_FIELDS)
    )
    return 'applied'
  }

  function applyInvite(inviteId: string, record: OpenedRecord): MergeVerdict {
    if (record.deleted) {
      applySpaceDeletion(record)
      return 'applied'
    }
    const data = readInviteData(record.data ?? {})
    if (!data) return 'unusable'
    deletedSpaceRecords().delete(record.recordId)
    inviteRecords().set(inviteId, {
      inviteId,
      ...data,
      updatedAt: record.stamp,
    })
    setExtra(
      record.recordId,
      unknownFields(record.data ?? {}, INVITE_RECORD_FIELDS)
    )
    return 'applied'
  }

  /** Merges one record into the car being built. */
  function apply(record: OpenedRecord): MergeVerdict {
    const spaceKind = spaceKindOf(record.recordId)
    if (spaceKind !== null && record.kind !== spaceKind) return 'kept'
    if (spaceKind === null && !isSharedCarKind(record.kind)) return 'unusable'
    if (!incomingWins(stateOf(record.recordId), record)) return 'kept'
    let verdict: MergeVerdict
    if (spaceKind === 'member' || spaceKind === 'invite') {
      const id = idInRecordId(record.recordId)
      verdict =
        id === null
          ? 'kept'
          : spaceKind === 'member'
            ? applyMember(id, record)
            : applyInvite(id, record)
    } else if (spaceKind === 'keys') {
      const epoch = epochOfKeysRecord(record.recordId)
      if (epoch === null || record.deleted) verdict = 'kept'
      else {
        keyRecords().set(epoch, { epoch, stamp: record.stamp })
        verdict = 'applied'
      }
    } else {
      verdict = applyMileage(record.kind as SharedCarRecordKind, record)
    }
    if (verdict !== 'applied') return verdict
    states.set(record.recordId, {
      stamp: record.stamp,
      deleted: record.deleted,
    })
    settled.add(record.recordId)
    return 'applied'
  }

  /** The merged car; `car` itself when nothing applied. */
  function finish(): SharedCar {
    if (states.size === 0) return car
    const next: SharedCar = { ...car }
    for (const [key, records] of collections)
      Object.assign(next, { [key]: [...records.values()] })
    if (tombstones) next.deletedMileageRecords = [...tombstones.values()]
    if (members) next.memberRecords = [...members.values()]
    if (invites) next.inviteRecords = [...invites.values()]
    if (keys) next.keyRecords = [...keys.values()]
    if (spaceTombstones)
      next.deletedSpaceRecords = [...spaceTombstones.values()]
    if (extras) next.extraFields = extras
    if (car.pendingPuts.some((id) => settled.has(id)))
      next.pendingPuts = car.pendingPuts.filter((id) => !settled.has(id))
    return next
  }

  return { apply, finish }
}
