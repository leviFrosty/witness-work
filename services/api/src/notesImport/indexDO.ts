import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import { SYNC_SLOT_MAX_AGE_MS, SYNC_SLOT_PREFIX, decideAcquire } from './cap'
import {
  allowanceDeniedEvent,
  emitNotesImportOperationalEvent,
  windowRolledOverEvent,
} from './operations'
import {
  computeCommit,
  computeCreditsSnapshot,
  computeImportUsage,
  computeKickoffCredits,
  decideCredit,
  normalizeImportWindow,
  type Allowance,
  type CreditDecision,
  type CreditState,
  type CreditsSnapshot,
  type HashRecord,
  type ImportUsage,
  type ImportWindow,
} from '../credits'

export interface ActiveImport {
  importId: string
  status: string
  startedAt: number
}

export interface AcquireResult {
  ok: boolean
  active: number
}

export type AcquireSyncResult =
  | { ok: true; active: number; slot: string }
  | { ok: false; active: number }

export interface CheckCreditArgs {
  hash: string
  isSupporter: boolean
  isRefinement: boolean
  importLimit: Allowance
  refinementLimit: Allowance
  windowDurationMs: number
}

export interface CheckCreditResult {
  decision: CreditDecision
  /** Current authoritative state; denials return this same strict snapshot. */
  credits: CreditsSnapshot
}

export interface RecordUsageArgs {
  hash: string
  /** Real entitlement only; allowance values independently drive metering. */
  isSupporter: boolean
  decision: CreditDecision
  importLimit: Allowance
  refinementLimit: Allowance
  windowDurationMs: number
  isEmpty: boolean
  emptyWindowSeconds: number
  emptyWindowLimit: number
}

export interface RecordUsageResult {
  credits: CreditsSnapshot
  emptyCharged: boolean
}

export interface KickoffCreditsArgs {
  hash: string
  decision: CreditDecision
  isSupporter: boolean
  importLimit: Allowance
  refinementLimit: Allowance
  windowDurationMs: number
}

export interface UsageArgs {
  importLimit: Allowance
  windowDurationMs: number
}

export type TakeTranscribePageResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number }

export interface ResetUsageResult {
  previousCount: number
  hadActiveWindow: boolean
  deletedEmptyRuns: number
}

/**
 * One Durable Object per meter identity. It serializes both active-import slots
 * and allowance state. SQLite contains no notes/model output: only opaque run
 * handles, aggregate usage, permanent content-hash records, and Empty Import
 * timestamps.
 */
export class NotesImportIndex extends DurableObject<Environment> {
  constructor(ctx: DurableObjectState, env: Environment) {
    super(ctx, env)
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS active (
         importId  TEXT PRIMARY KEY,
         status    TEXT NOT NULL,
         startedAt INTEGER NOT NULL
       )`
    )
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS credit_meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`
    )
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS hash_record (
         hash        TEXT PRIMARY KEY,
         charged     INTEGER NOT NULL,
         refinements INTEGER NOT NULL
       )`
    )
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS empty_run (ts INTEGER NOT NULL)`
    )
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS transcribed_page (ts INTEGER NOT NULL)`
    )
  }

  // --- Active concurrency (unchanged) -----------------------------------

  acquire(importId: string, cap: number): AcquireResult {
    const held = this.#has(importId)
    const active = this.#activeCount()
    if (!decideAcquire(active, held, cap)) return { ok: false, active }
    if (!held) {
      this.ctx.storage.sql.exec(
        'INSERT INTO active (importId, status, startedAt) VALUES (?, ?, ?)',
        importId,
        'running',
        Date.now()
      )
    }
    return { ok: true, active: held ? active : active + 1 }
  }

  /**
   * A slot for one synchronous import (`POST /notes-import`), under a key of
   * its own: unlike a run, the synchronous path has nothing to share a model
   * run with, so identical requests at once each run the model and each
   * count against `cap`. Synchronous slots older than
   * `SYNC_SLOT_MAX_AGE_MS` are dropped first, since a cancelled request
   * never releases its own. `release(slot)` frees it.
   */
  acquireSync(cap: number): AcquireSyncResult {
    this.ctx.storage.sql.exec(
      'DELETE FROM active WHERE substr(importId, 1, ?) = ? AND startedAt <= ?',
      SYNC_SLOT_PREFIX.length,
      SYNC_SLOT_PREFIX,
      Date.now() - SYNC_SLOT_MAX_AGE_MS
    )
    const active = this.#activeCount()
    if (!decideAcquire(active, false, cap)) return { ok: false, active }
    const slot = `${SYNC_SLOT_PREFIX}${crypto.randomUUID()}`
    this.ctx.storage.sql.exec(
      'INSERT INTO active (importId, status, startedAt) VALUES (?, ?, ?)',
      slot,
      'running',
      Date.now()
    )
    return { ok: true, active: active + 1, slot }
  }

  release(importId: string): void {
    this.ctx.storage.sql.exec('DELETE FROM active WHERE importId = ?', importId)
  }

  list(): ActiveImport[] {
    return this.ctx.storage.sql
      .exec<{ importId: string; status: string; startedAt: number }>(
        'SELECT importId, status, startedAt FROM active ORDER BY startedAt DESC'
      )
      .toArray()
  }

  // --- Page transcription (Import from Paper) ---------------------------

  /**
   * Counts one page toward the rolling per-identity transcription limit, or
   * refuses it with the wait until the oldest counted page ages out. Pages are
   * counted before the model runs, so a failed page still counts: it cost a
   * real model call.
   */
  takeTranscribePage(limit: number, windowMs: number): TakeTranscribePageResult {
    const now = Date.now()
    this.ctx.storage.sql.exec(
      'DELETE FROM transcribed_page WHERE ts <= ?',
      now - windowMs
    )
    const { n, oldest } = this.ctx.storage.sql
      .exec<{ n: number; oldest: number | null }>(
        'SELECT COUNT(*) AS n, MIN(ts) AS oldest FROM transcribed_page'
      )
      .one()
    if (n >= limit) {
      return {
        ok: false,
        retryAfterMs: Math.max(0, (oldest ?? now) + windowMs - now),
      }
    }
    this.ctx.storage.sql.exec('INSERT INTO transcribed_page (ts) VALUES (?)', now)
    return { ok: true, remaining: limit - n - 1 }
  }

  // --- Allowances --------------------------------------------------------

  checkCredit(args: CheckCreditArgs): CheckCreditResult {
    const now = Date.now()
    const state = this.#creditState(args.hash)
    const decision = decideCredit({
      state,
      isRefinement: args.isRefinement,
      importLimit: args.importLimit,
      refinementLimit: args.refinementLimit,
      now,
      windowDurationMs: args.windowDurationMs,
    })
    const credits = computeCreditsSnapshot({
      state,
      isSupporter: args.isSupporter,
      importLimit: args.importLimit,
      refinementLimit: args.refinementLimit,
      now,
      windowDurationMs: args.windowDurationMs,
    })

    if (!decision.allowed) {
      const normalized = normalizeImportWindow(
        state.window,
        now,
        args.windowDurationMs
      )
      emitNotesImportOperationalEvent(
        allowanceDeniedEvent({
          objectId: this.ctx.id.toString(),
          kind:
            decision.reason === 'refinement_limit' ? 'refinement' : 'import',
          isSupporter: args.isSupporter,
          used:
            decision.reason === 'refinement_limit'
              ? state.record?.refinements ?? 0
              : normalized.count,
          limit:
            decision.reason === 'refinement_limit'
              ? args.refinementLimit
              : args.importLimit,
          resetsAt:
            decision.reason === 'limit_reached' ? credits.resetsAt : null,
        })
      )
    }

    return { decision, credits }
  }

  recordUsage(args: RecordUsageArgs): RecordUsageResult {
    const now = Date.now()
    const emptyWindowStart = now - args.emptyWindowSeconds * 1000
    const state = this.#creditState(args.hash)
    const commit = computeCommit({
      decision: args.decision,
      state,
      importLimit: args.importLimit,
      now,
      windowDurationMs: args.windowDurationMs,
      empty: {
        isEmpty: args.isEmpty,
        countInWindow: this.#countEmptyRuns(emptyWindowStart),
        limit: args.emptyWindowLimit,
      },
    })

    // Snapshot formatting can reject an unrepresentable reset timestamp. Do it
    // before any SQL mutation so bad runtime input cannot leave a charged hash
    // or window behind when no success response can be produced.
    const credits = computeCreditsSnapshot({
      state: commit.state,
      isSupporter: args.isSupporter,
      importLimit: args.importLimit,
      refinementLimit: args.refinementLimit,
      now,
      windowDurationMs: args.windowDurationMs,
    })

    if (commit.recordsEmptyRun) {
      this.#recordEmptyRun(now)
      this.#pruneEmptyRuns(emptyWindowStart)
    }
    if (
      commit.state.window.count !== state.window.count ||
      commit.state.window.startedAt !== state.window.startedAt
    ) {
      this.#setWindow(commit.state.window)
    }
    if (commit.state.record) this.#writeRecord(args.hash, commit.state.record)

    if (commit.rollover) {
      emitNotesImportOperationalEvent(
        windowRolledOverEvent({
          objectId: this.ctx.id.toString(),
          isSupporter: args.isSupporter,
          previousUsed: commit.rollover.previousCount,
          previousLimit: args.importLimit,
          previousResetsAt: commit.rollover.previousResetsAt,
          newResetsAt: commit.rollover.newResetsAt,
        })
      )
    }

    return { credits, emptyCharged: commit.emptyCharged }
  }

  kickoffCredits(args: KickoffCreditsArgs): CreditsSnapshot {
    const now = Date.now()
    return computeKickoffCredits({
      decision: args.decision,
      state: this.#creditState(args.hash),
      isSupporter: args.isSupporter,
      importLimit: args.importLimit,
      refinementLimit: args.refinementLimit,
      now,
      windowDurationMs: args.windowDurationMs,
    })
  }

  /**
   * The meter's current import allowance, for `GET /notes-import/usage`.
   * Read-only: it charges nothing, records no hash, touches no slot, and
   * emits no operational event.
   */
  usage(args: UsageArgs): ImportUsage {
    return computeImportUsage({
      window: this.#creditWindow(),
      importLimit: args.importLimit,
      now: Date.now(),
      windowDurationMs: args.windowDurationMs,
    })
  }

  /**
   * Clear only rolling usage and Empty Import grace. Permanent hash/refinement
   * records deliberately survive so old notes remain free to replay and retain
   * their lifetime refinement accounting.
   */
  resetUsage(): ResetUsageResult {
    const window = this.#creditWindow()
    const deletedEmptyRuns = this.#allEmptyRunCount()
    this.ctx.storage.sql.exec('DELETE FROM credit_meta')
    this.ctx.storage.sql.exec('DELETE FROM empty_run')
    this.ctx.storage.sql.exec('DELETE FROM transcribed_page')
    return {
      previousCount: window.count,
      hadActiveWindow: window.startedAt != null,
      deletedEmptyRuns,
    }
  }

  // --- Storage helpers ---------------------------------------------------

  #has(importId: string): boolean {
    return (
      this.ctx.storage.sql
        .exec<{ n: number }>(
          'SELECT COUNT(*) AS n FROM active WHERE importId = ?',
          importId
        )
        .one().n > 0
    )
  }

  #activeCount(): number {
    return this.ctx.storage.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM active')
      .one().n
  }

  #creditState(hash: string): CreditState {
    return { window: this.#creditWindow(), record: this.#record(hash) }
  }

  #creditWindow(): ImportWindow {
    const rows = this.ctx.storage.sql
      .exec<{ k: string; v: number }>(
        "SELECT k, v FROM credit_meta WHERE k IN ('count', 'windowStartedAt')"
      )
      .toArray()
    const values = new Map(rows.map((row) => [row.k, row.v]))
    const startedAt = values.get('windowStartedAt') ?? null
    // A count without an anchor is abandoned pre-window development data.
    return {
      count: startedAt == null ? 0 : values.get('count') ?? 0,
      startedAt,
    }
  }

  #setWindow(window: ImportWindow): void {
    if (window.startedAt == null) {
      this.ctx.storage.sql.exec(
        "DELETE FROM credit_meta WHERE k IN ('count', 'windowStartedAt')"
      )
      return
    }
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO credit_meta (k, v) VALUES ('count', ?), ('windowStartedAt', ?)",
      window.count,
      window.startedAt
    )
  }

  #record(hash: string): HashRecord | null {
    const rows = this.ctx.storage.sql
      .exec<{ charged: number; refinements: number }>(
        'SELECT charged, refinements FROM hash_record WHERE hash = ?',
        hash
      )
      .toArray()
    if (!rows.length) return null
    return { charged: rows[0].charged !== 0, refinements: rows[0].refinements }
  }

  #writeRecord(hash: string, record: HashRecord): void {
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO hash_record (hash, charged, refinements) VALUES (?, ?, ?)',
      hash,
      record.charged ? 1 : 0,
      record.refinements
    )
  }

  #countEmptyRuns(since: number): number {
    return this.ctx.storage.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM empty_run WHERE ts > ?', since)
      .one().n
  }

  #allEmptyRunCount(): number {
    return this.ctx.storage.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM empty_run')
      .one().n
  }

  #recordEmptyRun(ts: number): void {
    this.ctx.storage.sql.exec('INSERT INTO empty_run (ts) VALUES (?)', ts)
  }

  #pruneEmptyRuns(before: number): void {
    this.ctx.storage.sql.exec('DELETE FROM empty_run WHERE ts <= ?', before)
  }
}
