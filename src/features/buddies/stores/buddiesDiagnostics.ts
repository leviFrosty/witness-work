import { create } from 'zustand'
import {
  applyLiveEvent,
  initialLiveDiagnostics,
  type LiveDiagnostics,
} from '@/features/buddies/lib/liveDiagnostics'
import type { LiveEvent } from '@/features/buddies/lib/liveInbox'
import type { RelayCheckReport } from '@/features/buddies/lib/relayCheck'

/** Tools' handles on the running live connection; null while it isn't. */
export type LiveControls = { reconnect: () => void; ping: () => void }

/**
 * Buddies diagnostics for Tools and the verify harness: the live connection's
 * state and event log, and the latest relay check. In memory only, and cheap to
 * keep: a fixed-size log, no ids or content.
 */
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
