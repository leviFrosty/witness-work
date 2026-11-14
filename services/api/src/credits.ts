/**
 * Pure Notes Import allowance decisions. Storage and clocks belong to the
 * per-user NotesImportIndex Durable Object; every time/window/config input is
 * explicit here so the full gate -> successful commit -> snapshot sequence is
 * deterministic and testable.
 */

/** Internal allowance sentinel: -1 unlimited, 0 none, positive finite. */
export type Allowance = number

/** A per-content-hash usage record, retained permanently across import windows. */
export interface HashRecord {
  charged: boolean
  refinements: number
}

/** Aggregate usage for one anchored fixed import window. */
export interface ImportWindow {
  count: number
  startedAt: number | null
}

/** The per-user state read by a decision/commit. `record: null` means new hash. */
export interface CreditState {
  window: ImportWindow
  record: HashRecord | null
}

export type CreditDenyReason = 'limit_reached' | 'refinement_limit'

export interface CreditDecision {
  allowed: boolean
  reason?: CreditDenyReason
  /** True when this content hash had no permanent record at preflight. */
  isNewHash: boolean
  isRefinement: boolean
  /** Projected import balance after this run succeeds; null means unlimited. */
  remaining: number | null
}

export interface RefinementUsage {
  remaining: number | null
  limit: number | null
}

/** Strict usage contract shared by kickoff, done, legacy success, and denials. */
export interface CreditsSnapshot {
  remaining: number | null
  limit: number | null
  resetsAt: string | null
  /** Real RevenueCat entitlement only; it never implies an allowance value. */
  isSupporter: boolean
  refinements: RefinementUsage
}

/**
 * Treat an absent or expired anchor as an inactive empty window. Expiry is
 * inclusive: at exactly `startedAt + duration`, the old window is inactive.
 * This function does not persist; the next successful finite charge lazily
 * replaces an expired stored window.
 */
export const normalizeImportWindow = (
  window: ImportWindow,
  now: number,
  windowDurationMs: number
): ImportWindow =>
  window.startedAt == null || now >= window.startedAt + windowDurationMs
    ? { count: 0, startedAt: null }
    : window

const finiteRemaining = (count: number, limit: number): number =>
  Math.max(0, limit - count)

const importRemaining = (window: ImportWindow, limit: Allowance): number | null =>
  limit === -1 ? null : finiteRemaining(window.count, limit)

const wireLimit = (limit: Allowance): number | null =>
  limit === -1 ? null : limit

export interface DecideCreditArgs {
  state: CreditState
  isRefinement: boolean
  importLimit: Allowance
  refinementLimit: Allowance
  now: number
  windowDurationMs: number
}

/**
 * Read-only preflight. Known hashes replay without import allowance; refinements
 * use only their per-hash lifetime allowance. New finite imports are admitted
 * from the normalized fixed window and charged only by computeCommit on success.
 */
export const decideCredit = ({
  state,
  isRefinement,
  importLimit,
  refinementLimit,
  now,
  windowDurationMs,
}: DecideCreditArgs): CreditDecision => {
  const window = normalizeImportWindow(state.window, now, windowDurationMs)
  const { record } = state

  if (record) {
    if (
      isRefinement &&
      refinementLimit !== -1 &&
      record.refinements >= refinementLimit
    ) {
      return {
        allowed: false,
        reason: 'refinement_limit',
        isNewHash: false,
        isRefinement: true,
        remaining: importRemaining(window, importLimit),
      }
    }
    return {
      allowed: true,
      isNewHash: false,
      isRefinement,
      remaining: importRemaining(window, importLimit),
    }
  }

  // A refinement flag has no meaning without a prior hash record.
  if (importLimit === -1) {
    return {
      allowed: true,
      isNewHash: true,
      isRefinement: false,
      remaining: null,
    }
  }
  if (window.count >= importLimit) {
    return {
      allowed: false,
      reason: 'limit_reached',
      isNewHash: true,
      isRefinement: false,
      remaining: 0,
    }
  }
  return {
    allowed: true,
    isNewHash: true,
    isRefinement: false,
    remaining: finiteRemaining(window.count + 1, importLimit),
  }
}

/** Current per-hash lifetime refinement usage in strict wire form. */
export const refinementUsage = (
  record: HashRecord | null,
  refinementLimit: Allowance
): RefinementUsage => {
  if (refinementLimit === -1) return { remaining: null, limit: null }
  return {
    remaining: finiteRemaining(record?.refinements ?? 0, refinementLimit),
    limit: refinementLimit,
  }
}

export interface CreditsSnapshotArgs {
  state: CreditState
  isSupporter: boolean
  importLimit: Allowance
  refinementLimit: Allowance
  now: number
  windowDurationMs: number
}

/** Build the authoritative current snapshot from persisted state. */
export const computeCreditsSnapshot = ({
  state,
  isSupporter,
  importLimit,
  refinementLimit,
  now,
  windowDurationMs,
}: CreditsSnapshotArgs): CreditsSnapshot => {
  const window = normalizeImportWindow(state.window, now, windowDurationMs)
  const resetsAt =
    importLimit > 0 && window.startedAt != null
      ? new Date(window.startedAt + windowDurationMs).toISOString()
      : null
  return {
    remaining: importRemaining(window, importLimit),
    limit: wireLimit(importLimit),
    resetsAt,
    isSupporter,
    refinements: refinementUsage(state.record, refinementLimit),
  }
}

/** An account's import allowance as `GET /notes-import/usage` reports it. */
export interface ImportUsage {
  /** Imports allowed per window; null means unlimited. */
  limit: number | null
  /** New imports charged in the current window (0 when none is active). */
  used: number
  /** Imports left in the current window; null means unlimited. */
  remaining: number | null
  /** When the current window ends; null before its first charge, or unlimited. */
  resetsAt: string | null
}

export interface ImportUsageArgs {
  window: ImportWindow
  importLimit: Allowance
  now: number
  windowDurationMs: number
}

/**
 * The import half of the authoritative snapshot, read-only, plus how many
 * imports the window has charged. The same normalization the gate and
 * settlement use, so it can't drift from what kickoff enforces.
 */
export const computeImportUsage = ({
  window,
  importLimit,
  now,
  windowDurationMs,
}: ImportUsageArgs): ImportUsage => {
  const { remaining, limit, resetsAt } = computeCreditsSnapshot({
    state: { window, record: null },
    isSupporter: false,
    importLimit,
    refinementLimit: -1,
    now,
    windowDurationMs,
  })
  const used = normalizeImportWindow(window, now, windowDurationMs).count
  return { limit, used, remaining, resetsAt }
}

export interface KickoffCreditsArgs extends CreditsSnapshotArgs {
  decision: CreditDecision
}

/**
 * Kickoff preview. It projects the admitted run's finite decrement for immediate
 * display, but cannot invent an anchor: a first window still has resetsAt null
 * until terminal success commits it. Terminal state may also differ because a
 * concurrent run, expiry, entitlement, or runtime-config change intervened.
 */
export const computeKickoffCredits = ({
  decision,
  state,
  isSupporter,
  importLimit,
  refinementLimit,
  now,
  windowDurationMs,
}: KickoffCreditsArgs): CreditsSnapshot => {
  const current = computeCreditsSnapshot({
    state,
    isSupporter,
    importLimit,
    refinementLimit,
    now,
    windowDurationMs,
  })
  const refinements = decision.isRefinement
    ? refinementLimit === -1
      ? current.refinements
      : {
          remaining: Math.max(0, (current.refinements.remaining ?? 0) - 1),
          limit: current.refinements.limit,
        }
    : current.refinements
  return {
    ...current,
    remaining: decision.remaining,
    refinements,
  }
}

/** Separate rolling Empty Import grace, unchanged by the import window. */
export interface EmptyGrace {
  isEmpty: boolean
  countInWindow: number
  limit: number
}

export interface CommitCreditArgs {
  decision: CreditDecision
  /** Current serialized state, re-read immediately before settlement. */
  state: CreditState
  /** Effective allowance at settlement, which may differ from kickoff. */
  importLimit: Allowance
  now: number
  windowDurationMs: number
  empty?: EmptyGrace
}

export interface WindowRollover {
  previousCount: number
  previousResetsAt: string
  newResetsAt: string
}

export interface CommitCreditResult {
  state: CreditState
  emptyCharged: boolean
  recordsEmptyRun: boolean
  /** Present only when a successful finite charge replaces an expired window. */
  rollover: WindowRollover | null
}

/**
 * Settle a successful run against current state. The per-user DO serializes this
 * read/commit/write, preserving the existing bounded concurrent-overage policy:
 * every previously admitted distinct hash may commit, and wire balances clamp
 * to zero. A hash record makes each source permanently replayable.
 */
export const computeCommit = ({
  decision,
  state,
  importLimit,
  now,
  windowDurationMs,
  empty,
}: CommitCreditArgs): CommitCreditResult => {
  const { record } = state
  const finiteCharge =
    decision.isNewHash && importLimit > 0 && record == null

  if (empty?.isEmpty && finiteCharge && empty.countInWindow < empty.limit) {
    // Free Empty Import: no hash record and no aggregate-window mutation.
    return {
      state,
      emptyCharged: false,
      recordsEmptyRun: true,
      rollover: null,
    }
  }

  if (decision.isNewHash) {
    // Another serialized commit may already have recorded this hash.
    if (record) {
      return {
        state,
        emptyCharged: false,
        recordsEmptyRun: false,
        rollover: null,
      }
    }

    if (importLimit > 0) {
      const normalized = normalizeImportWindow(
        state.window,
        now,
        windowDurationMs
      )
      const startsWindow = normalized.startedAt == null
      const nextWindow: ImportWindow = startsWindow
        ? { count: 1, startedAt: now }
        : { count: normalized.count + 1, startedAt: normalized.startedAt }
      const wasExpired =
        state.window.startedAt != null &&
        now >= state.window.startedAt + windowDurationMs
      const rollover = wasExpired
        ? {
            previousCount: state.window.count,
            previousResetsAt: new Date(
              state.window.startedAt! + windowDurationMs
            ).toISOString(),
            newResetsAt: new Date(now + windowDurationMs).toISOString(),
          }
        : null
      return {
        state: {
          window: nextWindow,
          record: { charged: true, refinements: 0 },
        },
        emptyCharged: empty?.isEmpty ?? false,
        recordsEmptyRun: empty?.isEmpty ?? false,
        rollover,
      }
    }

    // Unlimited (or a limit changed to zero after admission): retain replay and
    // refinement accounting, but consume/anchor no import-window usage.
    return {
      state: {
        window: state.window,
        record: { charged: false, refinements: 0 },
      },
      emptyCharged: false,
      recordsEmptyRun: false,
      rollover: null,
    }
  }

  if (decision.isRefinement) {
    const base = record ?? { charged: false, refinements: 0 }
    return {
      state: {
        window: state.window,
        record: { ...base, refinements: base.refinements + 1 },
      },
      emptyCharged: false,
      recordsEmptyRun: false,
      rollover: null,
    }
  }

  return {
    state,
    emptyCharged: false,
    recordsEmptyRun: false,
    rollover: null,
  }
}
