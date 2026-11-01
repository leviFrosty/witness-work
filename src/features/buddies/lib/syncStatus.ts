export type BuddySyncFailureReason =
  | 'offline'
  | 'disabled'
  | 'suspended'
  | 'rate_limited'
  | 'unverified'
  | 'verify_later'
  | 'update'
  | 'error'

export type BuddySyncStatus = {
  syncing: number

  failure: { reason: BuddySyncFailureReason; at: number } | null

  relayDisabled: boolean

  accountSuspended: boolean
}

export const initialBuddySyncStatus: BuddySyncStatus = {
  syncing: 0,
  failure: null,
  relayDisabled: false,
  accountSuspended: false,
}

export const syncReadInbox = (lastSyncAt: number, startedAt: number) =>
  lastSyncAt >= startedAt

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

    relayDisabled: status.relayDisabled || outcome.reason === 'disabled',
    accountSuspended: status.accountSuspended || outcome.reason === 'suspended',
  }
}

export function accountActiveStatus(status: BuddySyncStatus): BuddySyncStatus {
  const failed = status.failure?.reason === 'suspended'
  if (!status.accountSuspended && !failed) return status
  return {
    ...status,
    accountSuspended: false,
    failure: failed ? null : status.failure,
  }
}

export async function trackSync<Outcome>(
  sync: () => Promise<Outcome>,
  deps: {
    update: (change: (status: BuddySyncStatus) => BuddySyncStatus) => void
    lastSyncAt: () => number
    now: () => number
    failureReason: (error: unknown) => BuddySyncFailureReason

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
