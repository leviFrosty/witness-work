import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import { analytics } from '@/lib/analytics'
import { territoryListTitle } from '@/features/territories/lib/territoryTitle'
import {
  addPastVisits,
  EMPTY_TALLY,
  forgetDoors,
  type PastVisit,
  tallyDoors,
  tallyTotal,
  type VisitTally,
} from '@/features/territories/lib/visitTally'
import { useTerritories } from '@/features/territories/stores/territories'

export const useTerritoryVisits = create<VisitTally>()(
  persist((): VisitTally => EMPTY_TALLY, {
    name: 'territoryVisits',
    version: 2,
    migrate: () => EMPTY_TALLY,
    storage: createJSONStorage(() => MmkvStorage),
  })
)

let privacyOn = () => false

const apply = (next: (tally: VisitTally) => VisitTally) => {
  const before = useTerritoryVisits.getState()
  const after = next(before)
  if (after === before) return
  useTerritoryVisits.setState(after, true)
  if (before.readyAt === undefined && after.readyAt !== undefined)
    analytics.capture('territory_insights_ready', {
      visits: tallyTotal(after),
      territories: Object.keys(after.territories).length,
    })
}

const tallyNow = () =>
  apply((tally) =>
    tallyDoors(tally, useTerritories.getState().territories, {
      now: Date.now(),
      title: territoryListTitle,
      keepGone: !privacyOn(),
    })
  )

export function startVisitTally(options: {
  privacy: () => boolean
}): () => void {
  privacyOn = options.privacy
  const stores = [useTerritories, useTerritoryVisits] as const
  let started = false
  const start = () => {
    if (started || !stores.every((store) => store.persist.hasHydrated())) return
    started = true
    tallyNow()
  }
  const unhydrated = stores.map((store) =>
    store.persist.onFinishHydration(start)
  )
  start()
  const unsubscribe = useTerritories.subscribe((state, previous) => {
    if (!started || state.territories === previous.territories) return
    tallyNow()
  })
  return () => {
    unhydrated.forEach((stop) => stop())
    unsubscribe()
  }
}

export const forgetDoorVisits = (doorIds: readonly string[]) => {
  if (doorIds.length > 0)
    apply((tally) => forgetDoors(tally, doorIds, Date.now()))
}

export const addPastDoorVisits = (
  territory: { id: string; title: string },
  visits: readonly PastVisit[]
) => apply((tally) => addPastVisits(tally, territory, visits, Date.now()))

export const markInsightsSeen = () => {
  const { readyAt, seenAt } = useTerritoryVisits.getState()
  if (readyAt !== undefined && seenAt === undefined)
    useTerritoryVisits.setState({ seenAt: Date.now() })
}

export const resetVisitTally = () => {
  useTerritoryVisits.setState(EMPTY_TALLY, true)
  tallyNow()
}

export const useTerritoryTallies = (territoryId?: string) => {
  const territories = useTerritoryVisits((state) => state.territories)
  if (territoryId === undefined) return Object.values(territories)
  const tally = territories[territoryId]
  return tally ? [tally] : []
}
