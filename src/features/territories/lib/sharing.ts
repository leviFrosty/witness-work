import { isHandedOff } from '@/features/territories/lib/doors'
import type {
  Territory,
  TerritoryDoor,
  TerritoryPerson,
  TerritoryShare,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export const WORKING_NOW_MS = 10 * 60 * 1000

export const isShareLive = (
  share: Pick<TerritoryShare, 'endedAt' | 'expiresAt'>,
  now: number
) =>
  share.endedAt === undefined &&
  (share.expiresAt === undefined || share.expiresAt > now)

export const liveShares = (
  territory: Pick<Territory, 'shares'>,
  now: number
): TerritoryShare[] =>
  (territory.shares ?? []).filter((share) => isShareLive(share, now))

export const shareTimeLeft = (share: TerritoryShare, now: number) =>
  share.expiresAt === undefined ? undefined : Math.max(0, share.expiresAt - now)

export const personById = (
  territory: Pick<Territory, 'people'>,
  id: string | undefined
): TerritoryPerson | undefined =>
  id === undefined
    ? undefined
    : territory.people?.find((person) => person.id === id)

export const addPeople = (
  territory: Territory,
  people: TerritoryPerson[]
): { territory: Territory; ids: string[] } => {
  const known = [...(territory.people ?? [])]
  const ids = people.map((person) => {
    const had = known.find(
      (existing) =>
        existing.id === person.id ||
        (person.inboxId !== undefined && existing.inboxId === person.inboxId)
    )
    if (had) {
      known[known.indexOf(had)] = { ...had, name: person.name }
      return had.id
    }
    known.push(person)
    return person.id
  })
  return { territory: { ...territory, people: known }, ids }
}

export const coversWholeTerritory = (
  territory: Pick<Territory, 'streets'>,
  streetIds: readonly string[]
) =>
  territory.streets
    .filter((street) => !isHandedOff(street))
    .every((street) => streetIds.includes(street.id))

const wholeTerritory = (
  territory: Pick<Territory, 'streets'>,
  streetIds: string[] | undefined
) => !streetIds || coversWholeTerritory(territory, streetIds)

export type ShareScope = { streetIds?: string[] }

const scopeOf = (
  territory: Pick<Territory, 'streets'>,
  streetIds: string[] | undefined
): ShareScope =>
  wholeTerritory(territory, streetIds) ? {} : { streetIds: streetIds ?? [] }

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id) => right.includes(id))

export const personShareScope = (
  territory: Territory,
  personId: string | undefined,
  now: number
): ShareScope | undefined => {
  const shares = liveShares(territory, now).filter(
    (share) => share.kind === 'person' && share.personId === personId
  )
  if (personId === undefined || shares.length === 0) return undefined
  if (shares.some((share) => !share.streetIds)) return {}
  return scopeOf(territory, [
    ...new Set(shares.flatMap((share) => share.streetIds ?? [])),
  ])
}

export const shareAdds = (
  territory: Pick<Territory, 'streets'>,
  had: ShareScope | undefined,
  streetIds: string[] | undefined
): boolean => {
  if (!had) return true
  if (!had.streetIds) return false
  const wanted = scopeOf(territory, streetIds)
  if (!wanted.streetIds) return true
  return wanted.streetIds.some((id) => !had.streetIds?.includes(id))
}

export const findLiveLink = (
  territory: Territory,
  streetIds: string[] | undefined,
  now: number
): TerritoryShare | undefined => {
  const wanted = scopeOf(territory, streetIds).streetIds
  return liveShares(territory, now)
    .filter((share) => share.kind === 'link')
    .reverse()
    .find((share) => {
      const had = scopeOf(territory, share.streetIds).streetIds
      return wanted && had ? sameIds(had, wanted) : !wanted && !had
    })
}

export const sharedStreets = (
  territory: Pick<Territory, 'streets'>,
  share: Pick<TerritoryShare, 'streetIds' | 'by'>
): TerritoryStreet[] =>
  territory.streets.filter(
    (street) =>
      (!isHandedOff(street) ||
        (share.by !== undefined && street.handoff?.personId === share.by)) &&
      (!share.streetIds || share.streetIds.includes(street.id))
  )

export type SharedWith = {
  person: TerritoryPerson
  shares: TerritoryShare[]
}

export const sharedWithPeople = (
  territory: Territory,
  now: number
): SharedWith[] => {
  const live = liveShares(territory, now).filter(
    (share) => share.kind === 'person'
  )
  return (territory.people ?? []).flatMap((person) => {
    const shares = live.filter((share) => share.personId === person.id)
    return shares.length > 0 ? [{ person, shares }] : []
  })
}

export const liveShareCount = (territory: Territory, now: number): number =>
  sharedWithPeople(territory, now).length +
  liveShares(territory, now).filter((share) => share.kind === 'link').length

export type TerritoryAccess = 'owner' | 'assigned' | 'member'

export const territoryAccess = (
  territory: Pick<Territory, 'received'>
): TerritoryAccess =>
  territory.received?.kind === 'shared'
    ? 'member'
    : territory.received?.kind === 'handoff'
      ? 'assigned'
      : 'owner'

export const isReceivedLive = (territory: Pick<Territory, 'received'>) =>
  territory.received === undefined || territory.received.endedAt === undefined

export const heldStreetIds = (
  territory: Pick<Territory, 'received'>
): string[] =>
  territory.received && territory.received.endedAt === undefined
    ? (territory.received.streetIds ?? [])
    : []

export const holdsStreet = (
  territory: Pick<Territory, 'received'>,
  streetId: string
) => heldStreetIds(territory).includes(streetId)

export const handedStreetId = (
  territory: Pick<Territory, 'received' | 'streets'>
): string | undefined =>
  territory.received?.kind === 'handoff' &&
  territory.received.endedAt === undefined &&
  territory.streets.length === 1
    ? territory.streets[0]?.id
    : undefined

const sameDay = (left: number, right: number) =>
  new Date(left).toDateString() === new Date(right).toDateString()

const laterWins = (left: TerritoryDoor, right: TerritoryDoor) =>
  left.at !== right.at ? left.at > right.at : left.id < right.id

export const mergeDoor = (
  local: TerritoryDoor,
  incoming: TerritoryDoor
): TerritoryDoor => {
  if (local.id === incoming.id)
    return laterWins(incoming, local) ? incoming : local
  const winner =
    local.outcome === 'doNotCall' && incoming.outcome !== 'doNotCall'
      ? local
      : incoming.outcome === 'doNotCall' && local.outcome !== 'doNotCall'
        ? incoming
        : laterWins(incoming, local)
          ? incoming
          : local
  const other = winner === local ? incoming : local
  return {
    ...winner,
    id: local.id < incoming.id ? local.id : incoming.id,
    tries: sameDay(local.at, incoming.at)
      ? Math.max(local.tries, incoming.tries)
      : Math.max(local.tries, incoming.tries) + 1,
    coordinate: winner.coordinate ?? other.coordinate,
    coordinateSource: winner.coordinate
      ? winner.coordinateSource
      : other.coordinateSource,
  }
}

export const workingNow = (
  street: Pick<TerritoryStreet, 'doors'>,
  now: number,
  within = WORKING_NOW_MS
): string[] => {
  const latest = new Map<string, number>()
  for (const door of street.doors) {
    if (!door.by || now - door.at > within) continue
    latest.set(door.by, Math.max(latest.get(door.by) ?? 0, door.at))
  }
  return [...latest.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([personId]) => personId)
}
