import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import { BUDDIES_ABUSE_LIMITS as ABUSE, rollingWindowWaitMs } from './limits'

const HOUR_MS = 60 * 60 * 1_000
/** The rolling window, counted in whole hours. */
const WINDOW_HOURS = Math.round(ABUSE.registrationWindowMs / HOUR_MS)

export type RegistrationAdmission =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number }

const SCHEMA = `CREATE TABLE IF NOT EXISTS registration (
  hour INTEGER PRIMARY KEY,
  n    INTEGER NOT NULL
)`

type Bucket = { hour: number; n: number }

/**
 * One SQLite Durable Object per caller (a hash of its caller key: the client
 * IP, IPv6 by /64, or a bearer request's hashed account; `limits.ts`):
 * how many validly signed `inbox/register` calls it made in each hour of the
 * last day, and nothing else. Single-threaded, so the check and the count
 * can't race. It deletes itself once its newest hour leaves the window.
 *
 * Other rolling-day quotas reuse the class under their own hashed names with
 * their own `limit` (accounts: `handoff/open` per account).
 */
export class BuddyRegistrationQuota extends DurableObject<Environment> {
  #schemaReady = false

  async admit(
    now: number,
    limit: number = ABUSE.registrationsPerDay
  ): Promise<RegistrationAdmission> {
    const hour = Math.floor(now / HOUR_MS)
    const result = this.ctx.storage.transactionSync(
      (): RegistrationAdmission => {
        this.#ensureSchema()
        // Past the limit, wait for enough of the oldest hours to leave the window.
        const waitMs = rollingWindowWaitMs(
          this.#prune(hour).map((bucket) => ({
            start: bucket.hour * HOUR_MS,
            count: bucket.n,
          })),
          1,
          limit,
          WINDOW_HOURS * HOUR_MS,
          now
        )
        if (waitMs != null)
          return {
            ok: false,
            retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
          }
        this.ctx.storage.sql.exec(
          `INSERT INTO registration (hour, n) VALUES (?, 1)
           ON CONFLICT (hour) DO UPDATE SET n = n + 1`,
          hour
        )
        return { ok: true }
      }
    )
    if (result.ok)
      await this.ctx.storage.setAlarm((hour + WINDOW_HOURS) * HOUR_MS)
    return result
  }

  async alarm(): Promise<void> {
    const hour = Math.floor(Date.now() / HOUR_MS)
    const buckets = this.#ready() ? this.#prune(hour) : []
    if (buckets.length === 0) {
      await this.ctx.storage.deleteAll()
      this.#schemaReady = false
      return
    }
    const newest = buckets[buckets.length - 1].hour
    await this.ctx.storage.setAlarm((newest + WINDOW_HOURS) * HOUR_MS)
  }

  /** Drops hours outside the window; returns the rest, oldest first. */
  #prune(hour: number): Bucket[] {
    this.ctx.storage.sql.exec(
      'DELETE FROM registration WHERE hour <= ?',
      hour - WINDOW_HOURS
    )
    return this.ctx.storage.sql
      .exec<Bucket>('SELECT hour, n FROM registration ORDER BY hour')
      .toArray()
      .map((row) => ({ hour: Number(row.hour), n: Number(row.n) }))
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
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'registration'"
        )
        .toArray().length > 0
    return this.#schemaReady
  }
}
