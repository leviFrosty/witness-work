import { MMKV } from 'react-native-mmkv'
import type { ImportCommitResult } from '@/lib/import/writeMappedData'
import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'

/**
 * Client-only Import ledger (ADR 0008/0009). Keyed by content hash, it is the
 * SOURCE OF TRUTH for the on-device import history list and for resume: one row
 * per notes batch (`contentHash`), carrying its lifecycle `state`, the original
 * `notesText`, the model's parsed `result`, and the exact records a commit
 * inserted. That lets the app:
 *
 * - List + restore every import across app restarts (history),
 * - Resume a Working import after a dropped/backgrounded connection (reconnect
 *   via the persisted `activeRun`, else credit-free re-kickoff from
 *   `notesText`),
 * - Refine an old import (a Refinement re-reads the original `notesText`),
 * - Replay a re-import without paying for another model call, and
 * - Undo an accepted import precisely (delete exactly what it inserted).
 *
 * It holds notes-derived data only on THIS device — the proxy persists nothing
 * (ADR 0008). A reinstall loses it; hash-derived ids keep re-commits
 * dupe-safe.
 *
 * A Refinement folds into the same row (same `contentHash`); `activeRun` is the
 * internal run handle, persisted only while an import is **Working** so the
 * client can reconnect, and cleared the moment it goes Ready/Done.
 */

/**
 * User-facing lifecycle of an import (CONTEXT.md). `working` covers the
 * Queued/Running sub-states and in-place errors; `ready` = a result exists but
 * has not been accepted; `done` = accepted (committed); `stopped` = the user
 * stopped the run before it produced a result — a terminal, non-resuming state
 * (unlike a paused Working row, a `stopped` row is never auto-restarted, not
 * even on relaunch) that keeps the original notes in history.
 */
export type NotesImportState = 'working' | 'ready' | 'done' | 'stopped'

/**
 * The live run handle for the current background model execution, persisted
 * only while an import is **Working** so the client can reconnect to its SSE
 * stream. Meaningless (and cleared) once the import is Ready/Done.
 */
export interface NotesImportActiveRun {
  importId: string
  subscribeToken: string
}

/**
 * One finalized message in an import's conversation thread: a refinement the
 * user sent (`user`) or a reply WWork AI gave (`assistant`). The original notes
 * (round-0 user message) and the live current reply are NOT stored here — they
 * render from `notesText` and `result`. See `history` below.
 */
export interface NotesImportChatMessage {
  role: 'user' | 'assistant'
  text: string
  /** Epoch ms the message was finalized. */
  at: number
}

export interface NotesImportLedgerEntry {
  hash: string
  /** Lifecycle state. The list renders this, not the backend run status. */
  state: NotesImportState
  /** Original notes — enables refine-from-history + credit-free re-kickoff. */
  notesText: string
  /** First non-empty line of the notes (~60 chars), the row title while Working. */
  provisionalTitle: string
  /** The model's full structured output; null while Working with no result yet. */
  result: NotesImportResult | null
  /**
   * Finalized conversation messages preceding the live result, oldest first:
   * every superseded AI reply and every refinement instruction. Excludes the
   * original notes (round-0 user message — renders from `notesText`) and the
   * current live reply (renders from `result`), so the invariant is that this
   * alternates assistant→user→…, starting with an assistant reply and (once a
   * refinement is in flight or applied) ending with a user instruction. Lets
   * the thread show the full back-and-forth instead of just the latest turn.
   */
  history: NotesImportChatMessage[]
  /**
   * ≤5-word model summary — the row title once Ready (falls back to
   * provisional).
   */
  summary: string
  /** What the accepted commit inserted, for undo. Null until accepted. */
  commit: ImportCommitResult | null
  /** The live run handle while Working; null when Ready/Done. */
  activeRun: NotesImportActiveRun | null
  /** Epoch ms the import was first created (first kickoff). */
  createdAt: number
  /** Epoch ms the result was last cached (parse/refine); null until a result. */
  parsedAt: number | null
  /**
   * Epoch ms the Ready result was last opened/reviewed; null until viewed. The
   * unread blue dot shows while a Ready row has never been viewed OR its
   * `parsedAt` is newer than this — so a refinement's re-parse re-arms the
   * dot.
   */
  viewedAt: number | null
  /** Epoch ms the import was accepted (committed), if it has been. */
  acceptedAt: number | null
  /** Epoch ms of the last mutation — drives list sort + the >1yr prune. */
  updatedAt: number
}

/** Rows older than this (by `updatedAt`) are auto-pruned on launch (ADR 0009). */
export const LEDGER_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

const PROVISIONAL_TITLE_MAX = 60

// --- Pure helpers (no I/O — unit-tested directly) ----------------------

/** The first non-empty, trimmed line of the notes, truncated for a row title. */
export const provisionalTitleFromNotes = (text: string): string => {
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    return t.length > PROVISIONAL_TITLE_MAX
      ? `${t.slice(0, PROVISIONAL_TITLE_MAX - 1).trimEnd()}…`
      : t
  }
  return ''
}

/**
 * The row title for an import: the model `summary` once a result exists and the
 * import is past Working, otherwise the provisional first-line title. Returns
 * '' when neither is known (caller falls back to the deterministic counts
 * line).
 */
export const ledgerEntryTitle = (entry: NotesImportLedgerEntry): string => {
  const summary = entry.summary.trim()
  if (entry.state !== 'working' && summary) return summary
  return entry.provisionalTitle || summary
}

/** How many imports are parsed and awaiting review (drives the "ready" badge). */
export const readyImportCount = (entries: NotesImportLedgerEntry[]): number =>
  entries.filter((entry) => entry.state === 'ready').length

/**
 * True when a Ready import carries a result the user hasn't opened yet — the
 * unread state that drives the blue dot. A refinement re-parses into a newer
 * `parsedAt`, which re-arms the dot even on a row viewed in a prior round.
 */
export const isUnviewedReady = (entry: NotesImportLedgerEntry): boolean =>
  entry.state === 'ready' &&
  (entry.viewedAt == null ||
    (entry.parsedAt != null && entry.viewedAt < entry.parsedAt))

/** How many Ready imports still have an unseen result (drives the blue dot). */
export const unviewedReadyImportCount = (
  entries: NotesImportLedgerEntry[]
): number => entries.filter(isUnviewedReady).length

const isActiveRun = (v: unknown): v is NotesImportActiveRun =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as NotesImportActiveRun).importId === 'string' &&
  typeof (v as NotesImportActiveRun).subscribeToken === 'string'

/** Keeps only well-formed messages; pre-history rows (no array) become []. */
const sanitizeHistory = (raw: unknown): NotesImportChatMessage[] => {
  if (!Array.isArray(raw)) return []
  const out: NotesImportChatMessage[] = []
  for (const m of raw) {
    if (typeof m !== 'object' || m === null) continue
    const { role, text, at } = m as Partial<NotesImportChatMessage>
    if ((role === 'user' || role === 'assistant') && typeof text === 'string') {
      out.push({ role, text, at: typeof at === 'number' ? at : 0 })
    }
  }
  return out
}

/**
 * Normalizes a persisted record (current OR pre-history v1 shape) into a
 * complete {@link NotesImportLedgerEntry}, filling every field with a sound
 * default. Pre-history rows (no `state`/`notesText`) are derived: a row with a
 * commit/`acceptedAt` is Done, one with a result is Ready, otherwise Working.
 * Returns null for an unusable record. Does NOT revive `commit` Date fields —
 * the I/O read path does that.
 */
export const migrateLedgerEntry = (
  raw: unknown,
  nowMs: number
): NotesImportLedgerEntry | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Partial<NotesImportLedgerEntry>
  if (typeof o.hash !== 'string') return null

  const result = (o.result ?? null) as NotesImportResult | null
  const commit = (o.commit ?? null) as ImportCommitResult | null
  const createdAt =
    typeof o.createdAt === 'number'
      ? o.createdAt
      : typeof o.parsedAt === 'number'
        ? o.parsedAt
        : nowMs
  const parsedAt =
    typeof o.parsedAt === 'number' ? o.parsedAt : result ? createdAt : null
  // Pre-`viewedAt` rows default to null = unviewed, so any existing Ready import
  // still surfaces its unread dot until the user opens it under the new flow.
  const viewedAt = typeof o.viewedAt === 'number' ? o.viewedAt : null
  const acceptedAt = typeof o.acceptedAt === 'number' ? o.acceptedAt : null
  const state: NotesImportState =
    o.state === 'working' ||
    o.state === 'ready' ||
    o.state === 'done' ||
    o.state === 'stopped'
      ? o.state
      : acceptedAt != null || commit
        ? 'done'
        : result
          ? 'ready'
          : 'working'
  const notesText = typeof o.notesText === 'string' ? o.notesText : ''
  const summary =
    typeof o.summary === 'string' ? o.summary : (result?.summary ?? '')
  const provisionalTitle =
    typeof o.provisionalTitle === 'string' && o.provisionalTitle
      ? o.provisionalTitle
      : provisionalTitleFromNotes(notesText)
  // A live run handle is meaningful only while Working — drop a stray one left
  // on a Ready/Done row by a crash or a hand-edited record.
  const activeRun =
    state === 'working' && isActiveRun(o.activeRun) ? o.activeRun : null
  const updatedAt =
    typeof o.updatedAt === 'number'
      ? o.updatedAt
      : (acceptedAt ?? parsedAt ?? createdAt)

  return {
    hash: o.hash,
    state,
    notesText,
    provisionalTitle,
    result,
    history: sanitizeHistory(o.history),
    summary,
    commit,
    activeRun,
    createdAt,
    parsedAt,
    viewedAt,
    acceptedAt,
    updatedAt,
  }
}

/** True when a row is old enough to auto-prune (ADR 0009: >1yr by updatedAt). */
export const isPrunableLedgerEntry = (
  entry: NotesImportLedgerEntry,
  nowMs: number,
  maxAgeMs: number = LEDGER_MAX_AGE_MS
): boolean => nowMs - entry.updatedAt > maxAgeMs

// --- Pure lifecycle transitions (Working → Ready → Done; no I/O) --------
// Each returns the NEXT entry from the current one (or null where the legacy
// path creates a fresh row), encoding the state-machine invariants the I/O
// layer used to inline. No MMKV, no Date.now() — callers pass the timestamp.

/**
 * Working transition: create (existing === null) or re-open a row as
 * **Working**. On an existing row (Refinement / re-kickoff resume) it flips
 * back to Working and refreshes notesText/provisionalTitle/activeRun/updatedAt
 * while PRESERVING the cached `result`, `summary`, `history`, `commit`,
 * `acceptedAt`, `parsedAt`, and the original `createdAt`.
 */
export const beginWorkingTransition = (
  existing: NotesImportLedgerEntry | null,
  args: {
    notesText: string
    activeRun: NotesImportActiveRun | null
    nowMs: number
  }
): NotesImportLedgerEntry => {
  const notesText = args.notesText || existing?.notesText || ''
  return {
    hash: existing?.hash ?? '',
    state: 'working',
    notesText,
    provisionalTitle:
      provisionalTitleFromNotes(notesText) || existing?.provisionalTitle || '',
    result: existing?.result ?? null,
    // A refinement folds into the same row; its conversation thread carries over.
    history: existing?.history ?? [],
    summary: existing?.summary ?? '',
    commit: existing?.commit ?? null,
    activeRun: args.activeRun,
    createdAt: existing?.createdAt ?? args.nowMs,
    parsedAt: existing?.parsedAt ?? null,
    // Carry the prior view stamp; if this Working run re-parses, the newer
    // parsedAt out-dates it and the unread dot re-arms (see isUnviewedReady).
    viewedAt: existing?.viewedAt ?? null,
    acceptedAt: existing?.acceptedAt ?? null,
    updatedAt: args.nowMs,
  }
}

/**
 * Ready transition: cache a freshly-parsed result and move to **Ready**. Clears
 * `activeRun` (slot released) and forces `commit`/`acceptedAt` null (Ready ⟹
 * unaccepted). Summary comes from `result.summary ?? existing.summary`. Creates
 * the row when existing === null (legacy single-shot path).
 */
export const putParsedTransition = (
  existing: NotesImportLedgerEntry | null,
  result: NotesImportResult,
  parsedAtMs: number
): NotesImportLedgerEntry => ({
  hash: existing?.hash ?? '',
  state: 'ready',
  notesText: existing?.notesText ?? '',
  provisionalTitle: existing?.provisionalTitle ?? '',
  result,
  // The prior turns persist; only the live `result` advances to the new reply.
  history: existing?.history ?? [],
  summary: result.summary ?? existing?.summary ?? '',
  // Ready ⟹ unaccepted: a freshly-parsed result has no commit. (The refine
  // guard already forbids re-parsing a Done row, so this only ever clears an
  // already-null commit, but it keeps the invariant local + total.)
  commit: null,
  activeRun: null,
  createdAt: existing?.createdAt ?? parsedAtMs,
  parsedAt: parsedAtMs,
  // A freshly-parsed result is unread: the new parsedAt out-dates any prior
  // view stamp, so isUnviewedReady re-arms the dot until it's opened again.
  viewedAt: existing?.viewedAt ?? null,
  acceptedAt: null,
  updatedAt: parsedAtMs,
})

/** Done transition: record the accepted commit (for undo) and move to **Done**. */
export const markAcceptedTransition = (
  existing: NotesImportLedgerEntry,
  commit: ImportCommitResult,
  acceptedAtMs: number
): NotesImportLedgerEntry => ({
  ...existing,
  state: 'done',
  commit,
  acceptedAt: acceptedAtMs,
  updatedAt: acceptedAtMs,
})

/**
 * Stop transition: park a still-**Working** row in the terminal **stopped**
 * state. Drops the live `activeRun` (its run is being torn down) and keeps
 * everything else — notably `notesText`/`history`, so the conversation stays in
 * the list. A no-op (returns the same reference) once the row already has a
 * result, so a stop racing the final parse can't clobber a Ready/Done row.
 */
export const stoppedTransition = (
  existing: NotesImportLedgerEntry,
  nowMs: number
): NotesImportLedgerEntry =>
  existing.state === 'working'
    ? { ...existing, state: 'stopped', activeRun: null, updatedAt: nowMs }
    : existing

/** Undo transition: clear the accepted-commit record, return to **Ready**. */
export const clearAcceptedTransition = (
  existing: NotesImportLedgerEntry,
  nowMs: number
): NotesImportLedgerEntry => ({
  ...existing,
  state: 'ready',
  commit: null,
  acceptedAt: null,
  updatedAt: nowMs,
})

/**
 * Viewed transition: stamp `viewedAt` so a Ready row's unread blue dot clears.
 * Returns the SAME reference unchanged when the row isn't an unviewed-Ready
 * one, so the caller can skip a needless write (and the re-render it would
 * trigger).
 */
export const markViewedTransition = (
  existing: NotesImportLedgerEntry,
  nowMs: number
): NotesImportLedgerEntry =>
  isUnviewedReady(existing)
    ? { ...existing, viewedAt: nowMs, updatedAt: nowMs }
    : existing

/** Run-handle transition: set `activeRun` + `updatedAt`, nothing else. */
export const setActiveRunTransition = (
  existing: NotesImportLedgerEntry,
  activeRun: NotesImportActiveRun | null,
  nowMs: number
): NotesImportLedgerEntry => ({ ...existing, activeRun, updatedAt: nowMs })

// --- MMKV-backed store (thin I/O over the pure helpers) ----------------

// Lazy MMKV so importing this module doesn't construct native storage (keeps it
// out of the way of node-based unit tests that never touch the ledger).
let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'notes-import-ledger' }))

const KEY_PREFIX = 'entry:'
const key = (hash: string) => `${KEY_PREFIX}${hash}`

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

const reviveEntry = (
  entry: NotesImportLedgerEntry
): NotesImportLedgerEntry => ({ ...entry, commit: reviveCommit(entry.commit) })

const writeEntry = (entry: NotesImportLedgerEntry): void => {
  store().set(key(entry.hash), JSON.stringify(entry))
}

export const getLedgerEntry = (hash: string): NotesImportLedgerEntry | null => {
  const raw = store().getString(key(hash))
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const entry = migrateLedgerEntry(parsed, Date.now())
  return entry ? reviveEntry(entry) : null
}

export const hasLedgerEntry = (hash: string): boolean =>
  store().contains(key(hash))

/**
 * Every import in the ledger, newest first (by creation). The history list
 * reads this; it is the only way to enumerate rows, since entries are otherwise
 * addressable only by their exact content hash.
 */
export const getAllLedgerEntries = (): NotesImportLedgerEntry[] => {
  const now = Date.now()
  const entries: NotesImportLedgerEntry[] = []
  for (const k of store().getAllKeys()) {
    if (!k.startsWith(KEY_PREFIX)) continue
    const raw = store().getString(k)
    if (!raw) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    const entry = migrateLedgerEntry(parsed, now)
    if (entry) entries.push(reviveEntry(entry))
  }
  return entries.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Creates (or re-opens) a **Working** row at kickoff: persists the source
 * `notesText` and the live `activeRun` so the import can be listed and resumed.
 * On an existing row (a Refinement, or a re-kickoff resume) it flips back to
 * Working and refreshes the run handle while preserving the cached result, the
 * accept/commit history, and the original `createdAt`.
 */
export const beginWorkingEntry = (
  hash: string,
  args: {
    notesText: string
    activeRun: NotesImportActiveRun | null
    nowMs: number
  }
): NotesImportLedgerEntry => {
  const existing = getLedgerEntry(hash)
  const entry: NotesImportLedgerEntry = {
    ...beginWorkingTransition(existing, args),
    hash,
  }
  writeEntry(entry)
  return entry
}

/** Records the live run handle on a Working row (e.g. after a re-kickoff). */
export const setActiveRun = (
  hash: string,
  activeRun: NotesImportActiveRun | null,
  nowMs: number = Date.now()
): void => {
  const existing = getLedgerEntry(hash)
  if (!existing) return
  writeEntry(setActiveRunTransition(existing, activeRun, nowMs))
}

/**
 * Appends finalized conversation messages (typically a now-superseded AI reply
 * followed by the user's new refinement) to a row's `history`, preserving
 * everything else. No-op if the row is gone. Call this BEFORE re-opening the
 * row as Working so the thread is in place while the next reply streams.
 */
export const appendLedgerHistory = (
  hash: string,
  messages: NotesImportChatMessage[],
  nowMs: number = Date.now()
): void => {
  if (messages.length === 0) return
  const existing = getLedgerEntry(hash)
  if (!existing) return
  writeEntry({
    ...existing,
    history: [...existing.history, ...messages],
    updatedAt: nowMs,
  })
}

/**
 * Caches a freshly-parsed (not yet accepted) result and moves the row to
 * **Ready** — the run finished, so the live run handle is cleared (its
 * concurrency slot is already released server-side). Creates the row if missing
 * (legacy single-shot path that never opened a Working row).
 */
export const putParsedResult = (
  hash: string,
  result: NotesImportResult,
  parsedAtMs: number
): void => {
  const existing = getLedgerEntry(hash)
  writeEntry({ ...putParsedTransition(existing, result, parsedAtMs), hash })
}

/** Records the accepted commit (for undo) and moves the row to **Done**. */
export const markAccepted = (
  hash: string,
  commit: ImportCommitResult,
  acceptedAtMs: number
): void => {
  const existing = getLedgerEntry(hash)
  if (!existing) return
  writeEntry(markAcceptedTransition(existing, commit, acceptedAtMs))
}

/**
 * Clears the accepted-commit record (after an Undo) and returns the row to
 * **Ready**, keeping the cached result.
 */
export const clearAccepted = (
  hash: string,
  nowMs: number = Date.now()
): void => {
  const existing = getLedgerEntry(hash)
  if (!existing) return
  writeEntry(clearAcceptedTransition(existing, nowMs))
}

/**
 * Stamps a Ready row as viewed so its unread blue dot clears. Returns whether
 * anything changed: false for a missing, already-viewed, or non-Ready row, so
 * the caller only re-hydrates when a write actually happened.
 */
export const markViewed = (
  hash: string,
  nowMs: number = Date.now()
): boolean => {
  const existing = getLedgerEntry(hash)
  if (!existing) return false
  const next = markViewedTransition(existing, nowMs)
  if (next === existing) return false
  writeEntry(next)
  return true
}

/**
 * Stops a still-Working row: moves it to the terminal **stopped** state and
 * clears its run handle. No-op if the row is gone or already has a result.
 */
export const markStopped = (hash: string, nowMs: number = Date.now()): void => {
  const existing = getLedgerEntry(hash)
  if (!existing) return
  const next = stoppedTransition(existing, nowMs)
  if (next !== existing) writeEntry(next)
}

/** Forgets an import entirely (per-row delete). Does NOT touch committed data. */
export const deleteLedgerEntry = (hash: string): void => {
  store().delete(key(hash))
}

/**
 * Removes every **Done** row ("Clear completed"). Returns how many were
 * removed.
 */
export const clearCompletedLedgerEntries = (): number => {
  let removed = 0
  for (const entry of getAllLedgerEntries()) {
    if (entry.state === 'done') {
      store().delete(key(entry.hash))
      removed += 1
    }
  }
  return removed
}

/** Auto-prunes rows older than {@link LEDGER_MAX_AGE_MS}. Returns the count. */
export const pruneLedgerEntries = (
  nowMs: number = Date.now(),
  maxAgeMs: number = LEDGER_MAX_AGE_MS
): number => {
  let removed = 0
  for (const entry of getAllLedgerEntries()) {
    if (isPrunableLedgerEntry(entry, nowMs, maxAgeMs)) {
      store().delete(key(entry.hash))
      removed += 1
    }
  }
  return removed
}
