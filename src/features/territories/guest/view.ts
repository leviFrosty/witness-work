import { parseScopedRecordId } from '@/lib/sharedSpaces/records'
import { sortedScopeIds, streetIdForScope } from '@/lib/sharedSpaces/scopes'
import {
  type GuestKeysData,
  readDoNotCall,
  readDoor,
  readGuest,
  readStreet,
  readWorked,
  type RecordData,
} from '@/features/territories/guest/codecs'
import type { GuestRecord } from '@/features/territories/guest/session'
import { nextUnrecorded, startNumber } from '@/features/territories/lib/doors'
import { mergeDoor } from '@/features/territories/lib/sharing'
import type {
  Territory,
  TerritoryDoNotCall,
  TerritoryDoor,
  TerritoryPerson,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export type GuestView = {
  title: string
  from: string
  houseRecords: boolean
  expiresAt: number
  territory: Territory
  streets: TerritoryStreet[]

  raw: ReadonlyMap<string, RecordData>

  folded: ReadonlyMap<string, string[]>
}

type StreetParts = {
  scopeId: string
  street: ReturnType<typeof readStreet>
  worked: ReturnType<typeof readWorked>
  doors: { recordId: string; id: string; door: TerritoryDoor }[]
  doNotCalls: TerritoryDoNotCall[]
}

export function foldDoors(
  numbered: boolean,
  doors: { recordId: string; door: TerritoryDoor }[]
): { doors: TerritoryDoor[]; folded: Map<string, string[]> } {
  const sorted = [...doors].sort((a, b) =>
    a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0
  )
  const folded = new Map<string, string[]>()
  if (!numbered) return { doors: sorted.map(({ door }) => door), folded }
  const groups = new Map<string, TerritoryDoor[]>()
  for (const { door } of sorted) {
    const label = door.label.trim()
    groups.set(label, [...(groups.get(label) ?? []), door])
  }
  const result: TerritoryDoor[] = []
  for (const group of groups.values()) {
    const [first, ...rest] = group
    if (!first) continue
    const merged = rest.reduce(mergeDoor, first)
    if (rest.length > 0)
      folded.set(
        merged.id,
        group.map((door) => door.id).filter((id) => id !== merged.id)
      )
    result.push(merged)
  }
  return { doors: result, folded }
}

export function projectGuestView(
  spaceId: string,
  keys: GuestKeysData,
  records: ReadonlyMap<string, GuestRecord>,
  nextByStreet: Readonly<Record<string, number>>
): GuestView {
  const scopes = sortedScopeIds(Object.keys(keys.scopes))
  const parts = new Map<string, StreetParts>(
    scopes.map((scopeId) => [
      scopeId,
      { scopeId, street: null, worked: null, doors: [], doNotCalls: [] },
    ])
  )
  const raw = new Map<string, RecordData>()
  const people = new Map<string, TerritoryPerson>()
  const byNames = new Map<string, string>()

  for (const record of records.values()) {
    const parsed = parseScopedRecordId(record.recordId)
    if (!parsed || !('scopeId' in parsed)) continue
    const part = parts.get(parsed.scopeId)
    if (!part || record.deleted || !record.data) continue
    raw.set(record.recordId, record.data)
    if (parsed.class === 'street' && record.kind === 'street')
      part.street = readStreet(record.data)
    else if (parsed.class === 'worked' && record.kind === 'worked') {
      part.worked = readWorked(record.data)
      if (part.worked?.by && part.worked.byName)
        byNames.set(part.worked.by, part.worked.byName)
    } else if (parsed.class === 'inScope') {
      if (record.kind === 'door') {
        const door = readDoor(record.data)
        if (!door) continue
        if (door.by && door.byName) byNames.set(door.by, door.byName)
        part.doors.push({
          recordId: record.recordId,
          id: parsed.id,
          door: {
            id: parsed.id,
            label: door.label,
            outcome: door.outcome,
            at: door.at,
            tries: door.tries,
            coordinate: door.coordinate,
            coordinateSource: door.coordinateSource,
            description: door.description,
            by: door.by,
          },
        })
      } else if (record.kind === 'doNotCall') {
        const entry = readDoNotCall(record.data)
        if (entry)
          part.doNotCalls.push({
            id: parsed.id,
            address: entry.address,
            at: entry.at,
            coordinate: entry.coordinate,
            label: entry.label,
          })
      } else if (record.kind === 'guest') {
        const guest = readGuest(record.data)
        if (guest)
          people.set(parsed.id, {
            id: parsed.id,
            name: guest.name,
            kind: 'guest',
            addedAt: guest.joinedAt,
          })
      }
    }
  }

  for (const [id, name] of byNames)
    if (!people.has(id)) people.set(id, { id, name, kind: 'buddy' })

  const folded = new Map<string, string[]>()
  const doNotCalls: TerritoryDoNotCall[] = []
  const streets: { order: number; street: TerritoryStreet }[] = []
  for (const part of parts.values()) {
    const streetId = streetIdForScope(part.scopeId)
    if (!part.street || !streetId) continue
    const numbered = part.street.numbering !== 'none'
    const live = keys.houseRecords
      ? part.doors
      : part.doors.filter(({ door }) => door.outcome === 'doNotCall')
    const fold = foldDoors(numbered, live)
    fold.folded.forEach((others, id) => folded.set(id, others))
    const base: TerritoryStreet = {
      id: streetId,
      name: part.street.name,
      numbering: part.street.numbering,
      first: part.street.first,
      descending: part.street.descending,
      saveLocations: part.street.saveLocations,
      houses: part.street.houses,
      doors: fold.doors,
      next: 1,
      workedAt: part.worked?.at,
      workedBy: part.worked?.at !== undefined ? part.worked.by : undefined,
    }
    const start =
      nextByStreet[streetId] ??
      startNumber(part.street.numbering, part.street.first)
    const taken = base.doors.some((door) => door.label === String(start))
    streets.push({
      order: part.street.order,
      street: { ...base, next: taken ? nextUnrecorded(base, start) : start },
    })
    for (const entry of part.doNotCalls)
      doNotCalls.push({ ...entry, streetId, label: entry.label })
  }
  const ordered = streets
    .sort(
      (a, b) => a.order - b.order || a.street.name.localeCompare(b.street.name)
    )
    .map(({ street }) => street)

  return {
    title: keys.title,
    from: keys.from,
    houseRecords: keys.houseRecords,
    expiresAt: keys.expiresAt,
    streets: ordered,
    raw,
    folded,
    territory: {
      id: spaceId,
      number: keys.title,
      checkedOutAt: 0,
      createdAt: 0,
      streets: ordered,
      doNotCalls,
      people: [...people.values()],
    },
  }
}
