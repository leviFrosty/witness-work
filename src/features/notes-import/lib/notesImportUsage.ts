const LEGACY_IMPORT_LIMIT = 5
const LEGACY_REFINEMENT_LIMIT = 5

export interface NotesImportCredits {
  /** Credits left after this import; `null` when imports are unlimited. */
  remaining: number | null
  /** Included import-credit limit; `null` when imports are unlimited. */
  limit: number | null
  isSupporter: boolean
  /** Refinements left for this distinct source text. */
  refinements: {
    remaining: number
    limit: number
  }
}

/**
 * Wire shape accepts the response emitted before detailed usage shipped. A
 * retained Durable Object result can replay that shape for up to an hour after
 * a worker deploy, so network responses must be normalized before rendering.
 */
export interface NotesImportCreditsWire {
  remaining: number | null
  isSupporter: boolean
  limit?: number | null
  refinements?: {
    remaining: number
    limit: number
  }
}

const nonNegative = (
  value: number | null | undefined,
  fallback: number
): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback

export const normalizeNotesImportCredits = (
  credits: NotesImportCreditsWire,
  options: { unlimitedImports?: boolean } = {}
): NotesImportCredits => {
  const unlimited =
    options.unlimitedImports === true ||
    credits.isSupporter ||
    credits.remaining === null ||
    credits.limit === null
  const importLimit = unlimited
    ? null
    : nonNegative(credits.limit, LEGACY_IMPORT_LIMIT)
  const importRemaining = unlimited
    ? null
    : Math.min(
        importLimit ?? 0,
        nonNegative(credits.remaining, importLimit ?? 0)
      )
  const refinementLimit = nonNegative(
    credits.refinements?.limit,
    LEGACY_REFINEMENT_LIMIT
  )
  const refinementRemaining = Math.min(
    refinementLimit,
    nonNegative(credits.refinements?.remaining, refinementLimit)
  )

  return {
    remaining: importRemaining,
    limit: importLimit,
    // The first dev-unlimited proxy contract represented bypass as Supporter.
    // In a bypass-enabled dev bundle, keep the entitlement false so the real
    // Supporter CTA remains testable. Production always trusts the server flag.
    isSupporter: options.unlimitedImports ? false : credits.isSupporter,
    refinements: {
      remaining: refinementRemaining,
      limit: refinementLimit,
    },
  }
}

/** Unlimited dev usage is not a Supporter entitlement and must retain the CTA. */
export const shouldShowNotesImportSupporterCta = (
  credits: Pick<NotesImportCredits, 'isSupporter'>
): boolean => !credits.isSupporter

/**
 * Chooses the balance shown by the compact usage meter beside the composer.
 * Import credits are irrelevant when they are unlimited, so Supporters and
 * dev-bypass users see the per-import refinement balance instead.
 */
export const notesImportPrimaryUsage = (
  credits: NotesImportCredits
): { kind: 'imports' | 'refinements'; remaining: number; limit: number } => {
  if (credits.remaining === null || credits.limit === null) {
    return { kind: 'refinements', ...credits.refinements }
  }

  return {
    kind: 'imports',
    remaining: credits.remaining,
    limit: credits.limit,
  }
}
