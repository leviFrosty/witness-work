import {
  selectMappedImport,
  type PreviewSelection,
} from '@/features/notes-import/lib/buildNotesImportPreview'
import type { MappedNotesImport } from '@/features/notes-import/lib/mapNotesImport'
import {
  reconcileMappedImport,
  type ReconcileSnapshot,
  type ReconcileMessages,
  type ReconcileResult,
} from '@/features/notes-import/lib/reconcileMappedImport'
import type {
  ImportStreamEvent,
  NotesImportErrorCode,
  NotesImportRunHandle,
} from '@/features/notes-import/lib/notesImportClient'
// Type-only — erased at runtime, so it introduces no import cycle even though
// the hook imports this module's values. Keeps `ImportRuntime` canonical.
import type { ImportRuntime } from '@/features/notes-import/hooks/useNotesImportManager'

/**
 * Pure decision logic for the multi-import manager store (ADR 0009). Kept out
 * of the store/React layer so it is unit-testable in plain node (vitest)
 * without `react-native-mmkv` or zustand.
 */

/**
 * Client-side concurrency cap — mirrors the proxy's per-identity active-run cap
 * (`activeImportCap` 2 / `activeImportCapSupporter` 5). The queue starts at
 * most this many runs concurrently; the backend still enforces its own cap, and
 * a kickoff that races past it (`active_cap`) simply stays Queued and retries.
 */
export const FREE_IMPORT_CAP = 2
export const SUPPORTER_IMPORT_CAP = 5

export const clientImportCap = (isSupporter: boolean): number =>
  isSupporter ? SUPPORTER_IMPORT_CAP : FREE_IMPORT_CAP

export interface QueuePlanItem {
  hash: string
  /** Ledger state is Working (queued or running). */
  isWorking: boolean
  /** A run/resume promise is in flight in memory for this import. */
  isRunning: boolean
  /** Import creation time — FIFO order for promotion. */
  createdAt: number
}

/** How many imports currently hold a concurrency slot (a live run). */
export const countRunning = (items: QueuePlanItem[]): number =>
  items.reduce((n, i) => (i.isRunning ? n + 1 : n), 0)

/**
 * Which Queued imports should start now: the oldest Working-but-not-running
 * rows, up to the free concurrency slots (cap − currently running). A Ready
 * import has already released its slot, so a pile of unreviewed Ready imports
 * never blocks new ones. Returns hashes in promotion (FIFO) order.
 */
export const planImportsToStart = (
  items: QueuePlanItem[],
  cap: number
): string[] => {
  const slots = Math.max(0, cap - countRunning(items))
  if (slots === 0) return []
  return items
    .filter((i) => i.isWorking && !i.isRunning)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, slots)
    .map((i) => i.hash)
}

/**
 * Whether a Working import is showing as **Running** (live model run) or
 * **Queued** (waiting client-side for a slot) — the two Working sub-labels.
 */
export const workingSubLabel = (isRunning: boolean): 'running' | 'queued' =>
  isRunning ? 'running' : 'queued'

/**
 * Prepares an Accept: project the mapped import down to the selected rows, then
 * Reconcile against the user's CURRENT local data (ADR 0010) so an earlier
 * import's records aren't duplicated. Pure — the snapshot is passed in and the
 * actual store writes happen in the manager. Returns the re-pointed
 * {@link MappedImport} plus any ambiguity warnings to surface.
 */
export const prepareNotesImportCommit = (
  mapped: MappedNotesImport,
  selection: PreviewSelection,
  snapshot: ReconcileSnapshot,
  messages?: ReconcileMessages
): ReconcileResult =>
  reconcileMappedImport(
    selectMappedImport(mapped, selection),
    snapshot,
    messages
  )

// --- Run lifecycle decisions (extracted from the manager store) ---------------

/** Tail length the (dev-only) reasoning text is trimmed to. */
export const REASONING_TAIL = 2_000
/** Rough chars→tokens for the in-flight inference heartbeat (~4 chars/token). */
export const approxTokens = (charCount: number): number =>
  Math.ceil(charCount / 4)

/**
 * Pure reduction of a cosmetic stream event into a runtime patch. The token
 * COUNT always climbs so the in-flight readout shows live activity; the
 * reasoning TEXT itself (the model's chain of thought) is folded in only when
 * `captureReasoning` is set (dev only — never surfaced to end users). `done` /
 * `error` are handled by the run promise, not as progress, so they patch
 * nothing (an empty object — the store skips the write).
 */
export const foldStreamEvent = (
  runtime: Pick<ImportRuntime, 'reasoning' | 'chars' | 'tokens'>,
  ev: ImportStreamEvent,
  opts: { captureReasoning: boolean }
): Partial<ImportRuntime> => {
  switch (ev.type) {
    case 'status':
      return { phase: ev.status }
    case 'reasoning':
      return {
        tokens: runtime.tokens + approxTokens(ev.text.length),
        ...(opts.captureReasoning
          ? { reasoning: (runtime.reasoning + ev.text).slice(-REASONING_TAIL) }
          : null),
      }
    case 'progress':
      // Roll the structured-output delta into the token heartbeat so it keeps
      // climbing once the model shifts from reasoning to structuring.
      return {
        chars: ev.chars,
        tokens:
          runtime.tokens + approxTokens(Math.max(0, ev.chars - runtime.chars)),
      }
    default:
      return {}
  }
}

/** What the store should do when a run promise rejects. */
export type RunOutcomeDecision =
  | { kind: 'cancelled' }
  | { kind: 'cooldown'; cooldownMs: number }
  | { kind: 'failed'; code: NotesImportErrorCode; report: boolean }

/**
 * Classify a failed run. An aborted run was a user/teardown cancel (stays
 * Queued, no error). `active_cap` raced the backend cap — back off and retry.
 * Anything else is a surfaced failure; `unknown`/`model_error` additionally get
 * logged + reported (the store performs the actual Sentry/setTimeout/patch).
 */
export const classifyRunOutcome = (
  args: { aborted: boolean; code: NotesImportErrorCode },
  opts: { cooldownMs: number }
): RunOutcomeDecision => {
  if (args.aborted) return { kind: 'cancelled' }
  if (args.code === 'active_cap')
    return { kind: 'cooldown', cooldownMs: opts.cooldownMs }
  const report = args.code === 'unknown' || args.code === 'model_error'
  return { kind: 'failed', code: args.code, report }
}

/**
 * Classify how a Working row should be (re)started: reconnect to its live run
 * if it has one, else kick off fresh from its notes, else it's a malformed row
 * (no run AND no notes) the store treats as `bad_request`.
 */
export const classifyStartRun = (entry: {
  activeRun: NotesImportRunHandle | null
  notesText: string
}): 'reconnect' | 'kickoff' | 'bad_request' => {
  if (entry.activeRun) return 'reconnect'
  if (entry.notesText.trim()) return 'kickoff'
  return 'bad_request'
}

/**
 * Build the queue plan from the ledger rows plus the store's in-memory views
 * (runtimes, the in-flight set, the cooldown map, `now`). Pure over the passed
 * accessors — Date.now() and the Maps stay in the store. A row still in its
 * `active_cap` cooldown is filtered out; a Working row parked by an in-place
 * error or a user pause is not "working" for promotion purposes (only an
 * explicit retry restarts it).
 */
export const buildQueueItems = (
  entries: ReadonlyArray<{ hash: string; state: string; createdAt: number }>,
  opts: {
    getRuntime: (
      hash: string
    ) => { error?: NotesImportErrorCode | null; paused?: boolean } | undefined
    isInFlight: (hash: string) => boolean
    cooldownUntil: (hash: string) => number
    now: number
  }
): QueuePlanItem[] =>
  entries
    .filter((e) => opts.cooldownUntil(e.hash) <= opts.now)
    .map((e) => {
      const rt = opts.getRuntime(e.hash)
      return {
        hash: e.hash,
        isWorking: e.state === 'working' && !rt?.error && !rt?.paused,
        isRunning: opts.isInFlight(e.hash),
        createdAt: e.createdAt,
      }
    })
