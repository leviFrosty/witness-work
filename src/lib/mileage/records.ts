import { syncTimestamp } from '@/lib/syncClock'
import { stampPastTombstone, withoutTombstones } from '@/lib/syncTombstones'
import type {
  MileageCollections,
  MileageSnapshot,
  MileageTombstone,
} from '@/types/mileage'

export type MileageCollection = keyof MileageCollections

export type MileageRecord<K extends MileageCollection = MileageCollection> =
  MileageCollections[K][number]

export type MileageMatch = Partial<{
  [K in MileageCollection]: (record: MileageRecord<K>) => boolean
}>

type WithId = { id: string; updatedAt?: number }

export const MILEAGE_COLLECTIONS: readonly MileageCollection[] = [
  'vehicles',
  'fuels',
  'fuelPrices',
  'vehicleSetups',
  'trips',
]

export function upsertMileageRecord<K extends MileageCollection>(
  state: MileageSnapshot,
  key: K,
  record: MileageRecord<K>
): Partial<MileageSnapshot> {
  const records = state[key] as WithId[]
  const existing = records.find((r) => r.id === record.id)
  if (existing) {
    const stamped = { ...record, updatedAt: syncTimestamp(existing.updatedAt) }
    return {
      [key]: records.map((r) => (r.id === record.id ? stamped : r)),
    }
  }
  return {
    [key]: [
      ...records,
      {
        ...record,
        updatedAt: stampPastTombstone(state.deletedMileageRecords, record.id),
      },
    ],
    deletedMileageRecords: withoutTombstones(
      state.deletedMileageRecords,
      new Set([record.id])
    ),
  }
}

export function removeMileageRecords(
  state: MileageSnapshot,
  match: MileageMatch
): { changes: Partial<MileageSnapshot>; removedIds: string[] } {
  const tombstones: MileageTombstone[] = []
  const changes: Partial<MileageSnapshot> = {}
  for (const key of Object.keys(match) as MileageCollection[]) {
    const predicate = match[key] as (record: WithId) => boolean
    const records = state[key] as WithId[]
    const kept = records.filter((record) => {
      if (!predicate(record)) return true
      tombstones.push({
        id: record.id,
        deletedAt: syncTimestamp(record.updatedAt),
      })
      return false
    })
    if (kept.length !== records.length) Object.assign(changes, { [key]: kept })
  }
  if (tombstones.length === 0) return { changes: {}, removedIds: [] }
  const removedIds = tombstones.map((t) => t.id)
  const deletedIds = new Set(removedIds)
  return {
    changes: {
      ...changes,
      deletedMileageRecords: [
        ...state.deletedMileageRecords.filter((t) => !deletedIds.has(t.id)),
        ...tombstones,
      ],
    },
    removedIds,
  }
}

export function tombstonesPast(
  state: MileageSnapshot,
  match: MileageMatch
): MileageTombstone[] {
  return (Object.keys(match) as MileageCollection[]).flatMap((key) =>
    (state[key] as WithId[])
      .filter(match[key] as (record: WithId) => boolean)
      .map((record) => ({
        id: record.id,
        deletedAt: (record.updatedAt ?? 0) + 1,
      }))
  )
}

export function mergeMileageRecords(
  state: MileageSnapshot,
  incoming: Partial<MileageSnapshot>
): Partial<MileageSnapshot> {
  const changes: Partial<MileageSnapshot> = {}
  const tombstones = new Map(state.deletedMileageRecords.map((t) => [t.id, t]))
  let tombstonesChanged = false

  for (const tombstone of incoming.deletedMileageRecords ?? []) {
    const held = tombstones.get(tombstone.id)
    if (held && held.deletedAt >= tombstone.deletedAt) continue
    tombstones.set(tombstone.id, {
      id: tombstone.id,
      deletedAt: tombstone.deletedAt,
    })
    tombstonesChanged = true
  }

  const revived = new Set<string>()
  for (const key of MILEAGE_COLLECTIONS) {
    const records = state[key] as WithId[]
    const arriving = (incoming[key] ?? []) as WithId[]
    let next: WithId[] | null = null
    const index = new Map(records.map((record, i) => [record.id, i]))
    for (const record of arriving) {
      const stamp = record.updatedAt ?? 0
      const at = index.get(record.id)
      if (at !== undefined) {
        if (stamp <= ((next ?? records)[at].updatedAt ?? 0)) continue
        next ??= [...records]
        next[at] = record
        continue
      }
      const tombstone = tombstones.get(record.id)
      if (tombstone && stamp <= tombstone.deletedAt) continue
      if (tombstone) revived.add(record.id)
      next ??= [...records]
      index.set(record.id, next.length)
      next.push(record)
    }

    if (tombstonesChanged) {
      const kept = (next ?? records).filter((record) => {
        const tombstone = tombstones.get(record.id)
        if (!tombstone) return true
        if ((record.updatedAt ?? 0) <= tombstone.deletedAt) return false
        revived.add(record.id)
        return true
      })
      if (kept.length !== (next ?? records).length) next = kept
    }
    if (next) Object.assign(changes, { [key]: next })
  }
  if (tombstonesChanged || revived.size > 0)
    changes.deletedMileageRecords = [...tombstones.values()].filter(
      (t) => !revived.has(t.id)
    )
  return changes
}

export function hasMileageMatch(
  state: MileageCollections,
  match: MileageMatch
): boolean {
  return (Object.keys(match) as MileageCollection[]).some((key) =>
    (state[key] as WithId[]).some(match[key] as (record: WithId) => boolean)
  )
}

export const matchRecord = (
  key: MileageCollection,
  id: string
): MileageMatch => ({ [key]: (record: WithId) => record.id === id })

export const matchVehicle = (id: string): MileageMatch => ({
  vehicles: (v) => v.id === id,
  vehicleSetups: (s) => s.vehicleId === id,
  trips: (t) => t.vehicleId === id,
})

export const matchFuel = (id: string): MileageMatch => ({
  fuels: (f) => f.id === id,
  fuelPrices: (p) => p.fuelId === id,
})

export const matchEverything: MileageMatch = {
  vehicles: () => true,
  fuels: () => true,
  fuelPrices: () => true,
  vehicleSetups: () => true,
  trips: () => true,
}

export function mileageRecordStamp(
  state: MileageSnapshot,
  id: string
): number | undefined {
  for (const key of MILEAGE_COLLECTIONS) {
    const record = (state[key] as WithId[]).find((r) => r.id === id)
    if (record) return record.updatedAt ?? 0
  }
  return state.deletedMileageRecords.find((t) => t.id === id)?.deletedAt
}
