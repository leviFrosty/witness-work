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
  type NotesImportCredits,
  type ImportStreamEvent,
  type NotesImportRunHandle,
} from '@/features/notes-import/lib/notesImportClient'
import {
  loadPersistedCredits,
  persistCredits,
} from '@/features/notes-import/lib/notesImportCreditsStore'
import {
  notesImportCreditsForHash,
  type NotesImportRefinementsByHash,
} from '@/features/notes-import/lib/notesImportUsage'
import { notesContentHash } from '@/features/notes-import/lib/notesContentHash'
import { buildNotesImportContext } from '@/features/notes-import/lib/buildNotesImportContext'
import { mapNotesImport } from '@/features/notes-import/lib/mapNotesImport'
import type { MappedWarning } from '@/features/notes-import/lib/mapNotesImport'
import type { PreviewSelection } from '@/features/notes-import/lib/buildNotesImportPreview'
import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'
import {
  clientImportCap,
  planImportsToStart,
  prepareNotesImportCommit,
  foldStreamEvent,
  classifyRunOutcome,
  classifyStartRun,
  buildQueueItems,
  decideCreditsUpdate,
  type CreditsProvenance,
  type CreditsUpdateSource,
  type ImportRuntime,
} from '@/features/notes-import/lib/notesImportManagerLogic'
import {
  getAllLedgerEntries,
  getLedgerEntry,
  beginWorkingEntry,
  setActiveRun,
  appendLedgerHistory,
  replaceLedgerHistory,
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

/**
 * A valid empty parse, used as the refinement baseline when a live FIRST parse
 * is interrupted before it ever produced a result — the typed instruction then
 * layers onto an empty result (a baseline the refine path already supports)
 * instead of being lost.
 */
const EMPTY_PARSE_RESULT: NotesImportResult = {
  contacts: [],
  visits: [],
  timeEntries: [],
  categories: [],
  publisher: null,
  warnings: [],
  summary: '',
  assistantMessage: '',
}

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
  /** Latest global import-allowance display snapshot. */
  credits: NotesImportCredits | null
  /** Whether global display came from kickoff or persisted server authority. */
  creditsProvenance: CreditsProvenance | null
  /** Hash that owns the current global kickoff projection, if any. */
  creditsKickoffHash: string | null
  /** Last terminal/denial/persisted authority; never replaced by kickoff. */
  authoritativeCredits: NotesImportCredits | null
  /** Display refinement allowance keyed by source-text content hash. */
  refinementCredits: NotesImportRefinementsByHash
  /** Per-hash display provenance, parallel to {@link refinementCredits}. */
  refinementCreditsProvenance: Record<string, CreditsProvenance>
  /** Durable per-hash refinement authority. */
  authoritativeRefinementCredits: NotesImportRefinementsByHash
  hydrated: boolean

  /**
   * Complete display snapshot for one import, or null when hash state is
   * unknown.
   */
  creditsForImport: (hash: string) => NotesImportCredits | null
  /** AppState lifecycle seam: normalize rollover, re-arm stale denials, tick. */
  appBecameActive: () => void
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
  /**
   * Interrupt a live (thinking) run and re-send the typed text as a fresh
   * refinement: tears the in-flight run down (freeing it server-side), seals
   * the interrupted turn into the conversation thread, and re-opens the SAME
   * row as Working with the new instruction queued. Returns false if the run
   * already settled (raced to Ready/Done) so the caller can fall back to a
   * plain refine.
   */
  interruptAndRefine: (hash: string, instruction: string) => Promise<boolean>
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

    const persistAuthority = (
      credits: NotesImportCredits | null,
      refinementsByHash: NotesImportRefinementsByHash
    ) => {
      if (credits) persistCredits({ credits, refinementsByHash })
    }

    /** Apply a hash-bound network snapshot (kickoff, terminal, or denial). */
    const applyCredits = (
      hash: string,
      incoming: unknown,
      source: Extract<CreditsUpdateSource, 'kickoff' | 'terminal' | 'denial'>
    ) => {
      const state = get()
      const decision = decideCreditsUpdate({
        current: state.credits,
        currentProvenance: state.creditsProvenance,
        authoritative: state.authoritativeCredits,
        incoming,
        source,
        now: Date.now(),
      })
      const acceptedIncoming =
        source === 'kickoff'
          ? decision.provenance === 'kickoff' &&
            decision.credits !== state.credits
          : decision.persist
      if (!acceptedIncoming || !decision.credits) return

      const refinementCredits = {
        ...state.refinementCredits,
        [hash]: decision.credits.refinements,
      }
      const refinementCreditsProvenance = {
        ...state.refinementCreditsProvenance,
        [hash]: decision.provenance as CreditsProvenance,
      }

      if (source === 'kickoff') {
        set({
          credits: decision.credits,
          creditsProvenance: 'kickoff',
          creditsKickoffHash: hash,
          refinementCredits,
          refinementCreditsProvenance,
        })
        return
      }

      const authoritativeRefinementCredits = {
        ...state.authoritativeRefinementCredits,
        [hash]: decision.credits.refinements,
      }
      set({
        credits: decision.credits,
        creditsProvenance: 'authoritative',
        creditsKickoffHash: null,
        authoritativeCredits: decision.authoritative,
        refinementCredits,
        refinementCreditsProvenance,
        authoritativeRefinementCredits,
      })
      persistAuthority(decision.authoritative, authoritativeRefinementCredits)
    }

    /**
     * Normalize persisted authority at a lifecycle boundary without ever using
     * display-only kickoff state as the input. Returns true only on rollover.
     */
    const refreshCreditsForLifecycle = (
      source: Extract<CreditsUpdateSource, 'hydrate' | 'focus' | 'app-active'>
    ): boolean => {
      const state = get()
      const persisted = state.authoritativeCredits
        ? null
        : loadPersistedCredits()
      const authoritativeCredits =
        state.authoritativeCredits ?? persisted?.credits ?? null
      const authoritativeRefinementCredits = state.authoritativeCredits
        ? state.authoritativeRefinementCredits
        : (persisted?.refinementsByHash ?? {})
      const decision = decideCreditsUpdate({
        current: state.credits,
        currentProvenance: state.creditsProvenance,
        authoritative: authoritativeCredits,
        incoming: persisted?.credits,
        source,
        now: Date.now(),
      })

      if (!decision.authoritative) return false

      // Seed known authoritative per-hash values without overwriting any live
      // kickoff projection. A real rollover drops every projection back to its
      // authoritative value before persistence.
      const refinementCredits = decision.refreshed
        ? authoritativeRefinementCredits
        : {
            ...authoritativeRefinementCredits,
            ...state.refinementCredits,
          }
      const refinementCreditsProvenance = decision.refreshed
        ? Object.fromEntries(
            Object.keys(authoritativeRefinementCredits).map((hash) => [
              hash,
              'authoritative' as const,
            ])
          )
        : {
            ...Object.fromEntries(
              Object.keys(authoritativeRefinementCredits).map((hash) => [
                hash,
                'authoritative' as const,
              ])
            ),
            ...state.refinementCreditsProvenance,
          }

      set({
        credits: decision.credits,
        creditsProvenance: decision.provenance,
        creditsKickoffHash:
          decision.provenance === 'kickoff' ? state.creditsKickoffHash : null,
        authoritativeCredits: decision.authoritative,
        refinementCredits,
        refinementCreditsProvenance,
        authoritativeRefinementCredits,
      })
      if (decision.persist) {
        persistAuthority(decision.authoritative, authoritativeRefinementCredits)
      }
      return decision.refreshed
    }

    /** Roll back only the kickoff projection owned by this failed hash. */
    const restoreKickoffProjection = (hash: string) => {
      const state = get()
      const patch: Partial<NotesImportManagerState> = {}
      if (
        state.creditsProvenance === 'kickoff' &&
        state.creditsKickoffHash === hash
      ) {
        patch.credits = state.authoritativeCredits
        patch.creditsProvenance = state.authoritativeCredits
          ? 'authoritative'
          : null
        patch.creditsKickoffHash = null
      }
      if (state.refinementCreditsProvenance[hash] === 'kickoff') {
        const refinementCredits = { ...state.refinementCredits }
        const refinementCreditsProvenance = {
          ...state.refinementCreditsProvenance,
        }
        const authoritative = state.authoritativeRefinementCredits[hash]
        if (authoritative) {
          refinementCredits[hash] = authoritative
          refinementCreditsProvenance[hash] = 'authoritative'
        } else {
          delete refinementCredits[hash]
          delete refinementCreditsProvenance[hash]
        }
        patch.refinementCredits = refinementCredits
        patch.refinementCreditsProvenance = refinementCreditsProvenance
      }
      if (Object.keys(patch).length) set(patch)
    }

    /** A refreshed import window makes prior import-limit denials retryable. */
    const rearmExpiredImportDenials = () => {
      const state = get()
      let runtimes = state.runtimes
      for (const entry of state.entries) {
        const runtime = runtimes[entry.hash]
        if (entry.state !== 'working' || runtime?.error !== 'limit_reached') {
          continue
        }
        if (runtimes === state.runtimes) runtimes = { ...runtimes }
        runtimes[entry.hash] = {
          ...runtime,
          error: null,
          paused: false,
        }
      }
      if (runtimes !== state.runtimes) set({ runtimes })
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
      // The kickoff returns the current usage, so the meter populates the moment
      // the run starts — not only when it finishes. Display only: the kickoff
      // value is optimistic (the credit is charged only on success), so the
      // durable snapshot is written from the authoritative `done` payload below.
      const onCredits = (credits: NotesImportCredits) =>
        applyCredits(hash, credits, 'kickoff')
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
            onCredits,
            signal: controller.signal,
          })
        : runNotesImportStreaming({
            notesText: entry.notesText,
            context,
            refinement,
            onEvent,
            onKickoff,
            onCredits,
            signal: controller.signal,
          })

      runPromise
        .then((res) => {
          // The run was torn down (stop/remove) mid-flight — its controller is
          // aborted. Don't write the result: it would resurrect a stopped row,
          // or re-create a deleted one as an empty Ready row with no notes.
          if (controller.signal.aborted) return
          pendingRefinement.delete(hash)
          // Terminal success is authoritative after the server commits usage.
          // A malformed/missing snapshot leaves the last valid state untouched.
          applyCredits(hash, res.credits, 'terminal')
          putParsedResult(hash, res.result, Date.now(), res.emptyCharged)
          patchRuntime(hash, { phase: 'done', running: false, error: null })
        })
        .catch((e) => {
          const code = e instanceof NotesImportClientError ? e.code : 'unknown'
          if (
            e instanceof NotesImportClientError &&
            e.credits &&
            (code === 'limit_reached' || code === 'refinement_limit')
          ) {
            applyCredits(hash, e.credits, 'denial')
          }
          const decision = classifyRunOutcome(
            { aborted: controller.signal.aborted, code },
            { cooldownMs: ACTIVE_CAP_COOLDOWN_MS }
          )
          // A kickoff preview is optimistic. If this attempt still owns the
          // hash and did not end in an authoritative allowance denial, restore
          // display from authority so a failed/cancelled run never looks spent.
          if (
            controllers.get(hash) === controller &&
            code !== 'limit_reached' &&
            code !== 'refinement_limit'
          ) {
            restoreKickoffProjection(hash)
          }
          switch (decision.kind) {
            case 'cancelled':
              // User/teardown cancel: stays Working (Queued), no error surfaced.
              // Only patch if THIS run still owns the slot — an interrupt-and-
              // refine (or stop) may have already torn this run down and started
              // a NEWER run for the same hash; patching running:false here would
              // wrongly paint that live run as idle.
              if (controllers.get(hash) === controller) {
                patchRuntime(hash, { running: false, phase: null })
              }
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
          // Only clear bookkeeping THIS run still owns. stop()/remove() may have
          // already torn this run down and a same-hash resubmit started a NEW
          // run; blindly deleting here would orphan that newer run's controller
          // (unabortable) and its in-flight guard (a duplicate concurrent run).
          if (controllers.get(hash) === controller) {
            controllers.delete(hash)
            inFlight.delete(hash)
          }
          get().hydrate()
          get().tick()
        })
    }

    return {
      entries: [],
      runtimes: {},
      reconcileWarnings: {},
      credits: null,
      creditsProvenance: null,
      creditsKickoffHash: null,
      authoritativeCredits: null,
      refinementCredits: {},
      refinementCreditsProvenance: {},
      authoritativeRefinementCredits: {},
      hydrated: false,

      creditsForImport: (hash) =>
        notesImportCreditsForHash(get().credits, get().refinementCredits, hash),

      appBecameActive: () => {
        const refreshed = refreshCreditsForLifecycle('app-active')
        if (refreshed) rearmExpiredImportDenials()
        get().tick()
      },

      hydrate: () => {
        const entries = getAllLedgerEntries()
        const present = new Set(entries.map((e) => e.hash))
        const prevRuntimes = get().runtimes
        const runtimes: Record<string, ImportRuntime> = {}
        for (const h of Object.keys(prevRuntimes)) {
          if (present.has(h)) runtimes[h] = prevRuntimes[h]
        }
        // Drop warnings for vanished rows too, or removed/cleared/pruned imports
        // leak entries in this map for the life of the store.
        const prevWarnings = get().reconcileWarnings
        const reconcileWarnings: Record<string, MappedWarning[]> = {}
        for (const h of Object.keys(prevWarnings)) {
          if (present.has(h)) reconcileWarnings[h] = prevWarnings[h]
        }
        set({ entries, runtimes, reconcileWarnings, hydrated: true })

        // Credits hydrate independently from the import ledger. Only persisted
        // authority is eligible for expiration and durable rollover.
        const refreshed = refreshCreditsForLifecycle('hydrate')
        if (refreshed) rearmExpiredImportDenials()
      },

      focus: () => {
        pruneLedgerEntries()
        // Keep focus as its own lifecycle source rather than delegating to the
        // public hydrate action; this makes provenance/rollover behavior
        // observable at the intended manager seam.
        const entries = getAllLedgerEntries()
        const present = new Set(entries.map((e) => e.hash))
        const runtimes = Object.fromEntries(
          Object.entries(get().runtimes).filter(([hash]) => present.has(hash))
        )
        const reconcileWarnings = Object.fromEntries(
          Object.entries(get().reconcileWarnings).filter(([hash]) =>
            present.has(hash)
          )
        )
        set({ entries, runtimes, reconcileWarnings, hydrated: true })
        const refreshed = refreshCreditsForLifecycle('focus')
        if (refreshed) rearmExpiredImportDenials()
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

      interruptAndRefine: async (hash, instruction) => {
        const trimmed = instruction.trim()
        if (!trimmed) return false
        const entry = getLedgerEntry(hash)
        // Only a live (Working) run can be interrupted mid-thought. If it already
        // settled (raced to Ready/Done), bail so the caller falls back to a plain
        // refine and keeps the composer text.
        if (!entry || entry.state !== 'working') return false

        // Tear the in-flight run down for good — abort the local stream and free
        // the server run (credit is charged only on success, so an interrupted
        // run is never billed). Unlike stop(), we re-open the SAME row as Working
        // with the new refinement below, so it never lands in the terminal
        // `stopped` state. The startRun catch is slot-guarded, so the aborted
        // run can't clobber the new one's runtime.
        const activeRun = entry.activeRun
        if (activeRun) void destroyNotesImport(activeRun)
        controllers.get(hash)?.abort()
        controllers.delete(hash)
        inFlight.delete(hash)
        cooldownUntil.delete(hash)

        // Refine against the last COMPLETED result — the in-flight turn we just
        // aborted never produced one. With a prior result (a refine loop, or a
        // re-thinking Ready import) that's the cached result; on a first parse
        // there's none yet, so the instruction layers onto an empty baseline (a
        // case the refine path already supports).
        const now = Date.now()
        pendingRefinement.set(hash, {
          previousResultJSON: JSON.stringify(
            entry.result ?? EMPTY_PARSE_RESULT
          ),
          instruction: trimmed,
        })
        // Seal the new instruction as the live turn. While Working, the trailing
        // user message in `history` is the in-flight instruction we just aborted —
        // never charged and now superseded — so drop it and put this one in its
        // place. (A first parse has no such trailing turn; its history is empty.)
        // This keeps the refinement-credit caption — which counts user turns — in
        // step with what the meter actually charged.
        const priorTurns = entry.history
        const base =
          priorTurns.length > 0 &&
          priorTurns[priorTurns.length - 1].role === 'user'
            ? priorTurns.slice(0, -1)
            : priorTurns
        replaceLedgerHistory(hash, [
          ...base,
          { role: 'user', text: trimmed, at: now },
        ])
        beginWorkingEntry(hash, {
          notesText: entry.notesText,
          activeRun: null,
          nowMs: now,
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
            // Stable per-import clock (when the result was parsed) so synthesized
            // fallback dates match what the preview showed and never drift.
            importedAt: new Date(entry.parsedAt ?? entry.createdAt),
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
