import { analytics } from '@/lib/analytics'
import {
  DEFAULT_TERRITORIES_QUERY,
  type TerritoryFilter,
  type TerritorySort,
  type TerritorySortDirection,
} from '@/features/territories/lib/listView'
import { useTerritoriesView } from '@/features/territories/stores/territoriesView'

const changed = () => {
  const { sort, direction, filters } = useTerritoriesView.getState()
  analytics.capture('territories_view_changed', {
    sort,
    direction,
    filters: filters.join(','),
  })
}

export default function useTerritoriesQuery() {
  const view = useTerritoriesView()
  const { sort, direction, filters } = view
  const isSortDefault =
    sort === DEFAULT_TERRITORIES_QUERY.sort &&
    direction === DEFAULT_TERRITORIES_QUERY.direction

  return {
    sort,
    direction,
    filters,
    isSortDefault,
    isDefault: isSortDefault && filters.length === 0,
    setSort: (next: TerritorySort) => {
      if (next === sort) return
      view.setSort(next)
      changed()
    },
    setDirection: (next: TerritorySortDirection) => {
      if (next === direction) return
      view.setDirection(next)
      changed()
    },
    toggleFilter: (filter: TerritoryFilter) => {
      view.toggleFilter(filter)
      changed()
    },
    clearFilters: () => {
      if (filters.length === 0) return
      view.clearFilters()
      changed()
    },
    reset: () => {
      view.reset()
      changed()
    },
  }
}
