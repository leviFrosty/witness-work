import moment from 'moment'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MmkvStorage } from '@/stores/mmkv'
import type { SavedRoute } from '@/features/route-planning/lib/routeBuilder'

/** Routes for days this long gone are dropped. */
const KEEP_PAST_DAYS = 14

type SavedRoutesState = {
  /** By local day, `YYYY-MM-DD`. */
  routes: Record<string, SavedRoute>
  save: (route: SavedRoute) => void
  /** Forget the day's route, so it's rebuilt from the day's stops. */
  clear: (day: string) => void
}

const withoutStale = (routes: Record<string, SavedRoute>) => {
  const cutoff = moment().subtract(KEEP_PAST_DAYS, 'days').format('YYYY-MM-DD')
  return Object.fromEntries(
    Object.entries(routes).filter(([day]) => day >= cutoff)
  )
}

/**
 * Routes the User built in the route builder. Device-local for now: not in
 * iCloud or Google Drive sync, or in backups.
 */
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
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ routes }) => ({ routes }),
    }
  )
)
