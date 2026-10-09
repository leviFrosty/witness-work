import { AppState } from 'react-native'
import { perf } from '@/lib/perf'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { isLiveHealthy } from '@/features/buddies/lib/liveDiagnostics'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesDiagnostics } from '@/features/buddies/stores/buddiesDiagnostics'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

/**
 * Syncs the app starts on its own (returning to it, opening a Buddies screen)
 * come at most this often, all of them together.
 */
export const AUTO_SYNC_FLOOR_MS = 30 * 1000
/**
 * Polls run only while the live connection is down, so pushes and the live
 * signal can be missed; this is how often then.
 */
export const FALLBACK_POLL_MS = 60 * 1000
/** Polls that keep failing wait longer, up to this many doublings. */
const MAX_POLL_BACKOFF_STEPS = 4

let lastAttempt = 0

/** The live connection is up and answering, so it reports every change. */
export const liveSignalHealthy = () =>
  isLiveHealthy(useBuddiesDiagnostics.getState().live, Date.now())

/**
 * An automatic sync, unless one ran or was tried within `AUTO_SYNC_FLOOR_MS`.
 * Skipped while the relay asked to back off (see the engine's `sync`).
 */
export function syncSoon(): Promise<void> {
  const now = Date.now()
  const last = Math.max(lastAttempt, useBuddies.getState().lastSyncAt)
  if (now - last >= 0 && now - last < AUTO_SYNC_FLOOR_MS) {
    perf.count('buddies:syncFloor')
    return Promise.resolve()
  }
  lastAttempt = now
  return buddiesEngine.sync({ automatic: true }).then(() => undefined)
}

/**
 * Runs `poll` every `intervalMs` while the app is in the foreground, Buddies
 * isn't switched off on the relay, and the live connection isn't healthy.
 * `poll` resolves false (or rejects) when it failed; each failure in a row
 * doubles the wait. Returns a stop function.
 */
export function startFallbackPoll(
  poll: () => Promise<boolean | void>,
  intervalMs = FALLBACK_POLL_MS
): () => void {
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const schedule = () => {
    if (stopped) return
    timer = setTimeout(
      run,
      intervalMs * 2 ** Math.min(failures, MAX_POLL_BACKOFF_STEPS)
    )
  }
  const run = async () => {
    timer = null
    if (
      AppState.currentState === 'active' &&
      !useBuddiesSession.getState().relayDisabled &&
      !liveSignalHealthy()
    ) {
      perf.count('buddies:poll')
      const worked = await poll().then(
        (result) => result !== false,
        () => false
      )
      failures = worked ? 0 : failures + 1
    }
    schedule()
  }
  schedule()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
