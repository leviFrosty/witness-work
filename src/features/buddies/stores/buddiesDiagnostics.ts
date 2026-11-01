import { create } from 'zustand'
import {
  applyLiveEvent,
  initialLiveDiagnostics,
  type LiveDiagnostics,
} from '@/features/buddies/lib/liveDiagnostics'
import type { LiveEvent } from '@/features/buddies/lib/liveInbox'
import type { RelayCheckReport } from '@/features/buddies/lib/relayCheck'

export type LiveControls = { reconnect: () => void; ping: () => void }

export const useBuddiesDiagnostics = create<{
  live: LiveDiagnostics
  controls: LiveControls | null
  relayCheck: { running: boolean; report: RelayCheckReport | null }
}>()(() => ({
  live: initialLiveDiagnostics,
  controls: null,
  relayCheck: { running: false, report: null },
}))

export const recordLiveEvent = (event: LiveEvent) =>
  useBuddiesDiagnostics.setState((state) => ({
    live: applyLiveEvent(state.live, event, Date.now()),
  }))
