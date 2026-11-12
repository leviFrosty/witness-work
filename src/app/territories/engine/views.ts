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
