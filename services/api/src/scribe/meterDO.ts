import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import { windowLengthsMs, type ScribeLimits } from './config'
import {
  WINDOW_IDS,
  applyCharge,
  decideAdmission,
  emptyWindows,
  usageSnapshot,
  type WindowStates,
} from './meter'
import type { ScribePlan, UsageSnapshot, UsageWindowId } from './wire'

/**
 * One SQLite Durable Object per account (`idFromName(accountId)`): Scribe AI's
 * usage windows, step keys (60 min), open turns (`turnGraceMinutes`), active
 * steps, charges (31 days), and paper pages (24 hours). No content, no tool
 * names, no Refs (protocol: Logging and privacy).
 *
 * Every method is synchronous SQL, so the object's input gate runs each one
 * to completion before the next: admission (check windows, grace, step key,
 * active cap, then mark the step running) is atomic per account.
 */

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Idempotency keys are kept this long after their first attempt. */
export const STEP_KEY_TTL_MS = HOUR_MS
/** Attempts allowed per step key; the next is `step_retry_limit`. */
export const STEP_MAX_ATTEMPTS = 3
/** A step that never settled (evicted Worker) frees its slot after `stepTimeoutMs` + this. */
export const STALE_SLOT_GRACE_MS = 30_000
export const CHARGE_RETENTION_MS = 31 * DAY_MS
export const PAGE_WINDOW_MS = DAY_MS

/** Who is asking and under which limits; the Worker resolves both per request. */
export interface MeterContext {
  plan: ScribePlan
  supporterCheckFailed: boolean
  limits: ScribeLimits
  now: number
}

export interface AdmitStepArgs extends MeterContext {
  turnId: string
  step: number
}

export type AdmitStepResult =
  | { ok: true; slot: string; grace: boolean; snapshot: UsageSnapshot }
  | { ok: false; code: 'limit_reached'; snapshot: UsageSnapshot }
  | { ok: false; code: 'step_in_progress' | 'step_retry_limit' | 'active_cap' }

export interface SettleStepArgs extends MeterContext {
  turnId: string
  step: number
  units: number
}

export interface AdmitTranscribeArgs extends MeterContext {
  /** Pages per rolling day for this plan; -1 is unlimited. */
  pageLimit: number
}

export type AdmitTranscribeResult =
  | { ok: true; snapshot: UsageSnapshot }
  | { ok: false; code: 'limit_reached'; snapshot: UsageSnapshot }
  | { ok: false; code: 'transcribe_limit'; retryAfterMs: number }

export type AdmitCallResult =
  | { ok: true; snapshot: UsageSnapshot }
  | { ok: false; code: 'limit_reached'; snapshot: UsageSnapshot }

export interface ChargeArgs extends MeterContext {
  units: number
  kind: 'step' | 'transcribe' | 'territory_notes'
}

export interface ResetUsageResult {
  /** Units each window held (running windows only). */
  previous: Record<UsageWindowId, number>
}

type Row = Record<string, unknown>

/**
 * A `usage_window` row beside the three windows: `started_at` is the start of
 * the account's welcome weekly window (its first), so that window is known
 * for as long as it runs.
 */
const WELCOME_ROW = 'welcome'

export const slotOf = (turnId: string, step: number) => `${turnId}:${step}`

export class ScribeMeter extends DurableObject<Environment> {
  constructor(ctx: DurableObjectState, env: Environment) {
    super(ctx, env)
    const sql = ctx.storage.sql
    sql.exec(
      `CREATE TABLE IF NOT EXISTS usage_window (
         id         TEXT PRIMARY KEY,
         started_at INTEGER,
         used       INTEGER NOT NULL
       )`
    )
    sql.exec(
      `CREATE TABLE IF NOT EXISTS step_key (
         turn_id    TEXT NOT NULL,
         step       INTEGER NOT NULL,
         state      TEXT NOT NULL,
         attempts   INTEGER NOT NULL,
         created_at INTEGER NOT NULL,
         started_at INTEGER NOT NULL,
         PRIMARY KEY (turn_id, step)
       )`
    )
    sql.exec(
      `CREATE TABLE IF NOT EXISTS open_turn (
         turn_id   TEXT PRIMARY KEY,
         opened_at INTEGER NOT NULL
       )`
    )
    sql.exec(
      `CREATE TABLE IF NOT EXISTS active_step (
         slot       TEXT PRIMARY KEY,
         started_at INTEGER NOT NULL
       )`
    )
    sql.exec(
      `CREATE TABLE IF NOT EXISTS charge (
         at    INTEGER NOT NULL,
         units INTEGER NOT NULL,
         kind  TEXT NOT NULL
       )`
    )
    sql.exec(`CREATE TABLE IF NOT EXISTS page (at INTEGER NOT NULL)`)
  }

  // --- Steps ------------------------------------------------------------------

  /**
   * Admission for one step, in the protocol's order: windows (with turn
   * grace), the step key (running → `step_in_progress`, 3 attempts →
   * `step_retry_limit`), the active-step cap; then marks the key running,
   * takes a slot, and opens the turn at step 0.
   */
  admitStep(args: AdmitStepArgs): AdmitStepResult {
    const { turnId, step, now, limits } = args
    this.#prune(now, limits)
    const windows = this.#windows()
    const decision = decideAdmission({
      plan: args.plan,
      windows,
      limits,
      now,
      step,
      turnOpenedAt: this.#turnOpenedAt(turnId),
    })
    if (!decision.admitted) {
      return { ok: false, code: 'limit_reached', snapshot: this.#snapshot(args, windows) }
    }

    const key = this.#rows(
      'SELECT state, attempts FROM step_key WHERE turn_id = ? AND step = ?',
      turnId,
      step
    )[0]
    if (key?.state === 'running') return { ok: false, code: 'step_in_progress' }
    if (key && Number(key.attempts) >= STEP_MAX_ATTEMPTS)
      return { ok: false, code: 'step_retry_limit' }
    if (this.#activeCount() >= limits.activeStepCap)
      return { ok: false, code: 'active_cap' }

    const sql = this.ctx.storage.sql
    if (key) {
      sql.exec(
        `UPDATE step_key SET state = 'running', attempts = attempts + 1, started_at = ?
           WHERE turn_id = ? AND step = ?`,
        now,
        turnId,
        step
      )
    } else {
      sql.exec(
        `INSERT INTO step_key (turn_id, step, state, attempts, created_at, started_at)
           VALUES (?, ?, 'running', 1, ?, ?)`,
        turnId,
        step,
        now,
        now
      )
    }
    const slot = slotOf(turnId, step)
    sql.exec(
      'INSERT OR REPLACE INTO active_step (slot, started_at) VALUES (?, ?)',
      slot,
      now
    )
    if (step === 0)
      sql.exec(
        'INSERT OR IGNORE INTO open_turn (turn_id, opened_at) VALUES (?, ?)',
        turnId,
        now
      )
    return {
      ok: true,
      slot,
      grace: decision.grace,
      snapshot: this.#snapshot(args, windows),
    }
  }

  /**
   * Ends an admitted step: charges `units` to every window (starting any that
   * isn't running), frees its slot, and marks its key done. Returns the
   * snapshot the `done` (or charged `error`) event carries.
   */
  settleStep(args: SettleStepArgs): UsageSnapshot {
    const { turnId, step } = args
    const snapshot = this.#charge({ ...args, kind: 'step' })
    const sql = this.ctx.storage.sql
    sql.exec('DELETE FROM active_step WHERE slot = ?', slotOf(turnId, step))
    sql.exec(
      `UPDATE step_key SET state = 'done' WHERE turn_id = ? AND step = ?`,
      turnId,
      step
    )
    return snapshot
  }

  // --- Paper pages ------------------------------------------------------------

  /**
   * Transcribe's pre-flight: the meter (no turn grace), then the rolling-day
   * page ceiling. The page counts here, before the model runs.
   */
  admitTranscribe(args: AdmitTranscribeArgs): AdmitTranscribeResult {
    const { now, limits, pageLimit } = args
    this.#prune(now, limits)
    const windows = this.#windows()
    const decision = decideAdmission({
      plan: args.plan,
      windows,
      limits,
      now,
      step: 0,
      turnOpenedAt: null,
    })
    if (!decision.admitted)
      return { ok: false, code: 'limit_reached', snapshot: this.#snapshot(args, windows) }
    if (pageLimit !== -1) {
      const pages = this.#rows('SELECT at FROM page ORDER BY at ASC')
      if (pages.length >= pageLimit) {
        const oldest = pages.length ? Number(pages[0].at) : now
        return {
          ok: false,
          code: 'transcribe_limit',
          retryAfterMs: Math.max(1_000, oldest + PAGE_WINDOW_MS - now),
        }
      }
    }
    this.ctx.storage.sql.exec('INSERT INTO page (at) VALUES (?)', now)
    this.#scheduleCleanup(now)
    return { ok: true, snapshot: this.#snapshot(args, windows) }
  }

  /**
   * A one-shot call's pre-flight (territory notes): the usage windows only,
   * like a step 0 without turn grace. Charged afterwards through `charge`.
   */
  admitCall(args: MeterContext): AdmitCallResult {
    const { now, limits } = args
    this.#prune(now, limits)
    const windows = this.#windows()
    const decision = decideAdmission({
      plan: args.plan,
      windows,
      limits,
      now,
      step: 0,
      turnOpenedAt: null,
    })
    const snapshot = this.#snapshot(args, windows)
    return decision.admitted ? { ok: true, snapshot } : { ok: false, code: 'limit_reached', snapshot }
  }

  /** Charges a call outside a step (a transcribed page, territory notes). */
  charge(args: ChargeArgs): UsageSnapshot {
    return this.#charge(args)
  }

  // --- Reads and maintenance --------------------------------------------------

  /** The snapshot `GET /scribe/v1/usage` answers. Read-only: never starts a window. */
  usage(args: MeterContext): UsageSnapshot {
    return this.#snapshot(args, this.#windows())
  }

  /** Admin reset: every window back to unused, and the day's pages. */
  resetUsage(now: number = Date.now()): ResetUsageResult {
    const windows = this.#windows()
    const previous = Object.fromEntries(
      WINDOW_IDS.map((id) => [id, windows[id].startedAt == null ? 0 : windows[id].used])
    ) as Record<UsageWindowId, number>
    const sql = this.ctx.storage.sql
    sql.exec('DELETE FROM usage_window')
    sql.exec('DELETE FROM page')
    sql.exec('DELETE FROM open_turn')
    this.#scheduleCleanup(now)
    return { previous }
  }

  /**
   * Fires 31 days after the last charge: by then every window has ended and
   * every charge has aged out, so the whole object is deleted.
   */
  async alarm(): Promise<void> {
    const now = Date.now()
    const newest = this.#rows('SELECT MAX(at) AS at FROM charge')[0]?.at
    const last = Math.max(
      Number(newest ?? 0),
      ...this.#rows('SELECT started_at FROM usage_window').map((row) =>
        Number(row.started_at ?? 0)
      ),
      ...this.#rows('SELECT at FROM page').map((row) => Number(row.at))
    )
    if (now - last >= CHARGE_RETENTION_MS && this.#activeCount() === 0) {
      await this.ctx.storage.deleteAll()
      return
    }
    await this.ctx.storage.setAlarm(last + CHARGE_RETENTION_MS)
  }

  // --- Internals ----------------------------------------------------------------

  #charge(args: ChargeArgs): UsageSnapshot {
    const { now, limits, units, kind } = args
    const windows = applyCharge(this.#windows(), units, now, windowLengthsMs(limits))
    const sql = this.ctx.storage.sql
    if (units > 0) {
      const upsert = (id: string, startedAt: number | null, used: number) =>
        sql.exec(
          `INSERT INTO usage_window (id, started_at, used) VALUES (?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET started_at = excluded.started_at, used = excluded.used`,
          id,
          startedAt,
          used
        )
      for (const id of WINDOW_IDS) upsert(id, windows[id].startedAt, windows[id].used)
      if (windows.weekly.welcome) upsert(WELCOME_ROW, windows.weekly.startedAt, 0)
      sql.exec('INSERT INTO charge (at, units, kind) VALUES (?, ?, ?)', now, units, kind)
      this.#scheduleCleanup(now)
    }
    sql.exec('DELETE FROM charge WHERE at <= ?', now - CHARGE_RETENTION_MS)
    return this.#snapshot(args, windows)
  }

  #snapshot(context: MeterContext, windows: WindowStates): UsageSnapshot {
    return usageSnapshot({
      plan: context.plan,
      supporterCheckFailed: context.supporterCheckFailed,
      windows,
      limits: context.limits,
      now: context.now,
    })
  }

  #windows(): WindowStates {
    const windows = emptyWindows()
    let welcomeStartedAt: number | null = null
    for (const row of this.#rows('SELECT id, started_at, used FROM usage_window')) {
      if (row.id === WELCOME_ROW) {
        welcomeStartedAt = row.started_at == null ? null : Number(row.started_at)
        continue
      }
      const id = row.id as UsageWindowId
      if (!WINDOW_IDS.includes(id)) continue
      windows[id] = {
        startedAt: row.started_at == null ? null : Number(row.started_at),
        used: Number(row.used),
      }
    }
    if (welcomeStartedAt != null && windows.weekly.startedAt === welcomeStartedAt)
      windows.weekly.welcome = true
    return windows
  }

  #turnOpenedAt(turnId: string): number | null {
    const row = this.#rows('SELECT opened_at FROM open_turn WHERE turn_id = ?', turnId)[0]
    return row ? Number(row.opened_at) : null
  }

  #activeCount(): number {
    return Number(this.#rows('SELECT COUNT(*) AS n FROM active_step')[0]?.n ?? 0)
  }

  /**
   * Drops expired rows: step keys after an hour, open turns after the grace,
   * pages after a day, and slots whose step never settled after
   * `stepTimeoutMs` + 30 s (their keys stop counting as running).
   */
  #prune(now: number, limits: ScribeLimits): void {
    const sql = this.ctx.storage.sql
    const staleBefore = now - (limits.stepTimeoutMs + STALE_SLOT_GRACE_MS)
    for (const row of this.#rows(
      'SELECT slot FROM active_step WHERE started_at <= ?',
      staleBefore
    )) {
      const slot = String(row.slot)
      const split = slot.lastIndexOf(':')
      sql.exec('DELETE FROM active_step WHERE slot = ?', slot)
      sql.exec(
        `UPDATE step_key SET state = 'abandoned'
           WHERE turn_id = ? AND step = ? AND state = 'running'`,
        slot.slice(0, split),
        Number(slot.slice(split + 1))
      )
    }
    sql.exec('DELETE FROM step_key WHERE created_at <= ?', now - STEP_KEY_TTL_MS)
    sql.exec(
      'DELETE FROM open_turn WHERE opened_at < ?',
      now - limits.turnGraceMinutes * MINUTE_MS
    )
    sql.exec('DELETE FROM page WHERE at <= ?', now - PAGE_WINDOW_MS)
  }

  #scheduleCleanup(now: number): void {
    void this.ctx.storage.setAlarm(now + CHARGE_RETENTION_MS)
  }

  #rows(query: string, ...bindings: unknown[]): Row[] {
    return this.ctx.storage.sql.exec(query, ...bindings).toArray() as Row[]
  }
}
