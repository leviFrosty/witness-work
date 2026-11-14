import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

export interface ConsumeArgs {
  nowMs: number
  dailyLimit: number
  minuteLimit: number
}

export type ConsumeResult =
  | { allowed: true; remainingToday: number }
  | {
      allowed: false
      reason: 'daily' | 'minute'
      retryAfterSeconds: number
      remainingToday: number
    }

const SCHEMA = 'CREATE TABLE IF NOT EXISTS optimization (at INTEGER NOT NULL)'

/**
 * One SQLite Durable Object per caller and limit: the timestamps of its
 * charged calls in the last 24 hours, and nothing else. Route optimizations
 * (`account:<id>`), directions (`directions:account:<id>`), and MapKit JS
 * tokens (`mapkit-token:account:<id>`, src/maps/route.ts) each count in their
 * own instance; the table keeps its first user's name. Single-threaded, so the
 * check and the charge can't race. Every allowed call is charged before HERE is
 * asked, whether or not HERE then finds a route.
 */
export class RoutePlanningQuota extends DurableObject<Environment> {
  #schemaReady = false

  async consume(args: ConsumeArgs): Promise<ConsumeResult> {
    const { nowMs, dailyLimit, minuteLimit } = args
    const result = this.ctx.storage.transactionSync((): ConsumeResult => {
      this.#ensureSchema()
      const times = this.#prune(nowMs)
      const lastMinute = times.filter((at) => at > nowMs - MINUTE_MS)
      const remaining = Math.max(0, dailyLimit - times.length)

      // The oldest event that must age out before another call fits.
      if (times.length >= dailyLimit) {
        const frees = times[times.length - dailyLimit]! + DAY_MS
        return deny('daily', frees - nowMs, remaining)
      }
      if (lastMinute.length >= minuteLimit) {
        const frees = lastMinute[lastMinute.length - minuteLimit]! + MINUTE_MS
        return deny('minute', frees - nowMs, remaining)
      }
      this.ctx.storage.sql.exec(
        'INSERT INTO optimization (at) VALUES (?)',
        nowMs
      )
      return { allowed: true, remainingToday: remaining - 1 }
    })
    // Forget the account once its newest optimization is a day old.
    if (result.allowed) await this.ctx.storage.setAlarm(nowMs + DAY_MS)
    return result
  }

  async alarm(): Promise<void> {
    const nowMs = Date.now()
    const times = this.#ready() ? this.#prune(nowMs) : []
    if (times.length === 0) {
      await this.ctx.storage.deleteAll()
      this.#schemaReady = false
      return
    }
    await this.ctx.storage.setAlarm(times[times.length - 1]! + DAY_MS)
  }

  /** Drops events older than a day; returns the rest, oldest first. */
  #prune(nowMs: number): number[] {
    this.ctx.storage.sql.exec(
      'DELETE FROM optimization WHERE at <= ?',
      nowMs - DAY_MS
    )
    return this.ctx.storage.sql
      .exec<{ at: number }>('SELECT at FROM optimization ORDER BY at')
      .toArray()
      .map((row) => Number(row.at))
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
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'optimization'"
        )
        .toArray().length > 0
    return this.#schemaReady
  }
}

const deny = (
  reason: 'daily' | 'minute',
  waitMs: number,
  remainingToday: number
): ConsumeResult => ({
  allowed: false,
  reason,
  retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
  remainingToday,
})
