import {
  HEADER_RECORD_ID,
  inScopeRecordId,
  mayWriteRecord,
  streetRecordId,
  territoryWideRecordId,
  workedRecordId,
} from '@/lib/sharedSpaces/records'
import { isUuid } from '@/lib/sharedSpaces/scopes'
import {
  doorGroupsOf,
  scopedView,
  scopeOfStreet,
} from '@/features/territories/lib/shared/projection'
import {
  doNotCallData,
  doorData,
  sameData,
  streetData,
  territoryData,
  withUnknownFields,
  workedData,
} from '@/features/territories/lib/shared/territoryRecords'
import type {
  TerritorySpace,
  TerritorySpaceLocal,
  TerritorySpaceRecord,
} from '@/features/territories/types/sharedTerritory'
import type {
  Territory,
  TerritoryDoNotCall,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export type DiffContext = {
  me: string

  myName?: string

  houseRecords: boolean

  stamp: (previous?: number) => number
}

export type TerritoryChanges = {
  records: Record<string, TerritorySpaceRecord>
  local: TerritorySpaceLocal
}

const lower = (id: string) => id.toLowerCase()

const EMPTY_TERRITORY: Territory = {
  id: '',
  number: '',
  checkedOutAt: 0,
  createdAt: 0,
  streets: [],
  doNotCalls: [],
}

export function diffTerritory(
  before: Territory | null,
  after: Territory,
  space: Pick<
    TerritorySpace,
    | 'records'
    | 'local'
    | 'myMemberId'
    | 'ownerId'
    | 'members'
    | 'invites'
    | 'holders'
    | 'links'
    | 'spaceId'
    | 'territoryId'
  >,
  context: DiffContext
): TerritoryChanges {
  const was = before ?? EMPTY_TERRITORY
  const records: Record<string, TerritorySpaceRecord> = {}
  const { me } = context
  const groups = doorGroupsOf(space as TerritorySpace)

  const put = (
    recordId: string,
    kind: string,
    data: Record<string, unknown>
  ) => {
    const previous = space.records[recordId]
    const full = withUnknownFields(
      kind,
      previous && !previous.deleted ? previous.data : undefined,
      data
    )
    if (previous && !previous.deleted && sameData(previous.data, full)) return
    records[recordId] = {
      kind,
      data: full,
      stamp: context.stamp(previous?.stamp),
      deleted: false,
    }
  }
  const drop = (recordId: string) => {
    const previous = space.records[recordId] ?? records[recordId]
    if (!previous || previous.deleted) return
    records[recordId] = {
      kind: previous.kind,
      stamp: context.stamp(previous.stamp),
      deleted: true,
    }
  }

  const headerOf = (territory: Territory) =>
    territoryData(
      territory.id ? territory : { ...territory, id: space.territoryId },
      context.houseRecords
    )
  put(HEADER_RECORD_ID, 'territory', headerOf(after))

  const local: TerritorySpaceLocal = {
    ...(after.photo !== undefined && { photo: after.photo }),
    next: Object.fromEntries(
      after.streets.map((street) => [street.id, street.next])
    ),
  }

  const wasStreets = new Map(was.streets.map((s) => [lower(s.id), s]))
  const nowStreets = new Map(after.streets.map((s) => [lower(s.id), s]))

  const scopeIdOf = (streetId: string) =>
    isUuid(streetId) ? scopeOfStreet(streetId) : null

  for (const [streetId] of wasStreets) {
    if (nowStreets.has(streetId)) continue
    const scopeId = scopeIdOf(streetId)
    if (!scopeId) continue
    drop(streetRecordId(scopeId))
    const prefix = `s.${scopeId}.`
    for (const recordId of Object.keys(space.records))
      if (recordId.startsWith(prefix)) drop(recordId)
  }

  after.streets.forEach((street, order) => {
    const streetId = lower(street.id)
    const scopeId = scopeIdOf(streetId)
    if (!scopeId) return
    const previous = wasStreets.get(streetId)
    put(streetRecordId(scopeId), 'street', streetData(street, order))
    diffWorked(scopeId, previous, street)
    diffDoors(scopeId, previous, street, groups.get(streetId))
  })

  function diffWorked(
    scopeId: string,
    previous: TerritoryStreet | undefined,
    street: TerritoryStreet
  ) {
    const recordId = workedRecordId(scopeId)
    if (
      previous !== undefined &&
      previous.workedAt === street.workedAt &&
      previous.workedBy === street.workedBy
    )
      return
    if (street.workedAt === undefined && !space.records[recordId]) return
    const by = street.workedBy ?? me
    const byName =
      by === me
        ? context.myName
        : (space.records[recordId]?.data?.byName as string | undefined)
    put(recordId, 'worked', workedData(street.workedAt, by, byName))
  }

  function diffDoors(
    scopeId: string,
    previous: TerritoryStreet | undefined,
    street: TerritoryStreet,
    folded: Map<string, string[]> | undefined
  ) {
    const wasDoors = new Map(
      (previous?.doors ?? []).map((door) => [lower(door.id), door])
    )
    const nowDoors = new Map(street.doors.map((door) => [lower(door.id), door]))
    const others = (doorId: string) =>
      (folded?.get(doorId) ?? []).filter((id) => id !== doorId)
    for (const [doorId] of wasDoors) {
      if (nowDoors.has(doorId) || !isUuid(doorId)) continue
      drop(inScopeRecordId(scopeId, doorId))
      for (const other of others(doorId)) drop(inScopeRecordId(scopeId, other))
    }
    for (const [doorId, door] of nowDoors) {
      if (!isUuid(doorId)) continue
      const had = wasDoors.get(doorId)
      if (had && sameDoor(had, door)) continue
      const recordId = inScopeRecordId(scopeId, doorId)
      const by = door.by ?? me
      const stored = space.records[recordId]?.data
      const byName =
        by === me
          ? context.myName
          : stored?.by === by
            ? (stored.byName as string | undefined)
            : undefined
      put(recordId, 'door', doorData(door, by, byName))
      for (const other of others(doorId)) drop(inScopeRecordId(scopeId, other))
    }
  }

  const doNotCallId = (entry: TerritoryDoNotCall) => {
    const id = lower(entry.id)
    if (!isUuid(id)) return null
    const streetId = entry.streetId && lower(entry.streetId)
    const scopeId =
      streetId && nowStreets.has(streetId) ? scopeIdOf(streetId) : null
    return scopeId ? inScopeRecordId(scopeId, id) : territoryWideRecordId(id)
  }
  const wasDoNotCalls = new Map(
    was.doNotCalls.map((entry) => [doNotCallId(entry), entry])
  )
  const nowDoNotCalls = new Map(
    after.doNotCalls.map((entry) => [doNotCallId(entry), entry])
  )
  for (const [recordId] of wasDoNotCalls)
    if (recordId && !nowDoNotCalls.has(recordId)) drop(recordId)
  for (const [recordId, entry] of nowDoNotCalls) {
    if (!recordId) continue
    const had = wasDoNotCalls.get(recordId)
    if (had && sameData(doNotCallData(had), doNotCallData(entry))) continue
    put(recordId, 'doNotCall', doNotCallData(entry))
  }

  const view = scopedView(space as TerritorySpace)
  const writable = Object.fromEntries(
    Object.entries(records).filter(([recordId]) =>
      mayWriteRecord(view, { memberId: me }, recordId)
    )
  )
  return { records: writable, local }
}

const sameDoor = (left: TerritoryDoor, right: TerritoryDoor) =>
  left.label === right.label &&
  left.outcome === right.outcome &&
  left.at === right.at &&
  left.tries === right.tries &&
  left.description === right.description &&
  left.by === right.by &&
  left.coordinateSource === right.coordinateSource &&
  sameData(left.coordinate, right.coordinate)
