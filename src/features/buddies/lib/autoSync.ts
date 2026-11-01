import { AppState } from 'react-native'
import { perf } from '@/lib/perf'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { isLiveHealthy } from '@/features/buddies/lib/liveDiagnostics'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesDiagnostics } from '@/features/buddies/stores/buddiesDiagnostics'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

export const AUTO_SYNC_FLOOR_MS = 30 * 1000

export const FALLBACK_POLL_MS = 60 * 1000

const MAX_POLL_BACKOFF_STEPS = 4

let lastAttempt = 0

export const liveSignalHealthy = () =>
  isLiveHealthy(useBuddiesDiagnostics.getState().live, Date.now())

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
