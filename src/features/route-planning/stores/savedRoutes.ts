import moment from 'moment'
import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { SavedRoute } from '@/features/route-planning/lib/routeBuilder'

const KEEP_PAST_DAYS = 14

type SavedRoutesState = {
  routes: Record<string, SavedRoute>
  save: (route: SavedRoute) => void

  clear: (day: string) => void
}

const withoutStale = (routes: Record<string, SavedRoute>) => {
  const cutoff = moment().subtract(KEEP_PAST_DAYS, 'days').format('YYYY-MM-DD')
  return Object.fromEntries(
    Object.entries(routes).filter(([day]) => day >= cutoff)
  )
}

export const useSavedRoutes = create<SavedRoutesState>()(
  persist(
    (set) => ({
      routes: {},
      save: (route) =>
        set((state) => ({
          routes: withoutStale({
            ...state.routes,
            [route.day]: { ...route, updatedAt: Date.now() },
          }),
        })),
      clear: (day) =>
        set((state) => {
          const { [day]: _cleared, ...routes } = state.routes
          return { routes }
        }),
    }),
    {
      name: 'saved-routes',
      version: 1,
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ routes }) => ({ routes }),
    }
  )
)
