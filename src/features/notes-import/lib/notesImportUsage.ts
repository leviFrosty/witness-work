export interface CreditsSnapshot {
  /** Imports left in the current effective allowance; `null` when unlimited. */
  remaining: number | null
  /** Effective import allowance; `null` when unlimited. */
  limit: number | null
  /** UTC reset timestamp for an active finite window, otherwise `null`. */
  resetsAt: string | null
  /** The User's real entitlement status, independent of allowance values. */
  isSupporter: boolean
  /** Refinements left for this distinct source text; `null` when unlimited. */
  refinements: {
    remaining: number | null
    limit: number | null
  }
}

/**
 * Existing name retained for callers while the wire contract uses
 * CreditsSnapshot.
 */
export type NotesImportCredits = CreditsSnapshot
export type NotesImportRefinementCredits = CreditsSnapshot['refinements']
export type NotesImportRefinementsByHash = Record<
  string,
  NotesImportRefinementCredits
>

/**
 * Network input is untrusted until {@link normalizeNotesImportCredits} accepts
 * it.
 */
export type NotesImportCreditsWire = unknown

export interface NotesImportPublicSchedule {
  imports: { free: number | null; supporter: number | null }
  refinements: { free: number | null; supporter: number | null }
  windowDays: number
}

export type NotesImportStatus =
  | { available: true; limits: NotesImportPublicSchedule }
  | { available: false; reason?: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isAllowanceValue = (value: unknown): value is number | null =>
  value === null ||
  (typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0)

const isValidAllowance = (
  remaining: unknown,
  limit: unknown
): remaining is number | null => {
  if (!isAllowanceValue(remaining) || !isAllowanceValue(limit)) return false
  if ((remaining === null) !== (limit === null)) return false
  return remaining === null || (limit !== null && remaining <= limit)
}

/** Strict validation for one content hash's lifetime refinement allowance. */
export const normalizeNotesImportRefinementCredits = (
  value: unknown
): NotesImportRefinementCredits | null => {
  if (!isRecord(value)) return null
  if (!isValidAllowance(value.remaining, value.limit)) return null
  return {
    remaining: value.remaining,
    limit: value.limit as number | null,
  }
}

/** Validates the public, session-only allowance schedule status contract. */
export const normalizeNotesImportStatus = (
  value: unknown
): NotesImportStatus | null => {
  if (!isRecord(value) || typeof value.available !== 'boolean') return null

  if (!value.available) {
    if (Object.prototype.hasOwnProperty.call(value, 'limits')) return null
    if (value.reason !== undefined && typeof value.reason !== 'string') {
      return null
    }
    return value.reason === undefined
      ? { available: false }
      : { available: false, reason: value.reason }
  }

  const limits = value.limits
  if (
    !isRecord(limits) ||
    !isRecord(limits.imports) ||
    !isRecord(limits.refinements) ||
    !isAllowanceValue(limits.imports.free) ||
    !isAllowanceValue(limits.imports.supporter) ||
    !isAllowanceValue(limits.refinements.free) ||
    !isAllowanceValue(limits.refinements.supporter) ||
    typeof limits.windowDays !== 'number' ||
    !Number.isFinite(limits.windowDays) ||
    limits.windowDays <= 0
  ) {
    return null
  }

  return {
    available: true,
    limits: {
      imports: {
        free: limits.imports.free,
        supporter: limits.imports.supporter,
      },
      refinements: {
        free: limits.refinements.free,
        supporter: limits.refinements.supporter,
      },
      windowDays: limits.windowDays,
    },
  }
}

const isUtcIsoTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/
  )
  if (!match) return false
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return false
  const canonical = `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`
  return new Date(parsed).toISOString() === canonical
}

/**
 * Validates the complete required CreditsSnapshot and normalizes local expiry.
 * No legacy allowance or refinement defaults are inferred: malformed input is
 * represented as unavailable (`null`) so callers can preserve a prior valid
 * snapshot rather than replacing it with invented usage.
 */
export const normalizeNotesImportCredits = (
  value: unknown,
  options: { now?: number } = {}
): NotesImportCredits | null => {
  if (!isRecord(value) || !isRecord(value.refinements)) return null

  const { remaining, limit, resetsAt, isSupporter } = value
  const refinements = normalizeNotesImportRefinementCredits(value.refinements)

  if (
    !isValidAllowance(remaining, limit) ||
    !refinements ||
    typeof isSupporter !== 'boolean'
  ) {
    return null
  }

  if (resetsAt !== null && !isUtcIsoTimestamp(resetsAt)) return null
  // A reset exists only for an active, positive finite import window.
  if (resetsAt !== null && (limit === null || limit === 0)) return null

  const snapshot: NotesImportCredits = {
    remaining,
    limit: limit as number | null,
    resetsAt,
    isSupporter,
    refinements,
  }

  const now = options.now ?? Date.now()
  if (resetsAt !== null && now >= Date.parse(resetsAt)) {
    return { ...snapshot, remaining: snapshot.limit, resetsAt: null }
  }

  return snapshot
}

/**
 * Rebuilds the complete display snapshot for one content hash. Import allowance
 * fields are global, while refinement allowance is lifetime state owned by the
 * selected source text. Missing per-hash state is unavailable rather than
 * falling back to whichever import happened to finish most recently.
 */
export const notesImportCreditsForHash = (
  globalCredits: NotesImportCredits | null,
  refinementsByHash: NotesImportRefinementsByHash,
  hash: string
): NotesImportCredits | null => {
  const refinements = refinementsByHash[hash]
  return globalCredits && refinements ? { ...globalCredits, refinements } : null
}

/** Unlimited dev usage is not a Supporter entitlement and must retain the CTA. */
export const shouldShowNotesImportSupporterCta = (
  credits: Pick<NotesImportCredits, 'isSupporter'>
): boolean => !credits.isSupporter
