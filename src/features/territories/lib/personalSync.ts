import { canonicalJson } from '@/lib/canonicalJson'
import { SPACE_ID_PATTERN } from '@/lib/sharedSpaces/crypto'
import {
  clearDoorRecords,
  type FormatDoorAddress,
  nextUnrecorded,
  startNumber,
} from '@/features/territories/lib/doors'
import { foldDoors } from '@/features/territories/lib/shared/projection'
import {
  doNotCallData,
  doorData,
  readDoNotCallData,
  readDoorData,
  readStreetData,
  readTerritoryData,
  streetData,
  territoryData,
} from '@/features/territories/lib/shared/territoryRecords'
import type {
  Territory,
  TerritoryDoNotCall,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export type PersonalKind =
  | 'territory'
  | 'street'
  | 'worked'
  | 'door'
  | 'doNotCall'

type Data = Record<string, unknown>

export type PersonalRecord = {
  kind: string
  data: Data
  updatedAt: number
}

export type PersonalEntry = {
  records: Record<string, PersonalRecord>
  deleted: Record<string, number>
}

export type PersonalLedger = Record<string, PersonalEntry>

export type TerritorySyncRecord = PersonalRecord & { id: string }

export type TerritorySyncTombstone = { id: string; deletedAt: number }

export type TerritorySyncSlice = {
  territoryRecords: TerritorySyncRecord[]
  deletedTerritoryRecords: TerritorySyncTombstone[]
}

export type Stamp = (previous?: number) => number

export type HeldTerritories = ReadonlyMap<string, number | undefined>

export type SharedMark = { spaceId: string; ownerId: string; at: number }

export type SharedMarks = ReadonlyMap<string, SharedMark>

export const HEADER = 'h'

const SAFE_ID = /^[A-Za-z0-9_-]+$/

const safe = (id: string | undefined): id is string =>
  typeof id === 'string' && SAFE_ID.test(id)

export const streetKey = (streetId: string) => `s.${streetId}`
export const workedKey = (streetId: string) => `s.${streetId}.w`
export const inStreetKey = (streetId: string, id: string) =>
  `s.${streetId}.${id}`
export const wideKey = (id: string) => `d.${id}`

type KeyParts =
  | { at: 'header' }
  | { at: 'street'; streetId: string }
  | { at: 'worked'; streetId: string }
  | { at: 'inStreet'; streetId: string; id: string }
  | { at: 'wide'; id: string }

export function parseKey(key: string): KeyParts | null {
  if (key === HEADER) return { at: 'header' }
  const [head, first, second, ...rest] = key.split('.')
  if (rest.length > 0) return null
  if (head === 'd' && safe(first) && second === undefined)
    return { at: 'wide', id: first }
  if (head !== 's' || !safe(first)) return null
  if (second === undefined) return { at: 'street', streetId: first }
  if (second === 'w') return { at: 'worked', streetId: first }
  return safe(second) ? { at: 'inStreet', streetId: first, id: second } : null
}

const isFinalKey = (key: string) => {
  const parts = parseKey(key)
  return parts?.at === 'header' || parts?.at === 'street'
}

const KNOWN: Record<PersonalKind, readonly string[]> = {
  territory: [
    'id',
    'number',
    'name',
    'link',
    'coordinate',
    'outline',
    'checkedOutAt',
    'returnBy',
    'createdAt',
    'houseRecords',
    'finishedAt',
    'shared',
    'space',
  ],
  street: [
    'id',
    'name',
    'numbering',
    'first',
    'descending',
    'saveLocations',
    'houses',
    'order',
  ],
  worked: ['at', 'by', 'byName'],
  door: [
    'label',
    'outcome',
    'at',
    'tries',
    'coordinate',
    'coordinateSource',
    'description',
    'by',
    'byName',
  ],
  doNotCall: [
    'address',
    'at',
    'coordinate',
    'label',
    'name',
    'reason',
    'streetId',
  ],
}

function keepUnknown(
  kind: PersonalKind,
  previous: PersonalRecord | undefined,
  data: Data
): Data {
  if (!previous || previous.kind !== kind) return data
  const known = KNOWN[kind]
  const extra = Object.entries(previous.data).filter(
    ([field]) => !known.includes(field)
  )
  return extra.length > 0 ? { ...Object.fromEntries(extra), ...data } : data
}

const personalDoorData = (door: TerritoryDoor): Data => {
  const { by: _by, byName: _byName, ...data } = doorData(door, '', undefined)
  return data
}

function headerData(territory: Territory): Data {
  const { houseRecords: _houseRecords, ...data } = territoryData(
    territory,
    true
  )
  return territory.finishedAt === undefined
    ? data
    : { ...data, finishedAt: territory.finishedAt }
}

export function recordsOfTerritory(
  territory: Territory
): Map<string, { kind: PersonalKind; data: Data }> {
  const out = new Map<string, { kind: PersonalKind; data: Data }>()
  out.set(HEADER, { kind: 'territory', data: headerData(territory) })
  const streets = new Set<string>()
  territory.streets.forEach((street, order) => {
    if (!safe(street.id) || streets.has(street.id)) return
    streets.add(street.id)
    out.set(streetKey(street.id), {
      kind: 'street',
      data: streetData(street, order),
    })
    if (street.workedAt !== undefined)
      out.set(workedKey(street.id), {
        kind: 'worked',
        data: { at: street.workedAt },
      })
    for (const door of street.doors)
      if (safe(door.id))
        out.set(inStreetKey(street.id, door.id), {
          kind: 'door',
          data: personalDoorData(door),
        })
  })
  for (const entry of territory.doNotCalls) {
    if (!safe(entry.id)) continue
    const data = doNotCallData(entry)
    if (entry.streetId !== undefined && streets.has(entry.streetId))
      out.set(inStreetKey(entry.streetId, entry.id), {
        kind: 'doNotCall',
        data,
      })
    else
      out.set(wideKey(entry.id), {
        kind: 'doNotCall',
        data:
          entry.streetId === undefined
            ? data
            : { ...data, streetId: entry.streetId },
      })
  }
  return out
}

const EMPTY_ENTRY: PersonalEntry = { records: {}, deleted: {} }

export const isDeleted = (entry: PersonalEntry | undefined) =>
  entry?.deleted[HEADER] !== undefined

export const isMarked = (entry: PersonalEntry | undefined) =>
  !isDeleted(entry) && entry?.records[HEADER]?.data.shared === true

const liveHeader = (entry: PersonalEntry | undefined) =>
  !isDeleted(entry) ? entry?.records[HEADER] : undefined

const sameRecord = (
  record: PersonalRecord | undefined,
  kind: string,
  data: Data
) =>
  record !== undefined &&
  record.kind === kind &&
  canonicalJson(record.data) === canonicalJson(data)

function writeTerritory(
  entry: PersonalEntry,
  territory: Territory,
  stamp: Stamp
): PersonalEntry {
  const wanted = recordsOfTerritory(territory)
  let records = entry.records
  let deleted = entry.deleted
  const put = (key: string, kind: PersonalKind, data: Data) => {
    const previous = records[key]
    const full = keepUnknown(kind, previous, data)
    if (sameRecord(previous, kind, full)) return
    const tombstone = deleted[key]
    if (tombstone !== undefined && isFinalKey(key)) return
    if (records === entry.records) records = { ...records }
    records[key] = {
      kind,
      data: full,
      updatedAt: stamp(Math.max(previous?.updatedAt ?? 0, tombstone ?? 0)),
    }
  }
  const drop = (key: string) => {
    const previous = records[key]
    if (!previous) return
    if (records === entry.records) records = { ...records }
    if (deleted === entry.deleted) deleted = { ...deleted }
    delete records[key]
    deleted[key] = stamp(Math.max(previous.updatedAt, deleted[key] ?? 0))
  }
  const finalStreets = new Set(
    Object.keys(deleted)
      .map(parseKey)
      .flatMap((parts) => (parts?.at === 'street' ? [parts.streetId] : []))
  )
  for (const [key, { kind, data }] of wanted) {
    const parts = parseKey(key)
    if (parts && 'streetId' in parts && finalStreets.has(parts.streetId))
      continue
    put(key, kind, data)
  }
  for (const key of Object.keys(entry.records)) if (!wanted.has(key)) drop(key)
  const next =
    records === entry.records && deleted === entry.deleted
      ? entry
      : { records, deleted }
  return prune(next)
}

function markShared(
  entry: PersonalEntry,
  stamp: Stamp,
  mark: SharedMark | undefined
): PersonalEntry {
  const header = entry.records[HEADER]
  if (!header) return entry
  const { space: _space, ...data } = header.data
  return {
    ...entry,
    records: {
      ...entry.records,
      [HEADER]: {
        ...header,
        data: {
          ...data,
          shared: true,
          ...(mark && {
            space: { id: mark.spaceId, owner: mark.ownerId, at: mark.at },
          }),
        },
        updatedAt: stamp(header.updatedAt),
      },
    },
  }
}

function deleteTerritory(entry: PersonalEntry, stamp: Stamp): PersonalEntry {
  const previous = Math.max(
    0,
    ...Object.values(entry.records).map((record) => record.updatedAt),
    ...Object.values(entry.deleted)
  )
  return { records: {}, deleted: { [HEADER]: stamp(previous) } }
}

export function personalTerritories(
  territories: readonly Territory[],
  held: HeldTerritories
): Territory[] {
  return territories.filter(
    (territory) =>
      territory.shared === undefined &&
      territory.received === undefined &&
      safe(territory.id) &&
      !held.has(territory.id)
  )
}

export function restampLedger(
  ledger: PersonalLedger,
  personal: readonly Territory[],
  held: HeldTerritories,
  stamp: Stamp,
  only?: ReadonlySet<string>,
  marks?: SharedMarks
): PersonalLedger {
  const byId = new Map(personal.map((territory) => [territory.id, territory]))
  const ids = only ?? new Set([...byId.keys(), ...Object.keys(ledger)])
  let next = ledger
  const set = (id: string, entry: PersonalEntry) => {
    if (entry === ledger[id]) return
    if (next === ledger) next = { ...ledger }
    next[id] = entry
  }
  for (const id of ids) {
    const entry = ledger[id]
    const territory = byId.get(id)
    if (territory) {
      if (isDeleted(entry)) continue
      set(id, writeTerritory(entry ?? EMPTY_ENTRY, territory, stamp))
      continue
    }
    const header = liveHeader(entry)
    if (!entry || !header || isMarked(entry)) continue
    if (held.has(id)) {
      const since = held.get(id)
      if (since !== undefined && header.updatedAt <= since)
        set(id, markShared(entry, stamp, marks?.get(id)))
      continue
    }
    set(id, deleteTerritory(entry, stamp))
  }
  return next
}

const wins = (left: PersonalRecord, right: PersonalRecord) =>
  left.updatedAt > right.updatedAt ||
  (left.updatedAt === right.updatedAt &&
    canonicalJson(left) > canonicalJson(right))

function prune(entry: PersonalEntry): PersonalEntry {
  if (entry.deleted[HEADER] !== undefined) {
    const onlyHeader =
      Object.keys(entry.records).length === 0 &&
      Object.keys(entry.deleted).length === 1
    return onlyHeader
      ? entry
      : { records: {}, deleted: { [HEADER]: entry.deleted[HEADER] } }
  }
  const goneStreets = new Set(
    Object.keys(entry.deleted)
      .map(parseKey)
      .flatMap((parts) => (parts?.at === 'street' ? [parts.streetId] : []))
  )
  const orphan = (key: string) => {
    if (goneStreets.size === 0) return null
    const parts = parseKey(key)
    return parts?.at === 'inStreet' || parts?.at === 'worked'
      ? goneStreets.has(parts.streetId)
        ? parts
        : null
      : null
  }
  let records = entry.records
  let deleted = entry.deleted
  const editRecords = () => {
    if (records === entry.records) records = { ...records }
    return records
  }
  const editDeleted = () => {
    if (deleted === entry.deleted) deleted = { ...deleted }
    return deleted
  }
  const moved: [string, PersonalRecord][] = []
  for (const key of Object.keys(entry.deleted)) {
    const parts = orphan(key)
    if (!parts) continue
    delete editDeleted()[key]
    if (parts.at !== 'inStreet') continue
    const wide = wideKey(parts.id)
    deleted[wide] = Math.max(deleted[wide] ?? 0, entry.deleted[key])
  }
  for (const [key, record] of Object.entries(entry.records)) {
    const parts = orphan(key)
    if (parts) {
      delete editRecords()[key]
      if (parts.at === 'inStreet' && record.kind === 'doNotCall')
        moved.push([
          wideKey(parts.id),
          { ...record, data: { ...record.data, streetId: parts.streetId } },
        ])
    }
  }
  for (const [key, record] of moved) {
    const mine = records[key]
    if (!mine || wins(record, mine)) editRecords()[key] = record
  }
  for (const [key, record] of Object.entries(records)) {
    const tombstone = deleted[key]
    if (
      tombstone !== undefined &&
      (isFinalKey(key) || record.updatedAt <= tombstone)
    )
      delete editRecords()[key]
  }
  return records === entry.records && deleted === entry.deleted
    ? entry
    : { records, deleted }
}

export function mergeEntries(
  left: PersonalEntry | undefined,
  right: PersonalEntry | undefined
): PersonalEntry {
  if (!left) return prune(right ?? EMPTY_ENTRY)
  if (!right) return prune(left)
  const deleted = { ...left.deleted }
  for (const [key, at] of Object.entries(right.deleted))
    deleted[key] = Math.max(deleted[key] ?? 0, at)
  const records = { ...left.records }
  for (const [key, record] of Object.entries(right.records)) {
    const mine = records[key]
    if (!mine || wins(record, mine)) records[key] = record
  }
  return prune({ records, deleted })
}

export function mergeLedgers(
  left: PersonalLedger,
  right: PersonalLedger
): PersonalLedger {
  const out: PersonalLedger = {}
  for (const id of new Set([...Object.keys(left), ...Object.keys(right)]))
    out[id] = mergeEntries(left[id], right[id])
  return out
}

export function ledgerToSlice(ledger: PersonalLedger): TerritorySyncSlice {
  const territoryRecords: TerritorySyncRecord[] = []
  const deletedTerritoryRecords: TerritorySyncTombstone[] = []
  for (const territoryId of Object.keys(ledger).sort()) {
    const entry = ledger[territoryId]
    for (const key of Object.keys(entry.records).sort())
      territoryRecords.push({
        id: `${territoryId}:${key}`,
        ...entry.records[key],
      })
    for (const key of Object.keys(entry.deleted).sort())
      deletedTerritoryRecords.push({
        id: `${territoryId}:${key}`,
        deletedAt: entry.deleted[key],
      })
  }
  return { territoryRecords, deletedTerritoryRecords }
}

export function splitSyncId(
  id: string
): { territoryId: string; key: string } | null {
  const at = id.indexOf(':')
  if (at <= 0) return null
  const territoryId = id.slice(0, at)
  const key = id.slice(at + 1)
  return safe(territoryId) && parseKey(key) ? { territoryId, key } : null
}

export function sliceToLedger(
  slice: Partial<TerritorySyncSlice> | undefined
): PersonalLedger {
  const ledger: PersonalLedger = {}
  const entry = (territoryId: string) =>
    (ledger[territoryId] ??= { records: {}, deleted: {} })
  for (const { id, deletedAt } of slice?.deletedTerritoryRecords ?? []) {
    const parts = splitSyncId(id)
    if (!parts) continue
    const { deleted } = entry(parts.territoryId)
    deleted[parts.key] = Math.max(deleted[parts.key] ?? 0, deletedAt)
  }
  for (const { id, kind, data, updatedAt } of slice?.territoryRecords ?? []) {
    const parts = splitSyncId(id)
    if (!parts) continue
    const { records } = entry(parts.territoryId)
    const record = { kind, data, updatedAt }
    const mine = records[parts.key]
    if (!mine || wins(record, mine)) records[parts.key] = record
  }
  for (const id of Object.keys(ledger)) ledger[id] = prune(ledger[id])
  return ledger
}

export const mergeSlices = (
  local: Partial<TerritorySyncSlice> | undefined,
  remote: Partial<TerritorySyncSlice> | undefined
): TerritorySyncSlice =>
  ledgerToSlice(mergeLedgers(sliceToLedger(local), sliceToLedger(remote)))

const newest = (entry: PersonalEntry | undefined) =>
  Math.max(
    0,
    ...Object.values(entry?.records ?? {}).map((record) => record.updatedAt),
    ...Object.values(entry?.deleted ?? {})
  )

type StreetParts = {
  fields: NonNullable<ReturnType<typeof readStreetData>>
  workedAt?: number
  doors: TerritoryDoor[]
}

export function territoryFromEntry(
  territoryId: string,
  entry: PersonalEntry,
  local?: Territory
): Territory | null {
  const header = liveHeader(entry)
  const read = header ? readTerritoryData(header.data) : null
  if (!header || !read) return null
  const streets = new Map<string, StreetParts>()
  for (const [key, record] of Object.entries(entry.records)) {
    const parts = parseKey(key)
    if (parts?.at !== 'street' || record.kind !== 'street') continue
    const fields = readStreetData({ ...record.data, id: parts.streetId })
    if (fields) streets.set(parts.streetId, { fields, doors: [] })
  }
  const doNotCalls: TerritoryDoNotCall[] = []
  for (const [key, record] of Object.entries(entry.records)) {
    const parts = parseKey(key)
    if (!parts) continue
    if (parts.at === 'wide') {
      const dnc =
        record.kind === 'doNotCall' ? readDoNotCallData(record.data) : null
      const { streetId } = record.data
      if (dnc)
        doNotCalls.push({
          id: parts.id,
          ...dnc,
          ...(typeof streetId === 'string' && { streetId }),
        })
      continue
    }
    if (parts.at !== 'worked' && parts.at !== 'inStreet') continue
    const street = streets.get(parts.streetId)
    if (!street) continue
    if (parts.at === 'worked') {
      const at = record.data.at
      if (typeof at === 'number' && Number.isFinite(at)) street.workedAt = at
      continue
    }
    if (record.kind === 'door') {
      const door = readDoorData(record.data)
      if (!door) continue
      const { by: _by, byName: _byName, ...fields } = door
      street.doors.push({ id: parts.id, ...fields })
    } else if (record.kind === 'doNotCall') {
      const dnc = readDoNotCallData(record.data)
      if (dnc)
        doNotCalls.push({ id: parts.id, ...dnc, streetId: parts.streetId })
    }
  }
  const localStreets = new Map(
    (local?.streets ?? []).map((street) => [street.id, street])
  )
  const byTime = <T extends { id: string; at: number }>(a: T, b: T) =>
    a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const built = [...streets.entries()]
    .map(([id, { fields, workedAt, doors }]) => {
      const folded = foldDoors(doors, fields.numbering !== 'none').doors.sort(
        byTime
      )
      const stored =
        localStreets.get(id)?.next ??
        startNumber(fields.numbering, fields.first)
      const street: TerritoryStreet = {
        id,
        name: fields.name,
        numbering: fields.numbering,
        next: stored,
        ...(fields.first !== undefined && { first: fields.first }),
        ...(fields.descending && { descending: true }),
        ...(fields.saveLocations !== undefined && {
          saveLocations: fields.saveLocations,
        }),
        ...(fields.houses && { houses: fields.houses }),
        doors: folded,
        ...(workedAt !== undefined && { workedAt }),
      }
      const taken = folded.some((door) => door.label === String(stored))
      return {
        street: taken
          ? { ...street, next: nextUnrecorded(street, stored) }
          : street,
        order: fields.order,
      }
    })
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.street.name.localeCompare(b.street.name) ||
        (a.street.id < b.street.id ? -1 : 1)
    )
    .map(({ street }) => street)
  const finishedAt = header.data.finishedAt
  return {
    id: territoryId,
    number: read.number,
    ...(read.name !== undefined && { name: read.name }),
    ...(read.link !== undefined && { link: read.link }),
    ...(read.coordinate !== undefined && { coordinate: read.coordinate }),
    ...(local?.photo !== undefined && { photo: local.photo }),
    checkedOutAt: read.checkedOutAt,
    ...(read.returnBy !== undefined && { returnBy: read.returnBy }),
    ...(typeof finishedAt === 'number' &&
      Number.isFinite(finishedAt) && { finishedAt }),
    streets: built,
    doNotCalls: doNotCalls.sort(byTime),
    createdAt: read.createdAt,
    ...(read.outline !== undefined && { outline: read.outline }),
  }
}

export function withoutPrivateDoors(ledger: PersonalLedger): PersonalLedger {
  let next = ledger
  for (const [id, entry] of Object.entries(ledger)) {
    const doors = Object.entries(entry.records).filter(
      ([, record]) =>
        record.kind === 'door' && record.data.outcome !== 'doNotCall'
    )
    if (doors.length === 0) continue
    if (next === ledger) next = { ...ledger }
    const records = { ...entry.records }
    for (const [key] of doors) delete records[key]
    next[id] = { ...entry, records }
  }
  return next
}

export type AppliedLedger = {
  ledger: PersonalLedger
  personal: Territory[]
  removed: Territory[]
}

export function applyLedger(options: {
  before: PersonalLedger
  after: PersonalLedger
  personal: readonly Territory[]
  held: HeldTerritories
  privacy: boolean
  formatAddress: FormatDoorAddress
}): AppliedLedger {
  const { before, held, privacy, formatAddress } = options
  const after = privacy ? withoutPrivateDoors(options.after) : options.after
  const byId = new Map(options.personal.map((t) => [t.id, t]))
  const placed = new Map<string, Territory | null>()
  for (const [id, entry] of Object.entries(after)) {
    const local = byId.get(id)
    if (isDeleted(entry)) {
      if (local) placed.set(id, null)
      continue
    }
    const header = entry.records[HEADER]
    if (!header || held.has(id)) continue
    if (isMarked(entry)) {
      if (local && newest(before[id]) <= header.updatedAt) placed.set(id, null)
      continue
    }
    if (local && canonicalJson(before[id]) === canonicalJson(entry)) continue
    const projected = territoryFromEntry(id, entry, local)
    if (!projected) continue
    placed.set(
      id,
      privacy ? clearDoorRecords(projected, formatAddress) : projected
    )
  }
  const removed: Territory[] = []
  const personal: Territory[] = []
  for (const territory of options.personal) {
    const next = placed.get(territory.id)
    if (next === null) removed.push(territory)
    else personal.push(next ?? territory)
    placed.delete(territory.id)
  }
  const added = [...placed.values()]
    .filter((territory): territory is Territory => territory !== null)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
  return { ledger: after, personal: [...personal, ...added], removed }
}

export function markedSpaces(
  ledger: PersonalLedger
): (SharedMark & { territoryId: string })[] {
  const marked: (SharedMark & { territoryId: string })[] = []
  for (const [territoryId, entry] of Object.entries(ledger)) {
    if (!isMarked(entry)) continue
    const space = entry.records[HEADER]?.data.space
    if (!space || typeof space !== 'object') continue
    const { id, owner, at } = space as Record<string, unknown>
    if (
      typeof id === 'string' &&
      SPACE_ID_PATTERN.test(id) &&
      typeof owner === 'string' &&
      typeof at === 'number' &&
      Number.isFinite(at)
    )
      marked.push({ territoryId, spaceId: id, ownerId: owner, at })
  }
  return marked
}

export const countPersonalTerritories = (ledger: PersonalLedger) =>
  Object.values(ledger).filter(
    (entry) => liveHeader(entry) !== undefined && !isMarked(entry)
  ).length
