import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import { sha256B64u, timingSafeEqual, tokenDigest } from '../crypto'
import {
  fail,
  ok,
  type BuddiesFailure,
  type BuddiesResult,
} from '../buddies/contracts'
import { ACCOUNT_LIMITS } from './contracts'

/**
 * A channel's state (witness-work `docs/accounts-protocol.md`, "Handoff"):
 * `open` → `claimed` (a new phone answered) → `sent` (the old phone sent the
 * sealed key) → `done` (the new phone picked it up). `cancelled` from any of
 * them, by either phone or by five wrong claim tokens.
 */
export type HandoffStatus = 'open' | 'claimed' | 'sent' | 'done' | 'cancelled'

type Empty = Record<string, never>

export interface OpenHandoffArgs {
  channelId: string
  accountId: string
  verifier: string
}

export interface ClaimHandoffArgs {
  channelId: string
  claimToken: string
  claimPub: string
  hello: string
}

export interface HandoffTokenArgs {
  channelId: string
  claimToken: string
}

export interface HandoffStatusView {
  status: HandoffStatus
  expiresAt: number
  claimPub?: string
  hello?: string
}

export interface HandoffReceiveView {
  status: HandoffStatus
  key?: string
}

type ChannelRow = {
  channelId: string
  accountId: string
  verifier: string
  status: HandoffStatus
  expiresAt: number
  badTokens: number
  claimPub: string | null
  hello: string | null
  claimHash: string | null
  key: string | null
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS channel (
  singleton  INTEGER PRIMARY KEY CHECK (singleton = 1),
  channel_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  verifier   TEXT NOT NULL,
  status     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  bad_tokens INTEGER NOT NULL,
  claim_pub  TEXT,
  hello      TEXT,
  claim_hash TEXT,
  key        TEXT
)`

/**
 * One SQLite Durable Object per handoff `channelId`: the opening account,
 * the claim token's verifier, the new phone's temporary public key, and two
 * sealed blobs (hello and key), for at most ten minutes from `open`. The
 * alarm at `expiresAt` deletes everything. `done` and `cancel` drop the
 * blobs and the claim key at once and keep only the status until then.
 *
 * Single-threaded and nothing awaits between a read and its write, so the
 * first valid claim wins. A repeat of the winning claim with the same body
 * gets `ok` again (a lost response); any other claim is `conflict`.
 *
 * Privacy: nothing here logs ids, keys, tokens, or blobs.
 */
export class AccountHandoff extends DurableObject<Environment> {
  #schemaReady = false

  async open(args: OpenHandoffArgs): Promise<BuddiesResult<{ expiresAt: number }>> {
    const now = Date.now()
    const existing = this.#load()
    if (existing && now < existing.expiresAt) return fail('conflict')
    if (existing || this.#ready()) await this.#destroy()
    const expiresAt = now + ACCOUNT_LIMITS.handoffLifetimeMs
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(SCHEMA)
      this.#schemaReady = true
      this.ctx.storage.sql.exec(
        `INSERT INTO channel (singleton, channel_id, account_id, verifier, status,
                              created_at, expires_at, bad_tokens)
         VALUES (1, ?, ?, ?, 'open', ?, ?, 0)`,
        args.channelId,
        args.accountId,
        args.verifier,
        now,
        expiresAt
      )
    })
    await this.ctx.storage.setAlarm(expiresAt)
    return ok({ expiresAt })
  }

  /** The old phone's view; only the opening account may read it. */
  status(
    channelId: string,
    accountId: string
  ): BuddiesResult<HandoffStatusView> {
    const channel = this.#live(channelId, Date.now())
    if (!channel) return fail('not_found')
    if (channel.accountId !== accountId) return fail('forbidden')
    return ok({
      status: channel.status,
      expiresAt: channel.expiresAt,
      ...(channel.claimPub != null ? { claimPub: channel.claimPub } : {}),
      ...(channel.hello != null ? { hello: channel.hello } : {}),
    })
  }

  async claim(
    args: ClaimHandoffArgs
  ): Promise<BuddiesResult<{ expiresAt: number }>> {
    // Hashed before reading the channel: from the read through marking it
    // claimed, nothing may await, or two claims could both see `open`.
    const [tokenHash, claimHash] = await Promise.all([
      tokenDigest(args.claimToken),
      sha256B64u(`${args.claimPub}\n${args.hello}`),
    ])
    const channel = this.#live(args.channelId, Date.now())
    if (!channel) return fail('not_found')
    const refused = this.#checkToken(channel, tokenHash)
    if (refused) return refused

    if (channel.status !== 'open') {
      const repeat =
        channel.claimHash != null &&
        channel.status !== 'cancelled' &&
        timingSafeEqual(claimHash, channel.claimHash)
      return repeat ? ok({ expiresAt: channel.expiresAt }) : fail('conflict')
    }
    this.ctx.storage.sql.exec(
      `UPDATE channel SET status = 'claimed', claim_pub = ?, hello = ?, claim_hash = ?
       WHERE singleton = 1`,
      args.claimPub,
      args.hello,
      claimHash
    )
    return ok({ expiresAt: channel.expiresAt })
  }

  /** The old phone sends the sealed key, only while `claimed`. */
  send(
    channelId: string,
    accountId: string,
    key: string
  ): BuddiesResult<Empty> {
    const channel = this.#live(channelId, Date.now())
    if (!channel) return fail('not_found')
    if (channel.accountId !== accountId) return fail('forbidden')
    if (channel.status !== 'claimed') return fail('conflict')
    this.ctx.storage.sql.exec(
      "UPDATE channel SET status = 'sent', key = ? WHERE singleton = 1",
      key
    )
    return ok({})
  }

  /** The new phone polls for the key. */
  async receive(
    args: HandoffTokenArgs
  ): Promise<BuddiesResult<HandoffReceiveView>> {
    const tokenHash = await tokenDigest(args.claimToken)
    const channel = this.#live(args.channelId, Date.now())
    if (!channel) return fail('not_found')
    const refused = this.#checkToken(channel, tokenHash)
    if (refused) return refused
    return ok({
      status: channel.status,
      ...(channel.status === 'sent' && channel.key != null
        ? { key: channel.key }
        : {}),
    })
  }

  /** The new phone has the key: drop the blobs. Repeating it is `ok`. */
  async done(args: HandoffTokenArgs): Promise<BuddiesResult<Empty>> {
    const tokenHash = await tokenDigest(args.claimToken)
    const channel = this.#live(args.channelId, Date.now())
    if (!channel) return fail('not_found')
    const refused = this.#checkToken(channel, tokenHash)
    if (refused) return refused
    if (channel.status === 'done') return ok({})
    if (channel.status !== 'sent') return fail('conflict')
    this.#finish('done')
    return ok({})
  }

  /** Either phone ends the channel; idempotent, and a no-op once `done`. */
  cancelByAccount(
    channelId: string,
    accountId: string
  ): BuddiesResult<Empty> {
    const channel = this.#live(channelId, Date.now())
    if (!channel) return fail('not_found')
    if (channel.accountId !== accountId) return fail('forbidden')
    if (channel.status !== 'done') this.#finish('cancelled')
    return ok({})
  }

  async cancelByToken(args: HandoffTokenArgs): Promise<BuddiesResult<Empty>> {
    const tokenHash = await tokenDigest(args.claimToken)
    const channel = this.#live(args.channelId, Date.now())
    if (!channel) return fail('not_found')
    const refused = this.#checkToken(channel, tokenHash)
    if (refused) return refused
    if (channel.status !== 'done') this.#finish('cancelled')
    return ok({})
  }

  /** Deletes the channel at `expiresAt`. */
  async alarm(): Promise<void> {
    const channel = this.#load()
    if (!channel || Date.now() >= channel.expiresAt) {
      await this.#destroy()
      return
    }
    await this.ctx.storage.setAlarm(channel.expiresAt)
  }

  /**
   * Null when the token's hash matches the verifier. Otherwise counts it, and
   * the fifth wrong one burns the channel (`cancelled`, blobs dropped).
   */
  #checkToken(channel: ChannelRow, tokenHash: string): BuddiesFailure | null {
    if (timingSafeEqual(tokenHash, channel.verifier)) return null
    if (channel.status !== 'cancelled') {
      if (channel.badTokens + 1 >= ACCOUNT_LIMITS.handoffBadTokens) {
        this.#finish('cancelled')
      }
      this.ctx.storage.sql.exec(
        'UPDATE channel SET bad_tokens = bad_tokens + 1 WHERE singleton = 1'
      )
    }
    return fail('bad_signature')
  }

  /** Ends the channel: keeps the status until the alarm, nothing else. */
  #finish(status: 'done' | 'cancelled'): void {
    this.ctx.storage.sql.exec(
      `UPDATE channel SET status = ?, claim_pub = NULL, hello = NULL, key = NULL
       WHERE singleton = 1`,
      status
    )
  }

  #ready(): boolean {
    if (this.#schemaReady) return true
    this.#schemaReady =
      this.ctx.storage.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'channel'"
        )
        .toArray().length > 0
    return this.#schemaReady
  }

  #load(): ChannelRow | null {
    if (!this.#ready()) return null
    return (
      this.ctx.storage.sql
        .exec<ChannelRow>(
          `SELECT channel_id AS channelId, account_id AS accountId, verifier, status,
                  expires_at AS expiresAt, bad_tokens AS badTokens,
                  claim_pub AS claimPub, hello, claim_hash AS claimHash, key
           FROM channel WHERE singleton = 1`
        )
        .toArray()[0] ?? null
    )
  }

  /** Expired and unknown channels are both `not_found`. */
  #live(channelId: string, now: number): ChannelRow | null {
    const channel = this.#load()
    return channel && channel.channelId === channelId && now < channel.expiresAt
      ? channel
      : null
  }

  async #destroy(): Promise<void> {
    await this.ctx.storage.deleteAll()
    // Before compatibility date 2026-02-24, deleteAll() keeps the alarm.
    await this.ctx.storage.deleteAlarm()
    this.#schemaReady = false
  }
}
