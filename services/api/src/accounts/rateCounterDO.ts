import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'

/**
 * Rolling-window counters for the accounts routes, one SQLite Durable Object
 * per name (an HMAC of the caller's IP for passkey sign-in failures;
 * src/accounts/rateCounter.ts). Each counter is a key with its own limit and
 * window, counted in 24 buckets
 * per window, so the window rolls in steps of a twenty-fourth. Single-threaded
 * with no await between a read and its write, so `take` checks and counts
 * every key at once: all or nothing. Rows are deleted once they leave their
 * window, and the object deletes itself when none are left.
 *
 * Holds keys (HMACs, never an IP) and counts, nothing else.
 */

export interface CounterLimit {
  key: string
  limit: number
  windowMs: number
  /**
   * Keys whose counts in the window add to this one's, without being
   * counted: the same caller under yesterday's name, when names are HMACs
   * under a key that rotates daily.
   */
  alsoCount?: string[]
}

export type CounterAdmission =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number }

const BUCKETS_PER_WINDOW = 24

const SCHEMA = `CREATE TABLE IF NOT EXISTS hits (
  key        TEXT NOT NULL,
  bucket     INTEGER NOT NULL,
  n          INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (key, bucket)
)`

const bucketMs = (windowMs: number): number =>
  Math.max(1, Math.floor(windowMs / BUCKETS_PER_WINDOW))

export class AccountRateCounter extends DurableObject<Environment> {
  #schemaReady = false

  /** Whether every key is under its limit, without counting. */
  peek(now: number, limits: CounterLimit[]): CounterAdmission {
    if (!this.#ready()) return { ok: true }
    return this.#check(now, limits)
  }

  /** Counts one against every key if all are under their limits. */
  async take(now: number, limits: CounterLimit[]): Promise<CounterAdmission> {
    const result = this.ctx.storage.transactionSync((): CounterAdmission => {
      this.#ensureSchema()
      const checked = this.#check(now, limits)
      if (!checked.ok) return checked
      for (const { key, windowMs } of limits) {
        const size = bucketMs(windowMs)
        const bucket = Math.floor(now / size)
        this.ctx.storage.sql.exec(
          `INSERT INTO hits (key, bucket, n, expires_at) VALUES (?, ?, 1, ?)
           ON CONFLICT (key, bucket) DO UPDATE SET n = n + 1`,
          key,
          bucket,
          (bucket + 1) * size + windowMs
        )
      }
      return { ok: true }
    })
    if (result.ok) await this.#scheduleAlarm()
    return result
  }

  /** Gives back what a `take` at `takenAt` counted for these keys. */
  refund(takenAt: number, limits: CounterLimit[]): void {
    if (!this.#ready()) return
    for (const { key, windowMs } of limits) {
      this.ctx.storage.sql.exec(
        'UPDATE hits SET n = n - 1 WHERE key = ? AND bucket = ? AND n > 0',
        key,
        Math.floor(takenAt / bucketMs(windowMs))
      )
    }
  }

  async alarm(): Promise<void> {
    if (!this.#ready()) return
    this.ctx.storage.sql.exec('DELETE FROM hits WHERE expires_at <= ?', Date.now())
    const left = this.ctx.storage.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM hits')
      .one().n
    if (left === 0) {
      await this.ctx.storage.deleteAll()
      await this.ctx.storage.deleteAlarm()
      this.#schemaReady = false
      return
    }
    await this.#scheduleAlarm()
  }

  #check(now: number, limits: CounterLimit[]): CounterAdmission {
    let wait = 0
    for (const { key, limit, windowMs, alsoCount = [] } of limits) {
      const size = bucketMs(windowMs)
      const first = Math.floor((now - windowMs) / size) + 1
      const keys = [key, ...alsoCount]
      const rows = this.ctx.storage.sql
        .exec<{ bucket: number; n: number }>(
          `SELECT bucket, SUM(n) AS n FROM hits
           WHERE key IN (${keys.map(() => '?').join(', ')}) AND bucket >= ?
           GROUP BY bucket ORDER BY bucket`,
          ...keys,
          first
        )
        .toArray()
      let counted = rows.reduce((sum, row) => sum + row.n, 0)
      if (counted < limit) continue
      // Wait for enough of the oldest buckets to leave the window: bucket
      // `b` counts while `now < b * size + windowMs`, never longer than the
      // window from now.
      for (const row of rows) {
        counted -= row.n
        if (counted < limit) {
          const frees = Math.min(row.bucket * size + windowMs, now + windowMs)
          wait = Math.max(wait, Math.ceil((frees - now) / 1_000))
          break
        }
      }
    }
    return wait > 0 ? { ok: false, retryAfterSeconds: Math.max(1, wait) } : { ok: true }
  }

  async #scheduleAlarm(): Promise<void> {
    const next = this.ctx.storage.sql
      .exec<{ at: number | null }>('SELECT MIN(expires_at) AS at FROM hits')
      .one().at
    if (next != null) await this.ctx.storage.setAlarm(next)
  }

  #ensureSchema(): void {
    if (this.#schemaReady) return
    this.ctx.storage.sql.exec(SCHEMA)
    this.#schemaReady = true
  }

  #ready(): boolean {
    if (this.#schemaReady) return true
    this.#schemaReady =
      this.ctx.storage.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hits'"
        )
        .toArray().length > 0
    return this.#schemaReady
  }
}
