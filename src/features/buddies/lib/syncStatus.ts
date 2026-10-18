/** Why a Buddies sync failed, as `buddiesFailureReason` reads it. */
export type BuddySyncFailureReason =
  | 'offline'
  | 'disabled'
  | 'suspended'
  | 'rate_limited'
  /** This device can't be verified, so it has no account session. */
  | 'unverified'
  /** Verifying this device failed for now. */
  | 'verify_later'
  /** Ww-api needs a newer app. */
  | 'update'
  | 'error'

/** How Buddies syncs from anywhere in the app have gone. */
export type BuddySyncStatus = {
  /** Syncs in flight. */
  syncing: number
  /** The latest sync that couldn't read the inbox; cleared by one that does. */
  failure: { reason: BuddySyncFailureReason; at: number } | null
  /** The relay's kill switch refused a sync; cleared by one that works. */
  relayDisabled: boolean
  /**
   * The relay refused a sync for a suspended account; cleared by one that
   * works.
   */
  accountSuspended: boolean
}

export const initialBuddySyncStatus: BuddySyncStatus = {
  syncing: 0,
  failure: null,
  relayDisabled: false,
  accountSuspended: false,
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
  if (!outcome.reason)
    return {
      syncing,
      failure: null,
      relayDisabled: false,
      accountSuspended: false,
    }
  return {
    syncing,
    failure: { reason: outcome.reason, at: outcome.at },
    // Any other failure says nothing about the kill switch or a suspension.
    relayDisabled: status.relayDisabled || outcome.reason === 'disabled',
    accountSuspended: status.accountSuspended || outcome.reason === 'suspended',
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
 * worked, else why it didn't. Rate limits read as a plain failure, and so does
 * an app that needs updating (Update Required covers the screen anyway).
 */
export type BuddiesSyncNotice =
  | 'offline'
  | 'disabled'
  | 'suspended'
  | 'unverified'
  | 'verifyLater'
  | 'error'
  | null

export function buddiesSyncNotice(
  status: Pick<BuddySyncStatus, 'failure' | 'relayDisabled'>,
  lastSyncAt: number
): BuddiesSyncNotice {
  if (status.relayDisabled) return 'disabled'
  const { failure } = status
  if (!failure || failure.at <= lastSyncAt) return null
  if (
    failure.reason === 'offline' ||
    failure.reason === 'disabled' ||
    failure.reason === 'suspended' ||
    failure.reason === 'unverified'
  )
    return failure.reason
  if (failure.reason === 'verify_later') return 'verifyLater'
  return 'error'
}
