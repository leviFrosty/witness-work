import {
  heldStreets,
  parseScopedRecordId,
  type ScopedSpaceView,
  scopedRoleOf,
} from '@/lib/sharedSpaces/records'
import { scopeIdForStreet, streetIdForScope } from '@/lib/sharedSpaces/scopes'
import { nextUnrecorded, startNumber } from '@/features/territories/lib/doors'
import {
  readDoNotCallData,
  readDoorData,
  readGuestData,
  readStreetData,
  readTerritoryData,
  readWorkedData,
} from '@/features/territories/lib/shared/territoryRecords'
import { mergeDoor } from '@/features/territories/lib/sharing'
import type { TerritorySpace } from '@/features/territories/types/sharedTerritory'
import type {
  Territory,
  TerritoryDoNotCall,
  TerritoryDoor,
  TerritoryPerson,
  TerritoryRole,
  TerritoryShare,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export type BuddyNameResolver = (
  spaceId: string,
  tag: string
) => { inboxId: string; name: string } | undefined

export type ProjectOptions = {
  privacy: boolean

  showAllDoors?: boolean

  buddyByTag?: BuddyNameResolver
}

export function scopedView(space: TerritorySpace): ScopedSpaceView {
  return {
    ownerId: space.ownerId,
    members: space.members.map((member) => ({
      memberId: member.memberId,
      scopes: member.scopes,
      invitedBy: member.invitedBy,
    })),
    invites: space.invites.map((invite) => ({
      inviteId: invite.inviteId,
      invitedBy: invite.invitedBy,
      scopes: invite.scopes,
      handoff: invite.handoff,
    })),
    holders: space.holders,
    links: space.links,
  }
}

export const myRole = (space: TerritorySpace): TerritoryRole =>
  scopedRoleOf(scopedView(space), space.myMemberId) ??
  (space.ownerId === space.myMemberId ? 'owner' : 'whole')

const streetOf = (scopeId: string) => streetIdForScope(scopeId) ?? scopeId

export const scopeOfStreet = (streetId: string) =>
  scopeIdForStreet(streetId.toLowerCase())

type StreetParts = {
  scopeId: string
  street?: ReturnType<typeof readStreetData>
  deleted: boolean
  worked?: ReturnType<typeof readWorkedData>
  doors: TerritoryDoor[]
  doNotCalls: TerritoryDoNotCall[]
}

export type DoorGroups = Map<string, string[]>

export function foldDoors(
  doors: TerritoryDoor[],
  numbered: boolean
): { doors: TerritoryDoor[]; groups: DoorGroups } {
  const groups: DoorGroups = new Map()
  if (!numbered) {
    for (const door of doors) groups.set(door.id, [door.id])
    return { doors, groups }
  }
  const byLabel = new Map<string, TerritoryDoor[]>()
  for (const door of doors) {
    const label = door.label.trim()
    byLabel.set(label, [...(byLabel.get(label) ?? []), door])
  }
  const folded: TerritoryDoor[] = []
  for (const group of byLabel.values()) {
    const sorted = [...group].sort((a, b) => (a.id < b.id ? -1 : 1))
    const [first, ...rest] = sorted
    if (!first) continue
    const door = rest.reduce(mergeDoor, first)
    folded.push(door)
    groups.set(
      door.id,
      sorted.map((entry) => entry.id)
    )
  }
  return { doors: folded, groups }
}

const stripDoNotCallDoor = (door: TerritoryDoor): TerritoryDoor => ({
  id: door.id,
  label: door.label,
  outcome: door.outcome,
  at: door.at,
  tries: 1,
})

export function doorGroupsOf(space: TerritorySpace): Map<string, DoorGroups> {
  const parts = collect(space)
  const out = new Map<string, DoorGroups>()
  for (const part of parts.streets.values()) {
    if (!part.street) continue
    out.set(
      part.street.id,
      foldDoors(part.doors, part.street.numbering !== 'none').groups
    )
  }
  return out
}

function collect(space: TerritorySpace) {
  const streets = new Map<string, StreetParts>()
  const part = (scopeId: string) => {
    let found = streets.get(scopeId)
    if (!found) {
      found = { scopeId, deleted: false, doors: [], doNotCalls: [] }
      streets.set(scopeId, found)
    }
    return found
  }
  const wide: TerritoryDoNotCall[] = []
  const guests: { id: string; name: string; linkId: string; at: number }[] = []
  const names = new Map<string, string>()
  for (const [recordId, record] of Object.entries(space.records)) {
    const parsed = parseScopedRecordId(recordId)
    if (!parsed) continue
    if (parsed.class === 'street') {
      const entry = part(parsed.scopeId)
      if (record.deleted || !record.data) entry.deleted = true
      else entry.street = readStreetData(record.data)
      continue
    }
    if (record.deleted || !record.data) continue
    if (parsed.class === 'worked') {
      const worked = readWorkedData(record.data)
      part(parsed.scopeId).worked = worked
      if (worked.by && worked.byName) names.set(worked.by, worked.byName)
      continue
    }
    if (parsed.class === 'territoryWide') {
      const entry =
        record.kind === 'doNotCall' ? readDoNotCallData(record.data) : null
      if (entry) wide.push({ id: parsed.id, ...entry })
      continue
    }
    if (parsed.class !== 'inScope') continue
    const entry = part(parsed.scopeId)
    if (record.kind === 'door') {
      const door = readDoorData(record.data)
      if (!door) continue
      const { byName, ...fields } = door
      if (fields.by && byName) names.set(fields.by, byName)
      entry.doors.push({ id: parsed.id, ...fields })
    } else if (record.kind === 'doNotCall') {
      const dnc = readDoNotCallData(record.data)
      if (dnc) entry.doNotCalls.push({ id: parsed.id, ...dnc })
    } else if (record.kind === 'guest') {
      const guest = readGuestData(record.data)
      if (guest)
        guests.push({
          id: parsed.id,
          name: guest.name,
          linkId: guest.linkId,
          at: guest.joinedAt,
        })
    }
  }
  return { streets, wide, guests, names }
}

function streetIdIn(part: StreetParts): string {
  const id = part.street?.id
  if (id) {
    try {
      if (scopeIdForStreet(id) === part.scopeId) return id
    } catch {}
  }
  return streetOf(part.scopeId)
}

export function projectSpace(
  space: TerritorySpace,
  options: ProjectOptions
): Territory {
  const me = space.myMemberId
  const view = scopedView(space)
  const role = myRole(space)
  const header = space.records.h?.data
    ? readTerritoryData(space.records.h.data)
    : null
  const houseRecords = header?.houseRecords ?? true
  const hidesDoors = !options.showAllDoors && (options.privacy || !houseRecords)
  const { streets: parts, wide, guests, names } = collect(space)
  const mine = (by: string | undefined) => (by === me ? undefined : by)

  const memberRecord = (memberId: string) => {
    const data = space.records[`m.${memberId}`]?.data
    return data && typeof data.name === 'string'
      ? {
          name: data.name,
          tag: typeof data.tag === 'string' ? data.tag : undefined,
        }
      : undefined
  }
  const inviteRecord = (inviteId: string) => {
    const data = space.records[`i.${inviteId}`]?.data
    return data && typeof data.name === 'string'
      ? {
          name: data.name,
          tag: typeof data.tag === 'string' ? data.tag : undefined,
        }
      : undefined
  }
  const named = (
    id: string,
    record: { name: string; tag?: string } | undefined,
    addedAt: number
  ): TerritoryPerson => {
    const buddy =
      record?.tag !== undefined
        ? options.buddyByTag?.(space.spaceId, record.tag)
        : undefined
    return {
      id,
      name: buddy?.name || record?.name || names.get(id) || '',
      kind: 'buddy',
      ...(buddy && { inboxId: buddy.inboxId }),
      ...(record?.tag !== undefined && { tag: record.tag }),
      addedAt,
    }
  }

  const people: TerritoryPerson[] = []
  for (const member of space.members)
    if (member.memberId !== me)
      people.push(
        named(member.memberId, memberRecord(member.memberId), member.joinedAt)
      )
  for (const invite of space.invites)
    people.push(
      named(invite.inviteId, inviteRecord(invite.inviteId), invite.expiresAt)
    )
  for (const guest of guests)
    people.push({
      id: guest.id,
      name: guest.name,
      kind: 'guest',
      shareId: guest.linkId,
      addedAt: guest.at,
    })
  for (const [id, name] of names)
    if (id !== me && !people.some((person) => person.id === id))
      people.push({ id, name, kind: 'buddy' })

  const knownIds = new Map(
    [...parts.values()]
      .filter((part) => part.street)
      .map((part) => [part.scopeId, streetIdIn(part)])
  )
  const idOf = (scopeId: string) => knownIds.get(scopeId) ?? streetOf(scopeId)
  const holds = heldStreets(view, me).map(idOf)
  const streets: (TerritoryStreet & { order: number })[] = []
  const doNotCalls: TerritoryDoNotCall[] = [...wide]
  for (const part of parts.values()) {
    if (part.deleted || !part.street) continue
    const id = streetIdIn(part)
    const { doors: folded } = foldDoors(
      part.doors.map((door) => ({ ...door, by: mine(door.by) })),
      part.street.numbering !== 'none'
    )
    const doors = hidesDoors
      ? folded
          .filter((door) => door.outcome === 'doNotCall')
          .map(stripDoNotCallDoor)
      : folded
    const hold = space.holders.find(
      (holder) =>
        holder.scopeId === part.scopeId &&
        (holder.memberId !== null || holder.inviteId !== null)
    )
    const stored =
      space.local.next[id] ??
      startNumber(part.street.numbering, part.street.first)
    const base: TerritoryStreet = {
      id,
      name: part.street.name,
      numbering: part.street.numbering,
      next: stored,
      ...(part.street.first !== undefined && { first: part.street.first }),
      ...(part.street.descending && { descending: true }),
      ...(part.street.saveLocations !== undefined && {
        saveLocations: part.street.saveLocations,
      }),
      doors,
      ...(part.worked?.at !== undefined && { workedAt: part.worked.at }),
      ...(part.worked?.at !== undefined &&
        mine(part.worked.by) !== undefined && {
          workedBy: mine(part.worked.by),
        }),
      ...(hold &&
        hold.memberId !== me && {
          handoff: {
            personId: hold.memberId ?? hold.inviteId ?? '',
            at: hold.since,
            ...(hold.memberId === null && { pending: true }),
          },
        }),
    }
    const taken = doors.some((door) => door.label === String(stored))
    streets.push({
      ...base,
      next: taken ? nextUnrecorded(base, stored) : stored,
      order: part.street.order,
    })
    for (const entry of part.doNotCalls)
      doNotCalls.push({ ...entry, streetId: id })
  }
  streets.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))

  const shares: TerritoryShare[] = []
  for (const member of space.members) {
    if (member.memberId === me || member.memberId === space.ownerId) continue
    const held = heldStreets(view, member.memberId)
    const scopes =
      member.scopes === null
        ? null
        : member.scopes.filter((scopeId) => !held.includes(scopeId))
    if (scopes !== null && scopes.length === 0) continue
    shares.push({
      id: member.memberId,
      kind: 'person',
      personId: member.memberId,
      ...(scopes && { streetIds: scopes.map(idOf) }),
      createdAt: member.joinedAt,
      by: member.invitedBy ?? space.ownerId,
    })
  }
  for (const invite of space.invites) {
    if (invite.handoff) continue
    shares.push({
      id: invite.inviteId,
      kind: 'person',
      personId: invite.inviteId,
      ...(invite.scopes && { streetIds: invite.scopes.map(idOf) }),
      createdAt: space.records[`i.${invite.inviteId}`]?.stamp ?? 0,
      expiresAt: invite.expiresAt,
      pending: true,
      by: invite.invitedBy,
    })
  }
  for (const link of space.links)
    shares.push({
      id: link.linkId,
      kind: 'link',
      streetIds: link.scopes.map(idOf),
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      ...(link.endedAt !== null && { endedAt: link.endedAt }),
      by: link.createdBy,
    })

  const myEntry = space.members.find((member) => member.memberId === me)
  const inviter = myEntry?.invitedBy ?? space.ownerId
  const readable = streets.map((street) => street.id)
  const received =
    role === 'owner'
      ? undefined
      : {
          kind:
            holds.length > 0 && readable.every((id) => holds.includes(id))
              ? ('handoff' as const)
              : ('shared' as const),
          from:
            people.find((person) => person.id === inviter) ??
            named(inviter, memberRecord(inviter), 0),
          at: myEntry?.joinedAt ?? 0,
          ...(holds.length > 0 && { streetIds: holds }),
        }

  return {
    id: header?.id ?? space.territoryId,
    number: header?.number ?? '',
    ...(header?.name !== undefined && { name: header.name }),
    ...(header?.link !== undefined && { link: header.link }),
    ...(header?.coordinate !== undefined && { coordinate: header.coordinate }),
    ...(header?.outline !== undefined && { outline: header.outline }),
    ...(role === 'owner' &&
      space.local.photo !== undefined && { photo: space.local.photo }),
    checkedOutAt: header?.checkedOutAt ?? 0,
    ...(header?.returnBy !== undefined && { returnBy: header.returnBy }),
    createdAt: header?.createdAt ?? 0,
    streets: streets.map(({ order: _order, ...street }) => street),
    doNotCalls,
    people,
    shares,
    ...(received && { received }),
    shared: {
      spaceId: space.spaceId,
      me,
      role,
      holds,
      houseRecords,
    },
  }
}
