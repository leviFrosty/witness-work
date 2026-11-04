/**
 * The web's first Cloud Sync decision this launch, which holds onboarding
 * (`useWebOnboardingHold`). A browser that signed in to an account a phone
 * already filled must not answer onboarding first: its fresh role and goals are
 * newer, so they'd win on every phone (the new-device hazard
 * `resolveInitialEnable` documents).
 *
 * - `checking`: the decision is running, or will run. A complete pull
 *   (`cloudSyncPullSettled`) ends the hold.
 * - `stalled`: it couldn't decide for now (offline, no session, a read that
 *   didn't finish, the server's switch off, or only slots it can't read). The
 *   hold offers Retry, which runs it again, and says why when it's the switch
 *   or a slot (`FirstSyncStallReason`).
 * - `released`: sync can't run for this account (not entitled), so nothing can be
 *   overwritten and onboarding may run.
 *
 * In memory only, so every launch starts at `checking`. Free of native imports.
 */
export type FirstSyncState = 'checking' | 'stalled' | 'released'

/**
 * Why it stalled, when it's something a connection doesn't fix: the server's
 * Cloud Sync switch is off (`paused`), or another device's slot can't be read
 * here (`unreadable`: damaged, or from a newer app version).
 */
export type FirstSyncStallReason = 'paused' | 'unreadable'

let state: FirstSyncState = 'checking'
let stallReason: FirstSyncStallReason | null = null
const listeners = new Set<() => void>()
const retryHandlers = new Set<() => void>()

const set = (next: FirstSyncState, reason: FirstSyncStallReason | null) => {
  if (state === next && stallReason === reason) return
  state = next
  stallReason = reason
  for (const listener of [...listeners]) listener()
}

export const firstSyncState = (): FirstSyncState => state

/** Why it's stalled, if `stallFirstSync` was told; null otherwise. */
export const firstSyncStallReason = (): FirstSyncStallReason | null =>
  stallReason

/** The decision can't finish for now; it tries again later or on Retry. */
export function stallFirstSync(reason?: FirstSyncStallReason): void {
  if (state === 'released') return
  set('stalled', reason ?? null)
}

/** Sync can't run for this account: onboarding needn't wait. */
export function releaseFirstSync(): void {
  set('released', null)
}

/** Retry, from the hold: back to `checking`, and every handler runs. */
export function retryFirstSync(): void {
  if (state === 'released') return
  set('checking', null)
  for (const handler of [...retryHandlers]) handler()
}

/** Another account, or none. */
export function resetFirstSync(): void {
  set('checking', null)
}

/**
 * The reason the stalled hold shows: the one recorded, else the server's switch
 * while it's off, else a slot the last pull couldn't read (once sync is on, a
 * Retry pulls instead of deciding). Null shows the connection hint.
 */
export function stallReasonShown({
  recorded,
  cloudSyncConfigEnabled,
  syncIssue,
}: {
  recorded: FirstSyncStallReason | null
  cloudSyncConfigEnabled: boolean | undefined
  syncIssue: string | null
}): FirstSyncStallReason | null {
  if (recorded) return recorded
  if (cloudSyncConfigEnabled === false) return 'paused'
  if (syncIssue === 'newer-version' || syncIssue === 'invalid-file')
    return 'unreadable'
  return null
}

/** Calls `listener` when the state changes. Returns the unsubscribe. */
export const onFirstSyncChange = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Calls `handler` on Retry. Returns the unsubscribe. */
export const onFirstSyncRetry = (handler: () => void): (() => void) => {
  retryHandlers.add(handler)
  return () => {
    retryHandlers.delete(handler)
  }
}
