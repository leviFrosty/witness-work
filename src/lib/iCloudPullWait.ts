import { AppState, type AppStateStatus } from 'react-native'

export const ICLOUD_PULL_WAIT_MS = 15_000

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

export function markCompleteICloudPull(at: number = Date.now()): void {
  completePullAt = at
  notify()
}

let syncCanPull: () => boolean = () => true

export function setICloudPullWaitGate(canPull: () => boolean): void {
  syncCanPull = canPull
}

export const iCloudPullCanCome = (): boolean => syncCanPull()

export function subscribeICloudPullWait(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function iCloudPullWaitRemainingMs({
  iCloudSyncOn,
  now = Date.now(),
  state = { activeSince, completePullAt },
}: {
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
