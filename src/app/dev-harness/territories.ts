import { useTerritoriesSession } from '@/stores/territoriesSession'
import { setDocumentScanOverride } from '@/lib/scanDocumentText'
import {
  cardPhotoViewForDev,
  type PhotoView,
} from '@/features/territories/lib/cardPhotoTurn'
import {
  territoriesEngine,
  territoryInvitations,
} from '@/app/territories/territoriesService'

let last: unknown = null

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
  clearNotesScan: () => {
    setDocumentScanOverride(null)
    return 'cleared'
  },
}
