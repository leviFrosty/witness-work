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
 * untracked sync.
 */
export async function trackSync(
  sync: () => Promise<void>,
  deps: {
    update: (change: (status: BuddySyncStatus) => BuddySyncStatus) => void
    lastSyncAt: () => number
    now: () => number
    failureReason: (error: unknown) => BuddySyncFailureReason
  }
): Promise<void> {
  const startedAt = deps.now()
  deps.update((status) => ({ ...status, syncing: status.syncing + 1 }))
  try {
    await sync()
  } catch (error) {
    const reason = syncReadInbox(deps.lastSyncAt(), startedAt)
      ? undefined
      : deps.failureReason(error)
    deps.update((status) =>
      settledSyncStatus(status, { at: deps.now(), reason })
    )
    throw error
  }
  deps.update((status) => settledSyncStatus(status, { at: deps.now() }))
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
