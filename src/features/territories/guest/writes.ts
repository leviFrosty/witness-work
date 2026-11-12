import { inScopeRecordId, workedRecordId } from '@/lib/sharedSpaces/records'
import { scopeIdForStreet } from '@/lib/sharedSpaces/scopes'
import {
  doNotCallData,
  doorData,
  workedData,
} from '@/features/territories/guest/codecs'
import type { GuestWrite } from '@/features/territories/guest/session'
import type { GuestView } from '@/features/territories/guest/view'
import type {
  Territory,
  TerritoryDoNotCall,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export type GuestIdentity = { id: string; name: string }

export type GuestChange = {
  writes: GuestWrite[]
  next: { streetId: string; next: number }[]
  recorded: boolean
}

const sameDoor = (a: TerritoryDoor, b: TerritoryDoor) =>
  a.label === b.label &&
  a.outcome === b.outcome &&
  a.at === b.at &&
  a.tries === b.tries &&
  a.description === b.description &&
  a.by === b.by &&
  a.coordinate?.latitude === b.coordinate?.latitude &&
  a.coordinate?.longitude === b.coordinate?.longitude &&
  a.coordinateSource === b.coordinateSource

const sameDoNotCall = (a: TerritoryDoNotCall, b: TerritoryDoNotCall) =>
  a.address === b.address &&
  a.at === b.at &&
  a.label === b.label &&
  a.coordinate?.latitude === b.coordinate?.latitude &&
  a.coordinate?.longitude === b.coordinate?.longitude

function streetWrites(
  before: TerritoryStreet,
  after: TerritoryStreet,
  view: Pick<GuestView, 'raw' | 'folded' | 'houseRecords'>,
  guest: GuestIdentity,
  names: ReadonlyMap<string, string>
): { writes: GuestWrite[]; recorded: boolean } {
  const scopeId = scopeIdForStreet(before.id)
  const writes = new Map<string, GuestWrite>()
  let recorded = false
  const tombstone = (id: string, kind: string) => {
    const recordId = inScopeRecordId(scopeId, id)
    if (!writes.has(recordId))
      writes.set(recordId, { recordId, kind, deleted: true })
  }
  const others = (id: string) =>
    (view.folded.get(id) ?? []).forEach((other) => tombstone(other, 'door'))

  if (view.houseRecords) {
    const had = new Map(before.doors.map((door) => [door.id, door]))
    const has = new Map(after.doors.map((door) => [door.id, door]))
    for (const door of after.doors) {
      const previous = had.get(door.id)
      if (previous && sameDoor(previous, door)) continue
      const recordId = inScopeRecordId(scopeId, door.id)
      const raw = view.raw.get(recordId)
      const by = door.by ?? guest.id
      writes.set(recordId, {
        recordId,
        kind: 'door',
        data: doorData(
          {
            label: door.label,
            outcome: door.outcome,
            at: door.at,
            tries: door.tries,
            coordinate: door.coordinate,
            coordinateSource: door.coordinateSource,
            description: door.description,
            by,
            byName:
              by === guest.id
                ? guest.name
                : typeof raw?.byName === 'string'
                  ? raw.byName
                  : names.get(by),
          },
          raw
        ),
      })
      others(door.id)
      if (by === guest.id) recorded = true
    }
    for (const door of before.doors)
      if (!has.has(door.id)) {
        tombstone(door.id, 'door')
        others(door.id)
      }
  }

  if (
    before.workedAt !== after.workedAt ||
    before.workedBy !== after.workedBy
  ) {
    const recordId = workedRecordId(scopeId)
    const by = after.workedBy ?? guest.id
    writes.set(recordId, {
      recordId,
      kind: 'worked',
      data: workedData(
        {
          at: after.workedAt,
          by,
          byName: by === guest.id ? guest.name : names.get(by),
        },
        view.raw.get(recordId)
      ),
    })
    recorded = true
  }
  return { writes: [...writes.values()], recorded }
}

function doNotCallWrites(
  before: Territory,
  after: Territory,
  view: Pick<GuestView, 'raw'>,
  streetIds: ReadonlySet<string>
): GuestWrite[] {
  const writes: GuestWrite[] = []
  const inScope = (entry: TerritoryDoNotCall) =>
    entry.streetId !== undefined && streetIds.has(entry.streetId)
  const had = new Map(
    before.doNotCalls.filter(inScope).map((entry) => [entry.id, entry])
  )
  const has = new Set<string>()
  for (const entry of after.doNotCalls.filter(inScope)) {
    has.add(entry.id)
    const previous = had.get(entry.id)
    if (previous && sameDoNotCall(previous, entry)) continue
    const recordId = inScopeRecordId(
      scopeIdForStreet(entry.streetId as string),
      entry.id
    )
    writes.push({
      recordId,
      kind: 'doNotCall',
      data: doNotCallData(
        {
          address: entry.address,
          at: entry.at,
          coordinate: entry.coordinate,
          label: entry.label,
        },
        view.raw.get(recordId)
      ),
    })
  }
  for (const entry of had.values())
    if (!has.has(entry.id))
      writes.push({
        recordId: inScopeRecordId(
          scopeIdForStreet(entry.streetId as string),
          entry.id
        ),
        kind: 'doNotCall',
        deleted: true,
      })
  return writes
}

export function guestChange(
  before: Territory,
  after: Territory,
  view: Pick<GuestView, 'raw' | 'folded' | 'houseRecords'>,
  guest: GuestIdentity
): GuestChange {
  const names = new Map(
    (before.people ?? []).map((person) => [person.id, person.name])
  )
  const streetIds = new Set(before.streets.map((street) => street.id))
  const writes: GuestWrite[] = []
  const next: GuestChange['next'] = []
  let recorded = false
  for (const street of after.streets) {
    const previous = before.streets.find((each) => each.id === street.id)
    if (!previous) continue
    const change = streetWrites(previous, street, view, guest, names)
    writes.push(...change.writes)
    recorded ||= change.recorded
    if (previous.next !== street.next)
      next.push({ streetId: street.id, next: street.next })
  }
  const dnc = doNotCallWrites(before, after, view, streetIds)
  writes.push(...dnc)
  recorded ||= dnc.some((write) => !write.deleted)
  return { writes, next, recorded }
}
