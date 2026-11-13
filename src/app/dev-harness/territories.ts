import moment from 'moment'
import { useTerritoriesSession } from '@/stores/territoriesSession'
import { setDocumentScanOverride } from '@/lib/scanDocumentText'
import {
  cardPhotoViewForDev,
  type PhotoView,
} from '@/features/territories/lib/cardPhotoTurn'
import { buildTerritoryFixture } from '@/app/dev-fixtures/territories'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
import { TERRITORY_INSIGHTS_NOTIFICATION_ID } from '@/features/territories/hooks/useTerritoryInsightsNotification'
import { territoryListTitle } from '@/features/territories/lib/territoryTitle'
import { useTerritories } from '@/features/territories/stores/territories'
import {
  addPastDoorVisits,
  resetVisitTally,
} from '@/features/territories/stores/territoryVisits'
import {
  territoriesEngine,
  territoryInvitations,
} from '@/app/territories/territoriesService'

let last: unknown = null

export function generateTerritories(few = false) {
  const { territories, pastVisits } = buildTerritoryFixture({
    now: moment(),
    few,
  })
  const store = useTerritories.getState()
  const added = territories.filter(
    (territory) => !store.territories.some((t) => t.id === territory.id)
  )
  for (const territory of territories) store.save(territory)
  for (const territory of added) {
    const visits = pastVisits[territory.id]
    if (visits)
      addPastDoorVisits(
        { id: territory.id, title: territoryListTitle(territory) },
        visits
      )
  }
  return territories
}

export const forgetInsightsNotification = () =>
  useNotificationsTray.setState((state) => {
    const without = (record: Record<string, number>) =>
      Object.fromEntries(
        Object.entries(record).filter(
          ([id]) => id !== TERRITORY_INSIGHTS_NOTIFICATION_ID
        )
      )
    return {
      arrivals: without(state.arrivals),
      dismissed: without(state.dismissed),
      seen: without(state.seen),
    }
  })

function tracked<T>(work: () => Promise<T>): Promise<T> {
  last = { pending: true }
  const run = work()
  run.then(
    (value) => {
      last = value ?? { done: true }
    },
    (error: unknown) => {
      const code = (error as { code?: unknown } | null)?.code
      last = {
        error: typeof code === 'string' ? code : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
    }
  )
  return run
}

export const territoriesHarness = {
  engine: territoriesEngine,
  invitations: territoryInvitations,
  running: () => useTerritoriesSession.getState().running,
  run: <T>(work: () => Promise<T>) => {
    void tracked(work).catch(() => undefined)
    return 'started'
  },
  last: () => last,
  showCardPhoto: (view: PhotoView) => cardPhotoViewForDev.show(view),
  stubNotesScan: (text: string | null) => {
    setDocumentScanOverride(async () =>
      text === null
        ? { status: 'cancelled' }
        : { status: 'scanned', text, pages: 1 }
    )
    return 'stubbed'
  },
  generateSample: (few = false) => generateTerritories(few).length,
  resetInsights: () => {
    resetVisitTally()
    forgetInsightsNotification()
    return 'reset'
  },
  clearNotesScan: () => {
    setDocumentScanOverride(null)
    return 'cleared'
  },
}
