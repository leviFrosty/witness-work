import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import {
  DEFAULT_TERRITORIES_QUERY,
  TERRITORY_FILTERS,
  TERRITORY_SORTS,
  type TerritoriesQuery,
  type TerritoryFilter,
  type TerritorySort,
  type TerritorySortDirection,
} from '@/features/territories/lib/listView'

type TerritoriesView = TerritoriesQuery & {
  setSort: (sort: TerritorySort) => void
  setDirection: (direction: TerritorySortDirection) => void
  toggleFilter: (filter: TerritoryFilter) => void
  clearFilters: () => void
  reset: () => void
}

export const useTerritoriesView = create<TerritoriesView>()(
  persist(
    (set) => ({
      ...DEFAULT_TERRITORIES_QUERY,
      setSort: (sort) => set({ sort }),
      setDirection: (direction) => set({ direction }),
      toggleFilter: (filter) =>
        set(({ filters }) => ({
          filters: TERRITORY_FILTERS.filter(
            (known) => (known === filter) !== filters.includes(known)
          ),
        })),
      clearFilters: () => set({ filters: [] }),
      reset: () => set(DEFAULT_TERRITORIES_QUERY),
    }),
    {
      name: 'territories-view',
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ sort, direction, filters }) => ({
        sort,
        direction,
        filters,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<TerritoriesQuery>
        return {
          ...current,
          sort:
            TERRITORY_SORTS.find((known) => known === saved.sort) ??
            current.sort,
          direction:
            saved.direction === 'asc' || saved.direction === 'desc'
              ? saved.direction
              : current.direction,
          filters: TERRITORY_FILTERS.filter((known) =>
            saved.filters?.includes(known)
          ),
        }
      },
    }
  )
)
