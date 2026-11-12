import {
  clearDoorRecords,
  hasDoorRecords,
} from '@/features/territories/lib/doors'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import { useTerritories } from '@/features/territories/stores/territories'
import type { Territory } from '@/features/territories/types/territory'

const clearable = (territory: Territory) =>
  hasDoorRecords(territory) &&
  (territory.shared === undefined || territory.shared.role === 'owner')

export const territoriesWithDoorRecords = () =>
  useTerritories.getState().territories.filter(clearable).length

export const clearAllDoorRecords = () => {
  const { territories, update } = useTerritories.getState()
  for (const territory of territories)
    if (clearable(territory))
      update(territory.id, (current) =>
        clearDoorRecords(current, formatDoorAddress)
      )
}
