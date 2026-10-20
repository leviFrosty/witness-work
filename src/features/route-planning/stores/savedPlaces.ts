import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
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

/**
 * The User's Home and Kingdom Hall for the route builder. On this device only,
 * like the routes themselves.
 */
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
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ places }) => ({ places }),
    }
  )
)
