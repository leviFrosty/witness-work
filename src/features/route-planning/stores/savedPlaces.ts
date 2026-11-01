import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type {
  SavedPlace,
  SavedPlaceKind,
} from '@/features/route-planning/lib/routeBuilder'

type SavedPlacesState = {
  places: Partial<Record<SavedPlaceKind, SavedPlace>>
  set: (kind: SavedPlaceKind, place: SavedPlace) => void
  clear: (kind: SavedPlaceKind) => void
}

export const useSavedPlaces = create<SavedPlacesState>()(
  persist(
    (set) => ({
      places: {},
      set: (kind, place) =>
        set((state) => ({ places: { ...state.places, [kind]: place } })),
      clear: (kind) =>
        set((state) => {
          const { [kind]: _cleared, ...places } = state.places
          return { places }
        }),
    }),
    {
      name: 'route-saved-places',
      version: 1,
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ places }) => ({ places }),
    }
  )
)
