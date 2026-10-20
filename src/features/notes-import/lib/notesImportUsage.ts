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

/**
 * Optional minimum app version (`major.minor.patch`) the proxy advertises on
 * every status response. Absent when no floor is configured.
 */
interface NotesImportStatusVersionFloor {
  minAppVersion?: string
  /**
   * The worker can verify Android requests (ADR 0017). Absent until Play
   * Integrity is configured server-side, which keeps Android closed.
   */
  playIntegrity?: true
  /**
   * Import from Paper: the worker can read page photos (`POST
   * /notes-import/transcribe`), at most `maxPages` per batch. Absent on workers
   * without the endpoint, which keeps the option hidden.
   */
  transcribe?: { maxPages: number }
}

export type NotesImportStatus = NotesImportStatusVersionFloor &
  (
    | { available: true; limits: NotesImportPublicSchedule }
    | { available: false; reason?: string }
  )

const MIN_APP_VERSION_PATTERN = /^\d+\.\d+\.\d+$/

/**
 * A malformed `minAppVersion` is dropped (fail open) rather than rejecting the
 * whole status payload — the floor is advisory and must never take the
 * allowance schedule or availability down with it.
 */
const statusVersionFloor = (
  value: Record<string, unknown>
): NotesImportStatusVersionFloor => ({
  ...(typeof value.minAppVersion === 'string' &&
  MIN_APP_VERSION_PATTERN.test(value.minAppVersion)
    ? { minAppVersion: value.minAppVersion }
    : {}),
  ...(supportsPlayIntegrity(value.capabilities)
    ? { playIntegrity: true as const }
    : {}),
  ...transcribeCapability(value.capabilities),
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const supportsPlayIntegrity = (capabilities: unknown): boolean => {
  const play = isRecord(capabilities) ? capabilities.playIntegrity : undefined
  return (
    isRecord(play) &&
    Array.isArray(play.protocolVersions) &&
    play.protocolVersions.includes(1) &&
    typeof play.cloudProjectNumber === 'string'
  )
}

const transcribeCapability = (
  capabilities: unknown
): Pick<NotesImportStatusVersionFloor, 'transcribe'> => {
  const transcribe = isRecord(capabilities)
    ? capabilities.transcribe
    : undefined
  const maxPages = isRecord(transcribe) ? transcribe.maxPages : undefined
  return typeof maxPages === 'number' &&
    Number.isInteger(maxPages) &&
    maxPages > 0
    ? { transcribe: { maxPages } }
    : {}
}

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
    return {
      ...statusVersionFloor(value),
      ...(value.reason === undefined
        ? { available: false as const }
        : { available: false as const, reason: value.reason }),
    }
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
    ...statusVersionFloor(value),
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
 * `GET /notes-import/usage`: the account's allowance right now, the same on
 * every device on the account (ADR 0027), as kickoff would meter it.
 */
export interface NotesImportAccountUsage {
  /** The account counts as a Supporter (ADR 0029). */
  supporter: boolean
  /**
   * RevenueCat couldn't be reached, so the server answered (and meters) the
   * account as free for now.
   */
  supporterCheckFailed: boolean
  accountStatus: 'active' | 'suspended'
  imports: {
    /** `null` when unlimited. */
    limit: number | null
    /** New imports charged in the current window, on every device. */
    used: number
    /** `null` when unlimited. */
    remaining: number | null
    /** When the current window ends; `null` before its first charge. */
    resetsAt: string | null
  }
  /** Refinements allowed for each import; `null` when unlimited. */
  refinementsPerImport: number | null
  windowDays: number
}

/**
 * Strict validation for the account usage answer. Anything malformed is
 * unavailable (`null`), so the composer keeps what it shows.
 */
export const normalizeNotesImportAccountUsage = (
  value: unknown
): NotesImportAccountUsage | null => {
  if (!isRecord(value) || value.ok !== true) return null
  const { supporter, supporterCheckFailed, accountStatus, imports } = value
  const refinements = value.refinements
  if (
    typeof supporter !== 'boolean' ||
    typeof supporterCheckFailed !== 'boolean' ||
    (accountStatus !== 'active' && accountStatus !== 'suspended') ||
    !isRecord(imports) ||
    !isRecord(refinements) ||
    !isAllowanceValue(refinements.limitPerImport) ||
    typeof value.windowDays !== 'number' ||
    !Number.isFinite(value.windowDays) ||
    value.windowDays <= 0
  ) {
    return null
  }
  const { limit, used, remaining, resetsAt } = imports
  if (
    !isValidAllowance(remaining, limit) ||
    typeof used !== 'number' ||
    !Number.isInteger(used) ||
    used < 0 ||
    (resetsAt !== null && !isUtcIsoTimestamp(resetsAt))
  ) {
    return null
  }
  return {
    supporter,
    supporterCheckFailed,
    accountStatus,
    imports: {
      limit: limit as number | null,
      used,
      remaining,
      resetsAt: resetsAt as string | null,
    },
    refinementsPerImport: refinements.limitPerImport,
    windowDays: value.windowDays,
  }
}

/**
 * The account's allowance as the composer's balance. `null` when the server
 * couldn't check Supporter status: the composer keeps what it shows rather than
 * tell a Supporter they're free. Refinements carry each import's fresh
 * allowance; an import's own refinement balance comes from its runs.
 */
export const accountUsageCredits = (
  usage: NotesImportAccountUsage,
  options: { now?: number } = {}
): NotesImportCredits | null =>
  usage.supporterCheckFailed
    ? null
    : normalizeNotesImportCredits(
        {
          remaining: usage.imports.remaining,
          limit: usage.imports.limit,
          resetsAt: usage.imports.resetsAt,
          isSupporter: usage.supporter,
          refinements: {
            remaining: usage.refinementsPerImport,
            limit: usage.refinementsPerImport,
          },
        },
        options
      )

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

/** What the composer's Import Credits control shows. */
export type NotesImportUsageView =
  /**
   * The server's balance: the account's (`GET /notes-import/usage`), or this
   * device's last import's.
   */
  | { kind: 'balance'; credits: NotesImportCredits }
  /**
   * No balance (the account's couldn't be read, and this device hasn't
   * imported): the allowance from the public schedule, `null` when unlimited.
   * Not a balance: imports on the account's other devices may have used some of
   * it.
   */
  | { kind: 'allowance'; limit: number | null; windowDays: number }
  /** Neither a balance nor the schedule (offline, or the status failed). */
  | { kind: 'unavailable' }

/**
 * Picks the composer's usage view and whose copy it takes. The server's last
 * answer wins (`credits.isSupporter`, ADR 0029); before it, `supporter` is the
 * device's own entitlement, and the public schedule says what that allowance
 * is.
 */
export const notesImportUsageView = ({
  credits,
  schedule,
  supporter,
}: {
  credits: NotesImportCredits | null
  schedule: NotesImportPublicSchedule | null
  supporter: boolean
}): { view: NotesImportUsageView; isSupporter: boolean } => {
  if (credits)
    return {
      view: { kind: 'balance', credits },
      isSupporter: credits.isSupporter,
    }
  if (!schedule)
    return { view: { kind: 'unavailable' }, isSupporter: supporter }
  return {
    view: {
      kind: 'allowance',
      limit: supporter ? schedule.imports.supporter : schedule.imports.free,
      windowDays: schedule.windowDays,
    },
    isSupporter: supporter,
  }
}

/** True when the view's imports are unlimited. */
export const isUnlimitedUsage = (view: NotesImportUsageView): boolean =>
  view.kind === 'balance'
    ? view.credits.remaining === null && view.credits.limit === null
    : view.kind === 'allowance' && view.limit === null
