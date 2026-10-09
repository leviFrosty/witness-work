/** Why a Buddies sync failed, as `buddiesFailureReason` reads it. */
export type BuddySyncFailureReason =
  | 'offline'
  | 'disabled'
  | 'rate_limited'
  | 'error'

/** How Buddies syncs from anywhere in the app have gone. */
export type BuddySyncStatus = {
  /** Syncs in flight. */
  syncing: number
  /** The latest sync that couldn't read the inbox; cleared by one that does. */
  failure: { reason: BuddySyncFailureReason; at: number } | null
  /** The relay's kill switch refused a sync; cleared by one that works. */
  relayDisabled: boolean
}

export const initialBuddySyncStatus: BuddySyncStatus = {
  syncing: 0,
  failure: null,
  relayDisabled: false,
}

/**
 * Whether a sync started at `startedAt` read the inbox. Publishing comes after,
 * so a sync that then failed still brought everything in.
 */
export const syncReadInbox = (lastSyncAt: number, startedAt: number) =>
  lastSyncAt >= startedAt

/** The status once one sync settles; no `reason` when it read the inbox. */
export function settledSyncStatus(
  status: BuddySyncStatus,
  outcome: { at: number; reason?: BuddySyncFailureReason }
): BuddySyncStatus {
  const syncing = Math.max(0, status.syncing - 1)
  if (!outcome.reason) return { syncing, failure: null, relayDisabled: false }
  return {
    syncing,
    failure: { reason: outcome.reason, at: outcome.at },
    // Any other failure says nothing about the kill switch.
    relayDisabled: status.relayDisabled || outcome.reason === 'disabled',
  }
}

/**
 * Runs one sync and records how it went. Callers see the same result as an
 * untracked sync. A sync that didn't run (`skipped`), or that its caller
 * cancelled, says nothing new and leaves the status as it was.
 */
export async function trackSync<Outcome>(
  sync: () => Promise<Outcome>,
  deps: {
    update: (change: (status: BuddySyncStatus) => BuddySyncStatus) => void
    lastSyncAt: () => number
    now: () => number
    failureReason: (error: unknown) => BuddySyncFailureReason
    /** Did nothing: e.g. waiting out the relay's back-off. */
    skipped?: (outcome: Outcome) => boolean
    cancelled?: (error: unknown) => boolean
  }
): Promise<Outcome> {
  const startedAt = deps.now()
  const untracked = (status: BuddySyncStatus) => ({
    ...status,
    syncing: Math.max(0, status.syncing - 1),
  })
  deps.update((status) => ({ ...status, syncing: status.syncing + 1 }))
  let outcome: Outcome
  try {
    outcome = await sync()
  } catch (error) {
    if (deps.cancelled?.(error)) {
      deps.update(untracked)
      throw error
    }
    const reason = syncReadInbox(deps.lastSyncAt(), startedAt)
      ? undefined
      : deps.failureReason(error)
    deps.update((status) =>
      settledSyncStatus(status, { at: deps.now(), reason })
    )
    throw error
  }
  if (deps.skipped?.(outcome)) deps.update(untracked)
  else deps.update((status) => settledSyncStatus(status, { at: deps.now() }))
  return outcome
}

/**
 * What the Buddies screen says about syncing: nothing while the latest sync
 * worked, else why it didn't. Rate limits read as a plain failure.
 */
export type BuddiesSyncNotice = 'offline' | 'disabled' | 'error' | null

export function buddiesSyncNotice(
  status: Pick<BuddySyncStatus, 'failure' | 'relayDisabled'>,
  lastSyncAt: number
): BuddiesSyncNotice {
  if (status.relayDisabled) return 'disabled'
  const { failure } = status
  if (!failure || failure.at <= lastSyncAt) return null
  if (failure.reason === 'offline' || failure.reason === 'disabled')
    return failure.reason
  return 'error'
}
