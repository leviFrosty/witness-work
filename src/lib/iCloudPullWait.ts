import { AppState, type AppStateStatus } from 'react-native'

/** Longest a launch-time decision waits for an iCloud pull, in ms. */
export const ICLOUD_PULL_WAIT_MS = 15_000

/**
 * Lets launch-time decisions that depend on synced data (the automatic
 * rollover) wait until this device has caught up with iCloud.
 *
 * The window opens each time the app comes to the foreground, not when the JS
 * runtime starts: a widget or background task can boot the runtime long before
 * the user opens the app. It closes at the first pull that read every remote
 * file in full (`markCompleteICloudPull`), or after `ICLOUD_PULL_WAIT_MS`,
 * since offline or signed out no pull comes.
 */
// A foreground launch may still report `unknown` or `inactive` here, and its
// first pull can finish before `active`, so only `background` defers the start.
// (`AppState` is optional so test mocks of react-native can leave it out.)
let activeSince: number | null =
  AppState?.currentState === 'background' ? null : Date.now()
let completePullAt: number | null = null
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())

let previousAppState: AppStateStatus | null = AppState?.currentState ?? null
AppState?.addEventListener?.('change', (next) => {
  if (
    next === 'active' &&
    (previousAppState === 'background' || activeSince === null)
  ) {
    activeSince = Date.now()
    notify()
  }
  previousAppState = next
})

/**
 * Called by iCloud sync after a pull that found the remote files and merged
 * every one of them: none left downloading, none skipped as unreadable or from
 * a newer app version.
 */
export function markCompleteICloudPull(at: number = Date.now()): void {
  completePullAt = at
  notify()
}

let syncCanPull: () => boolean = () => true

/**
 * Registered by the sync engine: whether a pull can come at all right now
 * (Supporter, signed in, online). When it can't, waiting would only delay the
 * decision by `ICLOUD_PULL_WAIT_MS` on every return to the app.
 */
export function setICloudPullWaitGate(canPull: () => boolean): void {
  syncCanPull = canPull
}

export const iCloudPullCanCome = (): boolean => syncCanPull()

export function subscribeICloudPullWait(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Ms left to wait before deciding, or 0 to decide now. `Infinity` while the app
 * hasn't come to the foreground yet: the window hasn't opened.
 */
export function iCloudPullWaitRemainingMs({
  iCloudSyncOn,
  now = Date.now(),
  state = { activeSince, completePullAt },
}: {
  /** Whether cloud sync (iCloud or Google Drive) is on for this device. */
  iCloudSyncOn: boolean
  now?: number
  state?: { activeSince: number | null; completePullAt: number | null }
}): number {
  if (!iCloudSyncOn) return 0
  if (state.activeSince === null) return Infinity
  if (
    state.completePullAt !== null &&
    state.completePullAt >= state.activeSince
  )
    return 0
  return Math.max(0, state.activeSince + ICLOUD_PULL_WAIT_MS - now)
}
