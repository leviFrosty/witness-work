import { clip } from '@/lib/sharedSpaces/records'
import { TERRITORY_LIMITS } from '@/features/territories/lib/shared/territoryRecords'
import type { TerritoriesStore } from '@/app/territories/engine/types'
import type { Territory } from '@/features/territories/types/territory'

export const plainTitle = (territory: Pick<Territory, 'number' | 'name'>) =>
  clip(
    [territory.number, territory.name].filter(Boolean).join(' · '),
    TERRITORY_LIMITS.title
  )

export const viewOfSpace = (store: TerritoriesStore, spaceId: string) =>
  store.getState().territories.find((t) => t.shared?.spaceId === spaceId)

export const territoryById = (store: TerritoriesStore, territoryId: string) =>
  store.getState().territories.find((t) => t.id === territoryId)

export function heldStreetsCopy(
  territory: Territory,
  streetIds: readonly string[],
  { id, at }: { id: string; at: number }
): Territory {
  const held = new Set(streetIds)
  const copy = personalCopy(territory)
  return {
    ...copy,
    id,
    checkedOutAt: at,
    createdAt: at,
    returnBy: undefined,
    finishedAt: undefined,
    streets: copy.streets.filter((street) => held.has(street.id)),
    doNotCalls: copy.doNotCalls.filter(
      (entry) => entry.streetId !== undefined && held.has(entry.streetId)
    ),
  }
}

export function withoutStreets(
  territory: Territory,
  streetIds: readonly string[]
): Territory {
  if (streetIds.length === 0) return territory
  const gone = new Set(streetIds)
  return {
    ...territory,
    streets: territory.streets.filter((street) => !gone.has(street.id)),
    doNotCalls: territory.doNotCalls.filter(
      (entry) => entry.streetId === undefined || !gone.has(entry.streetId)
    ),
  }
}

export function personalCopy(territory: Territory): Territory {
  const {
    shared: _shared,
    people: _people,
    shares: _shares,
    received: _received,
    ...rest
  } = territory
  return {
    ...rest,
    streets: territory.streets.map(
      ({ handoff: _handoff, workedBy: _workedBy, ...street }) => ({
        ...street,
        doors: street.doors.map(({ by: _by, ...door }) => door),
      })
    ),
  }
}
