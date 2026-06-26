import { create } from 'zustand'
import * as Sentry from '@sentry/react-native'
import { logger } from '@/lib/logger'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import useCategories from '@/stores/categories'
import {
  writeMappedDataToStores,
  undoImport,
  type PublisherImportMode,
} from '@/lib/import/writeMappedData'
import {
  runNotesImportStreaming,
  resumeNotesImport,
  destroyNotesImport,
  NotesImportClientError,
  type NotesImportErrorCode,
  type NotesImportCredits,
  type ImportStreamEvent,
  type ImportStatus,
  type NotesImportRunHandle,
} from '@/features/notes-import/lib/notesImportClient'
import { notesContentHash } from '@/features/notes-import/lib/notesContentHash'
import { buildNotesImportContext } from '@/features/notes-import/lib/buildNotesImportContext'
import { mapNotesImport } from '@/features/notes-import/lib/mapNotesImport'
import type { MappedWarning } from '@/features/notes-import/lib/mapNotesImport'
import type { PreviewSelection } from '@/features/notes-import/lib/buildNotesImportPreview'
import {
  clientImportCap,
  planImportsToStart,
  prepareNotesImportCommit,
  foldStreamEvent,
  classifyRunOutcome,
  classifyStartRun,
  buildQueueItems,
} from '@/features/notes-import/lib/notesImportManagerLogic'
import {
  getAllLedgerEntries,
  getLedgerEntry,
  beginWorkingEntry,
  setActiveRun,
  appendLedgerHistory,
  putParsedResult,
  markAccepted,
  markViewed as markViewedEntry,
  clearAccepted,
  markStopped,
  deleteLedgerEntry,
  clearCompletedLedgerEntries,
  pruneLedgerEntries,
  type NotesImportLedgerEntry,
} from '@/features/notes-import/lib/notesImportLedger'

/**
 * The multi-import manager (ADR 0009). One store, app-wide, that turns the MMKV
 * ledger into a reactive history list and runs the launch/focus orchestrator:
 * on focus it prunes, hydrates the list, resumes every Working row (reconnect
 * via its persisted `activeRun`, else credit-free re-kickoff from the persisted
 * notesText), and drives the client-side concurrency queue — promoting Queued
 * imports as running slots free.
 *
 * The ledger is the durable source of truth; this store holds only the
 * ephemeral per-run UI state (live phase/reasoning/progress, transient errors)
 * plus the in-memory machinery (abort controllers, the in-flight set, the
 * queue). It replaces the single-import `useNotesImport` on the Settings
 * surface; onboarding keeps its single-shot wizard.
 */

/** Live, ephemeral per-run UI state for a Working import. */
export interface ImportRuntime {
  /** Coarse model phase off the stream (queued/starting/thinking/structuring). */
  phase: ImportStatus | null
  /** Accumulated model reasoning (when emitted), tail-trimmed. Usually empty. */
  reasoning: string
  /** Chars of structured output streamed so far — a "still working" heartbeat. */
  chars: number
  /**
   * Epoch ms the current run attempt began streaming, for the in-flight
   * inference timer. Null until a run starts.
   */
  startedAt: number | null
  /**
   * Approximate tokens processed this run (reasoning + structured-output deltas
   * at ~4 chars/token) — the "it's working" heartbeat shown beside the timer.
   * Counted in every build; only the reasoning TEXT itself is dev-only.
   */
  tokens: number
  /** A run/resume promise is in flight (the import is Running, not just Queued). */
  running: boolean
  /** In-place error within Working (retry in place); null when none. */
  error: NotesImportErrorCode | null
  /**
   * User stopped this run; it stays Working but the queue will NOT auto-start
   * it until an explicit resume/retry. Distinct from `error` (a failure) and
   * from Queued (waiting for a slot). In-memory only — a relaunch resumes it.
   */
  paused: boolean
}

const DEFAULT_RUNTIME: ImportRuntime = {
  phase: null,
  reasoning: '',
  chars: 0,
  startedAt: null,
  tokens: 0,
  running: false,
  error: null,
  paused: false,
}

/** Backoff before re-attempting a run the backend rejected as over its cap. */
const ACTIVE_CAP_COOLDOWN_MS = 4_000

// In-memory machinery, deliberately OUTSIDE the reactive state (not serializable,
// must survive re-renders): abort controllers + the in-flight set are the source
// of truth for "is this import running"; pendingRefinement carries a queued
// refinement into its run; cooldownUntil backs off an `active_cap` race.
const controllers = new Map<string, AbortController>()
const inFlight = new Set<string>()
const pendingRefinement = new Map<
  string,
  { previousResultJSON: string; instruction: string }
>()
const cooldownUntil = new Map<string, number>()

const reconcileMessages = {
  ambiguousContact: (name: string) =>
    i18n.t('notesImport_reconcileAmbiguousContact', { name }),
  ambiguousCategory: (name: string) =>
    i18n.t('notesImport_reconcileAmbiguousCategory', { name }),
}

interface NotesImportManagerState {
  /** History rows, newest first — the list view-model (from the ledger). */
  entries: NotesImportLedgerEntry[]
  /** Live per-import run state, keyed by contentHash. */
  runtimes: Record<string, ImportRuntime>
  /** Ambiguity warnings raised at the last Accept, per import. */
  reconcileWarnings: Record<string, MappedWarning[]>
  /** Latest credit snapshot from a completed run (drives the cap + usage UI). */
  credits: NotesImportCredits | null
  hydrated: boolean

  /** Reload the list from the ledger, dropping runtimes for vanished rows. */
  hydrate: () => void
  /** Launch/focus entry point: prune → hydrate → drive the queue. */
  focus: () => void
  /** Promote/resume Working imports up to the concurrency cap. */
  tick: () => void
  /** Start a new import from pasted notes; returns its contentHash (the row id). */
  submit: (notesText: string) => Promise<string | null>
  /**
   * Refine a Ready import (re-parses the SAME notes). Returns false if not
   * Ready.
   */
  refine: (hash: string, instruction: string) => Promise<boolean>
  /** Accept a Ready import: reconcile against current data, commit, mark Done. */
  accept: (
    hash: string,
    args: { selection: PreviewSelection; publisherMode: PublisherImportMode }
  ) => boolean
  /** Mark a Ready import reviewed (clears its unread dot). No-op otherwise. */
  markViewed: (hash: string) => void
  /** Undo a Done import (deletes exactly what it inserted), back to Ready. */
  undo: (hash: string) => void
  /** Forget an import entirely (per-row delete). */
  remove: (hash: string) => void
  /** "Clear completed" — forget every Done row. */
  clearCompleted: () => void
  /** Cancel a live run; the import stays Working (Queued) and can be retried. */
  cancel: (hash: string) => void
  /**
   * Stop a live run for good: abort + free it server-side and park the row in
   * the terminal `stopped` state. Unlike `cancel` it never resumes (not even on
   * relaunch) and surfaces no resume prompt; the notes stay in the
   * conversation.
   */
  stop: (hash: string) => void
  /** Retry a Working import that errored in place. */
  retry: (hash: string) => void
}

export const useNotesImportManager = create<NotesImportManagerState>(
  (set, get) => {
    const patchRuntime = (hash: string, patch: Partial<ImportRuntime>) => {
      const prev = get().runtimes[hash] ?? DEFAULT_RUNTIME
      set({ runtimes: { ...get().runtimes, [hash]: { ...prev, ...patch } } })
    }

    /** Fold a cosmetic stream event into the import's live runtime. */
    const foldEvent = (hash: string, ev: ImportStreamEvent) => {
      const prev = get().runtimes[hash] ?? DEFAULT_RUNTIME
      const patch = foldStreamEvent(prev, ev, { captureReasoning: __DEV__ })
      // `done`/`error` fold to nothing — skip the write so they don't churn state.
      if (Object.keys(patch).length) patchRuntime(hash, patch)
    }

    /**
     * Drive one import to completion: reconnect to its live run if it has an
     * `activeRun`, otherwise kick off fresh. Idempotent — a no-op if already in
     * flight. On completion the ledger moves to Ready; on a non-cancel error
     * the row stays Working with an in-place error to retry.
     */
    const startRun = (hash: string) => {
      if (inFlight.has(hash)) return
      const entry = getLedgerEntry(hash)
      if (!entry || entry.state !== 'working') return

      // A Working row must have notes to (re)kick off from, or a live run to
      // reconnect to. Guard the (can't-actually-happen) malformed row rather
      // than firing an empty-notes model call.
      if (
        classifyStartRun({
          activeRun: entry.activeRun,
          notesText: entry.notesText,
        }) === 'bad_request'
      ) {
        patchRuntime(hash, { running: false, error: 'bad_request' })
        return
      }

      inFlight.add(hash)
      const controller = new AbortController()
      controllers.set(hash, controller)
      patchRuntime(hash, {
        running: true,
        error: null,
        paused: false,
        phase: entry.activeRun ? null : 'queued',
        // Fresh per-attempt heartbeat for the dev-only timer/token readout.
        startedAt: Date.now(),
        chars: 0,
        tokens: 0,
        reasoning: '',
      })

      const onEvent = (ev: ImportStreamEvent) => foldEvent(hash, ev)
      const onKickoff = (run: NotesImportRunHandle) => {
        setActiveRun(hash, run)
        get().hydrate()
      }
      const context = buildNotesImportContext()
      const refinement = pendingRefinement.get(hash)

      const runPromise = entry.activeRun
        ? resumeNotesImport({
            run: entry.activeRun,
            notesText: entry.notesText,
            context,
            refinement,
            onEvent,
            onKickoff,
            signal: controller.signal,
          })
        : runNotesImportStreaming({
            notesText: entry.notesText,
            context,
            refinement,
            onEvent,
            onKickoff,
            signal: controller.signal,
          })

      runPromise
        .then((res) => {
          pendingRefinement.delete(hash)
          set({ credits: res.credits })
          putParsedResult(hash, res.result, Date.now())
          patchRuntime(hash, { phase: 'done', running: false, error: null })
        })
        .catch((e) => {
          const code = e instanceof NotesImportClientError ? e.code : 'unknown'
          const decision = classifyRunOutcome(
            { aborted: controller.signal.aborted, code },
            { cooldownMs: ACTIVE_CAP_COOLDOWN_MS }
          )
          switch (decision.kind) {
            case 'cancelled':
              // User/teardown cancel: stays Working (Queued), no error surfaced.
              patchRuntime(hash, { running: false, phase: null })
              break
            case 'cooldown':
              // Raced past the backend cap — back off and retry, no error shown.
              cooldownUntil.set(hash, Date.now() + decision.cooldownMs)
              patchRuntime(hash, { running: false, phase: null, error: null })
              setTimeout(() => get().tick(), decision.cooldownMs + 50)
              break
            case 'failed':
              if (decision.report) {
                logger.error('Notes import: run failed', e)
                Sentry.captureException(e)
              }
              if (e instanceof NotesImportClientError && e.debug) {
                logger.error('Notes import HTTP response', e.debug)
              }
              patchRuntime(hash, { running: false, error: decision.code })
              break
          }
        })
        .finally(() => {
          inFlight.delete(hash)
          controllers.delete(hash)
          get().hydrate()
          get().tick()
        })
    }

    return {
      entries: [],
      runtimes: {},
      reconcileWarnings: {},
      credits: null,
      hydrated: false,

      hydrate: () => {
        const entries = getAllLedgerEntries()
        const present = new Set(entries.map((e) => e.hash))
        const prevRuntimes = get().runtimes
        const runtimes: Record<string, ImportRuntime> = {}
        for (const h of Object.keys(prevRuntimes)) {
          if (present.has(h)) runtimes[h] = prevRuntimes[h]
        }
        set({ entries, runtimes, hydrated: true })
      },

      focus: () => {
        pruneLedgerEntries()
        get().hydrate()
        get().tick()
      },

      tick: () => {
        const runtimes = get().runtimes
        const items = buildQueueItems(get().entries, {
          getRuntime: (h) => runtimes[h],
          isInFlight: (h) => inFlight.has(h),
          cooldownUntil: (h) => cooldownUntil.get(h) ?? 0,
          now: Date.now(),
        })
        const cap = clientImportCap(get().credits?.isSupporter ?? false)
        for (const hash of planImportsToStart(items, cap)) startRun(hash)
      },

      submit: async (notesText) => {
        const text = notesText.trim()
        if (!text) return null
        const hash = await notesContentHash(text)
        const existing = getLedgerEntry(hash)
        // Same content already parsed/accepted — surface that row, don't re-run.
        // A Working (resume) or Stopped (re-run from scratch) row falls through.
        if (
          existing &&
          (existing.state === 'ready' || existing.state === 'done')
        )
          return hash
        beginWorkingEntry(hash, {
          notesText: text,
          activeRun: existing?.activeRun ?? null,
          nowMs: Date.now(),
        })
        // A re-submit of a row parked by an error/pause is an explicit restart.
        patchRuntime(hash, { error: null, paused: false })
        get().hydrate()
        get().tick()
        return hash
      },

      refine: async (hash, instruction) => {
        const trimmed = instruction.trim()
        const entry = getLedgerEntry(hash)
        // Only a Ready import can be refined — a Done one must be Undone first,
        // or its committed records would be orphaned by the re-parse (ADR 0009).
        if (!trimmed || !entry?.result || entry.state !== 'ready') {
          return false
        }
        pendingRefinement.set(hash, {
          previousResultJSON: JSON.stringify(entry.result),
          instruction: trimmed,
        })
        // Seal the current turn into the durable thread before re-opening the
        // row: the reply being refined becomes history, then the new refinement
        // bubble sits below it. The next reply streams in as the live `result`.
        const now = Date.now()
        const priorReply = entry.result.assistantMessage?.trim()
        appendLedgerHistory(hash, [
          ...(priorReply
            ? [{ role: 'assistant' as const, text: priorReply, at: now }]
            : []),
          { role: 'user' as const, text: trimmed, at: now },
        ])
        beginWorkingEntry(hash, {
          notesText: entry.notesText,
          activeRun: null,
          nowMs: Date.now(),
        })
        get().hydrate()
        get().tick()
        return true
      },

      accept: (hash, { selection, publisherMode }) => {
        const entry = getLedgerEntry(hash)
        // Only a Ready import is acceptable. Guards a double-accept that would
        // overwrite the original commit record with an (idempotent-skip) empty
        // one, leaving the first accept's inserts un-undoable.
        if (!entry?.result || entry.state !== 'ready') return false
        try {
          const mapped = mapNotesImport(entry.result, {
            contentHash: hash,
            importedAt: new Date(),
          })
          const snapshot = {
            contacts: useContacts.getState().contacts,
            categories: useCategories.getState().categories,
          }
          const { mapped: reconciled, warnings } = prepareNotesImportCommit(
            mapped,
            selection,
            snapshot,
            reconcileMessages
          )
          const commit = writeMappedDataToStores(reconciled, { publisherMode })
          markAccepted(hash, commit, Date.now())
          set({
            reconcileWarnings: { ...get().reconcileWarnings, [hash]: warnings },
          })
          get().hydrate()
          return true
        } catch (e) {
          logger.error('Notes import: accept failed', e)
          Sentry.captureException(e)
          return false
        }
      },

      markViewed: (hash) => {
        // Opening a Ready import counts as reviewing it; clear its unread dot.
        // No-op (no re-hydrate) when the row is missing, already viewed, or not
        // Ready, so this is cheap to call on every composer render.
        if (markViewedEntry(hash)) get().hydrate()
      },

      undo: (hash) => {
        const entry = getLedgerEntry(hash)
        if (!entry?.commit) return
        try {
          undoImport(entry.commit)
          clearAccepted(hash)
          set({
            reconcileWarnings: { ...get().reconcileWarnings, [hash]: [] },
          })
          get().hydrate()
        } catch (e) {
          logger.error('Notes import: undo failed', e)
          Sentry.captureException(e)
        }
      },

      remove: (hash) => {
        // Forgetting an import that still has a live server run tears that run
        // down entirely server-side: it aborts the run (so it stops spending
        // tokens and — credit only charged on success — is never billed) AND
        // wipes its DO now instead of leaving it to self-evict. Fire-and-forget;
        // the abort below unwinds the local stream regardless. (This also backs
        // "edit & resend": forget the old run for free, then submit the edit.)
        const activeRun = getLedgerEntry(hash)?.activeRun
        if (activeRun) void destroyNotesImport(activeRun)
        controllers.get(hash)?.abort()
        controllers.delete(hash)
        inFlight.delete(hash)
        pendingRefinement.delete(hash)
        cooldownUntil.delete(hash)
        deleteLedgerEntry(hash)
        get().hydrate()
      },

      clearCompleted: () => {
        clearCompletedLedgerEntries()
        get().hydrate()
      },

      cancel: (hash) => {
        // Park it first so the run's finally→tick won't immediately restart it;
        // the abort then unwinds the in-flight stream. Resume via retry().
        patchRuntime(hash, { paused: true })
        controllers.get(hash)?.abort()
      },

      stop: (hash) => {
        // A true stop, not a pause. Move the row to the terminal `stopped` state
        // FIRST so neither the run's finally→tick nor a later relaunch ever
        // restarts it (a Working row resumes; `paused` is in-memory only). Then
        // tear the run down: abort the local stream and — credit is only charged
        // on success — destroy the server run for free. The notes stay in the
        // conversation so the user can edit, re-send, or just move on.
        const activeRun = getLedgerEntry(hash)?.activeRun
        markStopped(hash)
        if (activeRun) void destroyNotesImport(activeRun)
        controllers.get(hash)?.abort()
        controllers.delete(hash)
        inFlight.delete(hash)
        pendingRefinement.delete(hash)
        cooldownUntil.delete(hash)
        get().hydrate()
      },

      retry: (hash) => {
        cooldownUntil.delete(hash)
        patchRuntime(hash, { error: null, paused: false })
        get().tick()
      },
    }
  }
)
