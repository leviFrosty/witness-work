import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import {
  getNotesImportConfig,
  limitsWindowDurationMs,
  resolveNotesImportLimits,
  selectEffectiveAllowances,
} from './config'
import { decideStartOutcome, type StartOutcome } from './cap'
import { runNotesImportModel, type ModelProgress } from './llm'
import type { CreditDecision } from '../credits'
import {
  formatSSE,
  isTerminalEvent,
  parseLastEventId,
  type ImportEvent,
  type ImportStatus,
  type NotesImportFailure,
  type NotesImportSuccess,
  type UnsequencedEvent,
} from './events'
import { isEmptyImportResult, type NotesImportContext } from './schema'
import { resolveTerminalSupporter } from './settlement'
import { countsWebSandboxSubscriptions } from '../revenuecat'
import { analyticsEnabled, captureAnalyticsEvent } from '../analytics'
import {
  notesImportFinishedEvent,
  type NotesImportAnalyticsContext,
  type NotesImportOutcome,
  type NotesImportSuccessDetails,
} from './analytics'

/**
 * Everything the kickoff handler hands the run DO. All fields are
 * structured-clone-safe (passed over DO RPC). Auth, the ZDR routing decision,
 * and the credit `decision` are frozen at attested kickoff. Kickoff supporter
 * status is retained as the fallback for a terminal entitlement refresh.
 */
export interface StartImportInput {
  importId: string
  /**
   * The METER identity, not necessarily the device's install uuid: the
   * session's account id on a bearer run, else the shared account id when the
   * client sent one (ADR 0011), else the install uuid. Names the per-user
   * index DO (slot release + credit commit), so it must match whatever
   * identity the kickoff acquired under.
   */
  uuid: string
  contentHash: string
  notesText: string
  context: NotesImportContext
  refinement?: { previousResultJSON: string; instruction: string }
  /** Real entitlement as observed at kickoff; terminal success re-resolves it. */
  isSupporter: boolean
  /** Authenticated development bypass; overrides usage allowances only. */
  devBypass: boolean
  decision: CreditDecision
  /** Usage-event context; absent on runs kicked off before analytics shipped. */
  analytics?: NotesImportAnalyticsContext
  /**
   * Set on runs started with an account session's bearer token; absent on
   * legacy runs. `uuid` is then the account id.
   */
  account?: {
    /** `importOwnerKey(accountId)`, kept as the run's owner until it's deleted. */
    ownerKey: string
  }
}

export interface RunResultSnapshot {
  status: ImportStatus | null
  payload?: NotesImportSuccess
  error?: NotesImportFailure
}

/** Flush a buffered reasoning run once it reaches this many chars. */
const REASONING_FLUSH_CHARS = 120

/**
 * While a run is live, every subscriber gets an SSE comment line this often,
 * so a client can tell a quiet model from a dead connection with an idle
 * watchdog (anything over this interval plus slack means the stream is gone).
 * Comments carry no event, id, or data, so parsers skip them by spec.
 */
export const SSE_HEARTBEAT_MS = 15_000
const SSE_HEARTBEAT_FRAME = ':\n\n'

/**
 * A live SSE subscriber. Wraps a ReadableStream controller with a `closed` guard
 * so a hung-up client (whose stream is already cancelled/closed) can never throw
 * "the stream is not in a state that permits close/enqueue" from a broadcast.
 */
interface Subscriber {
  send(frame: Uint8Array): void
  close(): void
  readonly closed: boolean
}

/**
 * `NotesImportRun` — one instance per import (keyed by importId). It owns the
 * long model run, decoupled from any client connection:
 *
 *   kickoff RPC → start() → schedules an immediate alarm → alarm() runs the
 *   model in the background (survives the kickoff request ending and tolerates
 *   the client never connecting). Every progress event is appended to an
 *   append-only SQLite log AND fanned out to any attached SSE subscribers.
 *
 * A client subscribes via fetch() (SSE), which REPLAYS the log since the
 * client's `Last-Event-ID` and then tails live — so a dropped/backgrounded
 * connection resumes losslessly. The final structured result is held for a
 * retention window (alarm-based cleanup) so a reconnecting client can fetch it
 * without re-running. Stores notes text only transiently for the run; the
 * persisted artifacts are the event log + the final result.
 */
export class NotesImportRun extends DurableObject<Environment> {
  #subscribers = new Set<Subscriber>()
  #encoder = new TextEncoder()
  /** Runs only while there are live subscribers (see `#heartbeat`). */
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null
  #reasonBuf = ''
  /**
   * Aborts the in-flight model call when the client interrupts the import. Held
   * in memory for the lifetime of one `#run` (a cancel after a DO eviction finds
   * it null — the model call is already dead — and just records the terminal
   * state). `signal.aborted` also gates late progress events from overwriting the
   * `cancelled` status.
   */
  #aborter: AbortController | null = null
  /**
   * Non-null from the final cancellation check through usage commit and the
   * terminal `done` write. A concurrent cancel waits for this promise instead
   * of interleaving with settlement and overwriting/charging `cancelled`.
   */
  #settlement: Promise<void> | null = null

  /**
   * The tables exist. They're created on the first write, not in the
   * constructor, so a read of an unknown import stores nothing, and reset
   * after `deleteAll()`, which drops them.
   */
  #schemaReady = false

  // --- RPC surface --------------------------------------------------------

  /**
   * Begin (or restart after a failure) an import. Idempotent: a re-kick while
   * queued/running is a no-op, and a re-kick of a settled import returns
   * (leaves) the cached result for reconnect. A re-kick of a previously-failed
   * import starts fresh.
   *
   * Returns a {@link StartOutcome} so the kickoff handler can tell whether the
   * concurrency slot it just acquired was legitimately consumed (`started`),
   * already held by the live run (`running`), or re-inserted as an ORPHAN row
   * against an already-settled run (`terminal`) that must be released — the
   * index DO has no TTL, so a leaked slot locks the user out forever.
   */
  async start(input: StartImportInput): Promise<StartOutcome> {
    const outcome = decideStartOutcome(this.#status())
    // Live or settled import → left alone (idempotent re-kick / reconnect). Only
    // a fresh DO (null) or a prior failure ('error') → 'started' (re)starts.
    if (outcome !== 'started') return outcome

    // Fresh, or retrying a prior failure → reset and schedule the run. Awaiting
    // setAlarm means the kickoff's `await start()` guarantees the run is durably
    // scheduled before it mints the subscribe token and replies.
    this.#ensureSchema()
    this.ctx.storage.sql.exec('DELETE FROM events')
    this.#metaSet('input', JSON.stringify(input))
    // The owner outlives `input` (dropped once terminal): bearer routes check
    // it for as long as the result is kept.
    if (input.account) this.#metaSet('owner', input.account.ownerKey)
    else this.#metaDel('owner')
    this.#metaDel('result')
    this.#metaDel('error')
    this.#setStatus('queued')
    await this.ctx.storage.setAlarm(Date.now())
    return 'started'
  }

  /**
   * Whether a bearer request for `ownerKey`'s account may use this import:
   * only a run that account started, until the run is deleted. A read, so
   * asking about an unknown import stores nothing.
   */
  isOwnedBy(ownerKey: string): boolean {
    const owner = this.#metaGet('owner')
    return owner != null && owner === ownerKey
  }

  /** Snapshot for a client that reconnects after the live stream has closed. */
  getResult(): RunResultSnapshot {
    const status = this.#status()
    if (status === 'done') {
      const raw = this.#metaGet('result')
      return { status, payload: raw ? (JSON.parse(raw) as NotesImportSuccess) : undefined }
    }
    if (status === 'error') {
      const raw = this.#metaGet('error')
      return {
        status,
        error: raw
          ? (JSON.parse(raw) as NotesImportFailure)
          : { code: 'unknown', message: 'Import failed' },
      }
    }
    return { status }
  }

  /**
   * Interrupt a still-running import. Aborts the in-flight model call so it stops
   * spending provider tokens, then records a terminal `cancelled` state. A cancel
   * that wins the final pre-settlement check never charges; once serialized
   * settlement starts, cancel waits for its terminal result. Frees the
   * user's concurrency slot immediately so a resend isn't blocked by the cap, and
   * emits a terminal `cancelled` event so any attached subscriber closes. No-op
   * once the run is already terminal. Authorized upstream by the kickoff's
   * subscribe-token capability (same as the stream/result reads).
   */
  async cancel(): Promise<RunResultSnapshot> {
    // Settlement has already won its final cancellation check. Wait for its
    // terminal write so this call returns `done` (or `error`) rather than
    // interleaving a `cancelled` write while recordUsage is in flight.
    const settlement = this.#settlement
    if (settlement) {
      await settlement
      return this.getResult()
    }

    const status = this.#status()
    if (
      status === null ||
      status === 'done' ||
      status === 'error' ||
      status === 'cancelled'
    ) {
      return this.getResult()
    }
    // Signal the running model to abort. When still 'queued' there's no controller
    // yet — flipping the status to terminal makes the not-yet-fired run alarm
    // short-circuit to cleanup (see `alarm()`) instead of calling the model.
    this.#aborter?.abort()
    await this.#markCancelled()
    return this.getResult()
  }

  /**
   * Forget this import entirely, on demand. Aborts any in-flight model call (so
   * it stops spending tokens and — credit only charged on success — is never
   * billed), frees the user's concurrency slot if it's still held, closes any
   * live subscriber, and wipes ALL persisted state NOW instead of waiting for
   * the retention alarm. Idempotent and safe on an already-evicted DO. Backs the
   * history view's per-row delete; authorized upstream by the kickoff's
   * subscribe-token capability (same as the stream/result/cancel reads).
   */
  async destroy(): Promise<void> {
    // Use the same winner-takes-all boundary as cancel(). Before #settlement is
    // published, abort wins and its callback (including recordUsage) can never
    // start. Once published, settlement owns the credit + terminal write; wait
    // for it to finish, then honor destroy's stronger forget-all-state contract.
    // This prevents a deferred callback from recreating state after deleteAll.
    const settlement = this.#settlement
    if (settlement) await settlement

    // Stop any running model call. A still-live run holds its input (with the
    // uuid) — read it BEFORE deleteAll so the slot can be released; a terminal
    // run already released on its way out and has dropped the input.
    this.#aborter?.abort()
    const raw = this.#metaGet('input')
    if (raw) {
      try {
        const input = JSON.parse(raw) as StartImportInput
        await this.#releaseSlot(input.uuid, input.importId)
        // A live run (terminal runs drop their input) ends here unfinished.
        this.#trackFinished(input, 'cancelled')
      } catch {
        /* malformed input — nothing to release */
      }
    }
    for (const s of this.#subscribers) s.close()
    this.#subscribers.clear()
    this.#stopHeartbeat()
    await this.#deleteAll()
  }

  // --- Background execution ----------------------------------------------

  async alarm(): Promise<void> {
    const status = this.#status()
    if (status === null) return
    if (status === 'done' || status === 'error' || status === 'cancelled') {
      // Retention window elapsed → evict all state.
      await this.#deleteAll()
      return
    }
    if (status !== 'queued') {
      // A prior attempt started (status is starting/thinking/structuring) but
      // never finished — i.e. the DO was evicted mid-run and the alarm was
      // redelivered. Bound re-spend: fail rather than re-running the model call.
      // This path does NOT go through #run's finally, so it must do the two
      // things that finally normally does: free the user's concurrency slot and
      // schedule retention cleanup. Release BEFORE #fail, which deletes the
      // `input` meta that holds the uuid/importId. Without the release the slot
      // leaks forever (the index DO has no TTL); without the cleanup alarm the
      // interrupted run (still holding notesText) lingers in storage forever.
      const raw = this.#metaGet('input')
      if (raw) {
        try {
          const input = JSON.parse(raw) as StartImportInput
          await this.#releaseSlot(input.uuid, input.importId)
          this.#trackFinished(input, 'interrupted')
        } catch {
          /* malformed input — nothing to release */
        }
      }
      await this.#fail('interrupted', 'The import was interrupted. Please retry.')
      await this.#scheduleCleanup()
      return
    }
    await this.#run()
  }

  async #run(): Promise<void> {
    const raw = this.#metaGet('input')
    if (!raw) {
      await this.#fail('server_error', 'Missing import input')
      return
    }
    const input = JSON.parse(raw) as StartImportInput
    // Mark as started BEFORE the first await so a redelivered alarm (after an
    // eviction mid-run) is detected as interrupted rather than re-run. The
    // model's onProgress emits the client-facing 'starting' event itself.
    this.#setStatus('starting')
    const config = getNotesImportConfig(this.env)
    const startedAt = Date.now()
    const objectId = this.ctx.id.toString()
    console.log(
      `notes-import[${objectId}] run starting (refinement=${!!input.refinement})`
    )

    // Fresh controller per run so a client `cancel()` can abort the model call.
    this.#aborter = new AbortController()
    try {
      const out = await runNotesImportModel({
        apiKey: this.env.OPENROUTER_API_KEY,
        config,
        notesText: input.notesText,
        context: input.context,
        refinement: input.refinement,
        abortSignal: this.#aborter.signal,
        onProgress: (p) => this.#onProgress(p),
      })
      this.#flushReason()

      // Spend the credit only now that the model succeeded (mirrors the legacy
      // path: a failure never costs the user a credit). Commit atomically in the
      // per-user index DO — the same single-threaded DO that gated the kickoff —
      // so check-then-charge can't race and increments are never lost.
      // Re-resolve entitlement and runtime policy at settlement. Kickoff is a
      // preview; this post-commit snapshot is authoritative if either changed.
      const terminalSupporter = await resolveTerminalSupporter({
        kickoffSupporter: input.isSupporter,
        devBypass: input.devBypass,
        apiKey: this.env.REVENUECAT_API_KEY,
        appUserId: input.uuid,
        entitlementId: config.entitlementId,
        countWebSandbox: countsWebSandboxSubscriptions(this.env),
        account: input.account && { accountId: input.uuid, env: this.env },
      })
      const limits = await resolveNotesImportLimits(this.env, this.env.NOTES_KV)
      const allowances = selectEffectiveAllowances(
        limits,
        terminalSupporter,
        input.devBypass
      )
      const payload = await this.#settle(async () => {
        const idxId = this.env.NOTES_IMPORT_INDEX.idFromName(input.uuid)
        const { credits, emptyCharged } = await this.env.NOTES_IMPORT_INDEX.get(
          idxId
        ).recordUsage({
          hash: input.contentHash,
          isSupporter: terminalSupporter,
          decision: input.decision,
          importLimit: allowances.imports,
          refinementLimit: allowances.refinements,
          windowDurationMs: limitsWindowDurationMs(limits),
          isEmpty: isEmptyImportResult(out.result),
          emptyWindowSeconds: config.emptyWindowSeconds,
          emptyWindowLimit: config.emptyWindowLimit,
        })

        const settledPayload: NotesImportSuccess = {
          result: out.result,
          contentHash: input.contentHash,
          refinement: !!input.refinement,
          emptyCharged,
          credits,
        }
        this.#metaSet('result', JSON.stringify(settledPayload))
        this.#setStatus('done')
        // Drop the raw notes the instant the run is terminal: only `result` is
        // needed for the reconnect window, the client already holds the source
        // text, and a refinement re-sends it — so notesText is dead weight that
        // would otherwise rest in storage for the full retention hour.
        this.#metaDel('input')
        this.#emit({ type: 'done', payload: settledPayload })
        return settledPayload
      })
      if (!payload) {
        console.log(`notes-import[${objectId}] run cancelled before settlement`)
        return
      }
      this.#trackFinished(input, 'success', {
        result: out.result,
        credits: payload.credits,
        emptyCharged: payload.emptyCharged,
        model: config.model,
        provider: out.resolvedProvider,
        usage: out.usage,
      })
      console.log(
        `notes-import[${objectId}] run done in ${
          Date.now() - startedAt
        }ms (provider=${out.resolvedProvider ?? 'unknown'} reasoningTokens=${
          out.usage.reasoningTokens ?? 0
        })`
      )
    } catch (e) {
      // A client `cancel()` aborts the model call; that's not a failure and must
      // never charge a credit or overwrite the 'cancelled' terminal state that
      // cancel() already wrote. Anything else is a genuine model error.
      if (this.#aborter?.signal.aborted) {
        console.log(`notes-import[${objectId}] run cancelled`)
      } else {
        console.error('notes-import run model_error', errorDetail(e))
        await this.#fail(
          'model_error',
          'The import model could not process these notes'
        )
        this.#trackFinished(input, 'model_error')
      }
    } finally {
      this.#aborter = null
      // Free the user's concurrency slot and schedule result cleanup. (When a
      // cancel raced in, both are idempotent: release is a DELETE, setAlarm
      // overwrites.)
      await this.#releaseSlot(input.uuid, input.importId)
      await this.#scheduleCleanup()
    }
  }

  /**
   * Atomically choose settlement over cancellation. There is no await between
   * the final cancelled-state check and publishing #settlement, so cancel() can
   * either win before this point (no callback/charge) or wait until the complete
   * usage + terminal-state transaction has won.
   */
  async #settle<T>(callback: () => Promise<T>): Promise<T | null> {
    if (this.#status() === 'cancelled' || this.#aborter?.signal.aborted) {
      return null
    }

    let finish!: () => void
    const settlement = new Promise<void>((resolve) => {
      finish = resolve
    })
    this.#settlement = settlement
    try {
      return await callback()
    } finally {
      this.#settlement = null
      finish()
    }
  }

  /** Drop the user's concurrency slot in the index DO. Safe to call twice. */
  async #releaseSlot(uuid: string, importId: string): Promise<void> {
    try {
      const idxId = this.env.NOTES_IMPORT_INDEX.idFromName(uuid)
      await this.env.NOTES_IMPORT_INDEX.get(idxId).release(importId)
    } catch (e) {
      console.error('notes-import index release failed', errorDetail(e))
    }
  }

  /**
   * Record the terminal `cancelled` state: drop raw notes, free the concurrency
   * slot, emit the terminal event, and schedule eviction. Reads the run input for
   * the uuid/importId BEFORE deleting it. No credit is charged — `recordUsage` is
   * never reached on this path.
   */
  async #markCancelled(): Promise<void> {
    const raw = this.#metaGet('input')
    const input = raw ? (JSON.parse(raw) as StartImportInput) : null
    this.#flushReason()
    this.#setStatus('cancelled')
    // A cancelled run never needs its source notes again — drop them now rather
    // than holding raw notesText until the retention alarm fires.
    this.#metaDel('input')
    this.#emit({ type: 'cancelled' })
    if (input) {
      await this.#releaseSlot(input.uuid, input.importId)
      this.#trackFinished(input, 'cancelled')
    }
    await this.#scheduleCleanup()
  }

  /** Report how a started run ended. Best-effort; never delays the run. */
  #trackFinished(
    input: StartImportInput,
    outcome: NotesImportOutcome,
    success?: NotesImportSuccessDetails
  ): void {
    if (!input.analytics || !analyticsEnabled(this.env)) return
    this.ctx.waitUntil(
      captureAnalyticsEvent(
        this.env,
        notesImportFinishedEvent(input.analytics, outcome, Date.now(), success)
      )
    )
  }

  /**
   * Schedule alarm-based eviction of all this run's state after the retention
   * window. The retention alarm's handler (`alarm()`, on a `done`/`error` DO)
   * calls `deleteAll()`. Every terminal transition must route through here so no
   * run is left holding state — especially raw notesText — with no pending alarm.
   */
  async #scheduleCleanup(): Promise<void> {
    const config = getNotesImportConfig(this.env)
    await this.ctx.storage.setAlarm(
      Date.now() + config.resultRetentionSeconds * 1000
    )
  }

  /** Map a model progress signal onto the client event stream. */
  #onProgress(p: ModelProgress): void {
    // Once a cancel has aborted the run, ignore any in-flight progress so a late
    // 'phase' event can't overwrite the terminal 'cancelled' status.
    if (this.#aborter?.signal.aborted) return
    if (p.kind === 'phase') {
      this.#flushReason()
      this.#setStatus(p.phase)
      this.#emit({ type: 'status', status: p.phase })
    } else if (p.kind === 'reasoning') {
      this.#reasonBuf += p.text
      if (this.#reasonBuf.length >= REASONING_FLUSH_CHARS) this.#flushReason()
    } else {
      this.#stream({ type: 'progress', chars: p.chars })
    }
  }

  #flushReason(): void {
    if (!this.#reasonBuf) return
    const text = this.#reasonBuf
    this.#reasonBuf = ''
    this.#stream({ type: 'reasoning', text })
  }

  async #fail(code: string, message: string): Promise<void> {
    this.#flushReason()
    this.#metaSet('error', JSON.stringify({ code, message } satisfies NotesImportFailure))
    this.#setStatus('error')
    // A failed run never needs its source notes again — drop them now rather
    // than holding raw notesText until the retention alarm fires.
    this.#metaDel('input')
    this.#emit({ type: 'error', code, message })
  }

  // --- SSE subscribe ------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const cursor = parseLastEventId(
      request.headers.get('Last-Event-ID') ?? url.searchParams.get('lastEventId')
    )

    const encoder = this.#encoder
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null
    let closed = false
    const sub: Subscriber = {
      get closed() {
        return closed
      },
      send(frame) {
        if (closed || !controllerRef) return
        try {
          controllerRef.enqueue(frame)
        } catch {
          closed = true // client hung up between checks
        }
      },
      close() {
        if (closed) return
        closed = true
        try {
          controllerRef?.close()
        } catch {
          /* client already hung up */
        }
      },
    }

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controllerRef = controller
        // Replay everything since the client's cursor (lossless resume). Guarded
        // because the client may disconnect mid-replay.
        try {
          const rows = this.#hasSchema()
            ? this.ctx.storage.sql
                .exec<{ seq: number; data: string }>(
                  'SELECT seq, data FROM events WHERE seq > ? ORDER BY seq',
                  cursor
                )
                .toArray()
            : []
          for (const r of rows) {
            const ev = { ...JSON.parse(r.data), seq: r.seq } as ImportEvent
            sub.send(encoder.encode(formatSSE(ev)))
          }
        } catch {
          /* enqueue raced a disconnect */
        }
        // Nothing live to tail (finished, cancelled, or no run at all) →
        // close after the replay rather than hold a silent stream open.
        const status = this.#status()
        if (
          status === null ||
          status === 'done' ||
          status === 'error' ||
          status === 'cancelled'
        ) {
          sub.close()
          return
        }
        this.#subscribers.add(sub)
        this.#startHeartbeat()
      },
      cancel: () => {
        closed = true
        this.#subscribers.delete(sub)
        if (this.#subscribers.size === 0) this.#stopHeartbeat()
      },
    })

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    })
  }

  // --- event log + fan-out -----------------------------------------------

  /** Persist an event to the replay log, then broadcast it with its resume seq. */
  #emit(ev: UnsequencedEvent): void {
    this.#ensureSchema()
    const row = this.ctx.storage.sql
      .exec<{ seq: number }>(
        'INSERT INTO events (type, data) VALUES (?, ?) RETURNING seq',
        ev.type,
        JSON.stringify(ev)
      )
      .one()
    this.#broadcast({ ...ev, seq: row.seq } as ImportEvent)
  }

  /**
   * Broadcast a cosmetic event (reasoning/progress) to live subscribers WITHOUT
   * persisting it. The frame carries no `id:` line, so it never advances a
   * client's `Last-Event-ID`: a reconnect resumes from the last persisted
   * status/terminal event and re-tails live reasoning, which is throwaway. These
   * events are ~90% of the per-import volume, so keeping them out of the SQLite
   * log cuts row writes (and retained log size, and reconnect replay cost) ~10x.
   */
  #stream(ev: UnsequencedEvent): void {
    this.#broadcast(ev)
  }

  #broadcast(ev: ImportEvent | UnsequencedEvent): void {
    this.#sendAll(this.#encoder.encode(formatSSE(ev)))
    if (isTerminalEvent(ev)) {
      for (const s of this.#subscribers) s.close()
      this.#subscribers.clear()
      this.#stopHeartbeat()
    }
  }

  #sendAll(frame: Uint8Array): void {
    for (const s of this.#subscribers) {
      s.send(frame)
      if (s.closed) this.#subscribers.delete(s)
    }
  }

  /** One timer for all subscribers; stops when the last one leaves. */
  #startHeartbeat(): void {
    if (this.#heartbeatTimer) return
    const frame = this.#encoder.encode(SSE_HEARTBEAT_FRAME)
    this.#heartbeatTimer = setInterval(() => {
      this.#sendAll(frame)
      if (this.#subscribers.size === 0) this.#stopHeartbeat()
    }, SSE_HEARTBEAT_MS)
  }

  #stopHeartbeat(): void {
    if (!this.#heartbeatTimer) return
    clearInterval(this.#heartbeatTimer)
    this.#heartbeatTimer = null
  }

  // --- storage helpers ----------------------------------------------------

  #ensureSchema(): void {
    if (this.#schemaReady) return
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`
    )
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS events (
         seq  INTEGER PRIMARY KEY AUTOINCREMENT,
         type TEXT NOT NULL,
         data TEXT NOT NULL
       )`
    )
    this.#schemaReady = true
  }

  /** Whether the tables exist, without creating them. */
  #hasSchema(): boolean {
    if (this.#schemaReady) return true
    const tables = this.ctx.storage.sql.exec(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'`
    )
    this.#schemaReady = tables.toArray().length > 0
    return this.#schemaReady
  }

  /** Wipes all state, tables included; the next write recreates them. */
  async #deleteAll(): Promise<void> {
    await this.ctx.storage.deleteAll()
    this.#schemaReady = false
  }

  // --- tiny meta helpers --------------------------------------------------

  #status(): ImportStatus | null {
    return (this.#metaGet('status') as ImportStatus | null) ?? null
  }

  #setStatus(status: ImportStatus): void {
    this.#metaSet('status', status)
  }

  #metaGet(k: string): string | null {
    if (!this.#hasSchema()) return null
    const rows = this.ctx.storage.sql
      .exec<{ v: string }>('SELECT v FROM meta WHERE k = ?', k)
      .toArray()
    return rows.length ? rows[0].v : null
  }

  #metaSet(k: string, v: string): void {
    this.#ensureSchema()
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)',
      k,
      v
    )
  }

  #metaDel(k: string): void {
    if (!this.#hasSchema()) return
    this.ctx.storage.sql.exec('DELETE FROM meta WHERE k = ?', k)
  }
}

/** Serialize a caught value to a single useful string for DO logs. */
const errorDetail = (e: unknown): string => {
  if (e instanceof Error) {
    return `${e.name}: ${e.message}${e.stack ? `\n${e.stack}` : ''}`
  }
  try {
    return typeof e === 'string' ? e : JSON.stringify(e)
  } catch {
    return String(e)
  }
}
