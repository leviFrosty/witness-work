import {
  createLiveSignal,
  type LiveCloseAction,
  type LiveSignalDeps,
} from '@/lib/liveSignal'

// The live signal moved to the shared tier (Cloud Sync and Shared Cars use it
// too); the inbox adds what the relay's close codes mean.
export type { LiveEvent } from '@/lib/liveSignal'

/** The relay closed the socket because the inbox is gone. */
const CLOSE_GONE = 4001
/** The relay closed the socket because the inbox's account is suspended. */
const CLOSE_SUSPENDED = 4003

/**
 * A wiped inbox is restored by the next sync. A suspended account would be
 * refused on every reconnect: the sync records the suspension, which keeps the
 * signal off until a sync works again.
 */
const inboxCloseAction = (code: number | undefined): LiveCloseAction =>
  code === CLOSE_GONE
    ? 'sync'
    : code === CLOSE_SUSPENDED
      ? 'syncAndStay'
      : 'reconnect'

export type LiveInboxDeps = Omit<LiveSignalDeps, 'closeAction'>

/**
 * Keeps one live connection to this User's inbox while started: syncs when the
 * relay says something changed, or on connecting when the inbox moved past what
 * this device has. Reconnects with backoff and detects dead connections with a
 * ping. Pushes and polling still cover the time it's stopped.
 */
export function createLiveInbox(deps: LiveInboxDeps) {
  return createLiveSignal({ ...deps, closeAction: inboxCloseAction })
}
