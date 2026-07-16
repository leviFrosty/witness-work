import { MMKV } from 'react-native-mmkv'
import {
  normalizeNotesImportCredits,
  normalizeNotesImportRefinementCredits,
  type NotesImportCredits,
  type NotesImportRefinementsByHash,
} from '@/features/notes-import/lib/notesImportUsage'

/**
 * Durable credit authority. Import allowance fields are global, while every
 * content hash retains its own lifetime refinement allowance. The complete
 * latest authoritative snapshot remains in `credits`; `refinementsByHash`
 * prevents reopening import A from displaying import B's nested balance.
 */
export interface PersistedNotesImportCredits {
  credits: NotesImportCredits
  refinementsByHash: NotesImportRefinementsByHash
}

// Lazy MMKV (matches the ledger) so importing this module never constructs
// native storage — node-based tests that touch pure usage helpers stay clear.
let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'notes-import-credits' }))

const KEY = 'credits'
const BEFORE_ANY_EXPIRY = Number.NEGATIVE_INFINITY

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Strictly validates persisted authority without applying lifecycle expiry. */
const normalizePersistedCredits = (
  value: unknown
): PersistedNotesImportCredits | null => {
  // Development builds may still hold the previous single-snapshot shape.
  // Preserve only its global fields; its nested refinement has no hash
  // provenance and therefore must not be shown for an arbitrary history row.
  const legacy = normalizeNotesImportCredits(value, {
    now: BEFORE_ANY_EXPIRY,
  })
  if (legacy) return { credits: legacy, refinementsByHash: {} }

  if (!isRecord(value) || !isRecord(value.refinementsByHash)) return null
  const credits = normalizeNotesImportCredits(value.credits, {
    now: BEFORE_ANY_EXPIRY,
  })
  if (!credits) return null

  const refinementsByHash: NotesImportRefinementsByHash = {}
  for (const [hash, raw] of Object.entries(value.refinementsByHash)) {
    const refinements = normalizeNotesImportRefinementCredits(raw)
    if (!refinements) return null
    refinementsByHash[hash] = refinements
  }
  return { credits, refinementsByHash }
}

/**
 * Loads strict persisted authority without promoting or expiring it. The
 * manager owns lifecycle normalization so it can preserve kickoff provenance,
 * detect a real window rollover, re-arm stale denials, and persist atomically.
 */
export const loadPersistedCredits = (): PersistedNotesImportCredits | null => {
  const raw = store().getString(KEY)
  if (!raw) return null
  try {
    return normalizePersistedCredits(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

/** Strictly records terminal/denial authority plus per-hash refinement state. */
export const persistCredits = (
  value: unknown
): PersistedNotesImportCredits | null => {
  const credits = normalizePersistedCredits(value)
  if (!credits) return null
  store().set(KEY, JSON.stringify(credits))
  return credits
}
