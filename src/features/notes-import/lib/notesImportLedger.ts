import { MMKV } from 'react-native-mmkv'
import type { ImportCommitResult } from '@/lib/import/writeMappedData'
import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'

/**
 * Client-only Import ledger (decisions 7 & 8). Keyed by content hash, it caches
 * the model's parsed result plus the exact records a commit inserted, so that:
 *
 * - A re-import of already-seen text REPLAYS the cached result instead of paying
 *   for another model call (and re-applies dupe-safe, hash-derived ids), and
 * - An accepted import can be undone precisely (delete exactly what it inserted).
 *
 * It holds notes-derived data only on THIS device — the proxy persists nothing
 * (ADR 0008). A reinstall loses it; hash-derived ids keep re-commits
 * dupe-safe.
 */

export interface NotesImportLedgerEntry {
  hash: string
  /** The model's full structured output, for replay + as a refinement base. */
  result: NotesImportResult
  /** What the accepted commit inserted, for undo. Null until accepted. */
  commit: ImportCommitResult | null
  /** Epoch ms the result was first cached. */
  parsedAt: number
  /** Epoch ms the import was accepted (committed), if it has been. */
  acceptedAt: number | null
}

// Lazy MMKV so importing this module doesn't construct native storage (keeps it
// out of the way of node-based unit tests that never touch the ledger).
let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'notes-import-ledger' }))

const key = (hash: string) => `entry:${hash}`

/** ImportCommitResult carries Date objects that JSON flattens to strings. */
const reviveCommit = (
  commit: ImportCommitResult | null
): ImportCommitResult | null => {
  if (!commit) return null
  return {
    ...commit,
    insertedTimeEntries: commit.insertedTimeEntries.map((e) => ({
      ...e,
      date: new Date(e.date),
    })),
    publisherChange: commit.publisherChange
      ? {
          ...commit.publisherChange,
          prevTenure: commit.publisherChange.prevTenure
            ? new Date(commit.publisherChange.prevTenure)
            : null,
        }
      : null,
  }
}

export const getLedgerEntry = (hash: string): NotesImportLedgerEntry | null => {
  const raw = store().getString(key(hash))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as NotesImportLedgerEntry
    return { ...parsed, commit: reviveCommit(parsed.commit) }
  } catch {
    return null
  }
}

export const hasLedgerEntry = (hash: string): boolean =>
  store().contains(key(hash))

/** Caches a freshly-parsed (not yet accepted) result. */
export const putParsedResult = (
  hash: string,
  result: NotesImportResult,
  parsedAtMs: number
): void => {
  const existing = getLedgerEntry(hash)
  const entry: NotesImportLedgerEntry = {
    hash,
    result,
    commit: existing?.commit ?? null,
    parsedAt: existing?.parsedAt ?? parsedAtMs,
    acceptedAt: existing?.acceptedAt ?? null,
  }
  store().set(key(hash), JSON.stringify(entry))
}

/** Records the accepted commit (for undo) against an existing parsed entry. */
export const markAccepted = (
  hash: string,
  commit: ImportCommitResult,
  acceptedAtMs: number
): void => {
  const existing = getLedgerEntry(hash)
  if (!existing) return
  store().set(
    key(hash),
    JSON.stringify({ ...existing, commit, acceptedAt: acceptedAtMs })
  )
}

/**
 * Clears the accepted-commit record (after an undo) but keeps the cached
 * result.
 */
export const clearAccepted = (hash: string): void => {
  const existing = getLedgerEntry(hash)
  if (!existing) return
  store().set(
    key(hash),
    JSON.stringify({ ...existing, commit: null, acceptedAt: null })
  )
}
