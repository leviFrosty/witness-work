import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import { bytesToBase64Url, sha256Bytes, timingSafeEqual } from '../crypto'
import {
  BUDDIES_LIMITS as LIMITS,
  fail,
  ok,
  type BuddiesResult,
  type InviteView,
  type PushJob,
} from './contracts'
import type { ClaimDelivery } from './inboxDO'

type Empty = Record<string, never>

export interface CreateInviteArgs {
  inviteId: string
  creatorInboxId: string
  /** Canonical b64u of SHA-256(claimSecret). */
  claimVerifier: string
  blob: string
  expiresAt: number
}

export interface ClaimInviteArgs {
  inviteId: string
  /** Canonical b64u of SHA-256(claimSecret), computed by the Worker. */
  claimHash: string
  blob: string
}

type InviteRow = {
  inviteId: string
  creatorInboxId: string
  claimVerifier: string
  blob: string
  expiresAt: number
  status: 'open' | 'claimed'
  badClaims: number
  /**
   * b64u SHA-256 of the delivered claim's blob. Null until delivery succeeds,
   * and on invites claimed before it was kept.
   */
  claimBlobHash: string | null
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS invite (
  singleton        INTEGER PRIMARY KEY CHECK (singleton = 1),
  invite_id        TEXT NOT NULL,
  creator_inbox_id TEXT NOT NULL,
  claim_verifier   TEXT NOT NULL,
  blob             TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  status           TEXT NOT NULL,
  bad_claims       INTEGER NOT NULL,
  claimed_at       INTEGER,
  claim_blob_hash  TEXT
)`

/**
 * One SQLite Durable Object per `inviteId`: the encrypted invite card, the
 * claim verifier, and the `inviteId → creator inboxId` link, kept only until
 * the invite is deleted, burned, or expires (then `deleteAll()`).
 *
 * The creator's `BuddyInbox` owns the caps and reserves a spot before calling
 * `create`. A successful claim is marked here synchronously (first claim wins),
 * then delivered to the creator inbox as its `invite.claimed` event.
 *
 * Claims are idempotent for the winner: a retry with the same secret and the
 * same claim blob (a client whose response was lost resends its request
 * unchanged) gets the original `ok` again, without a second event or push.
 * Anyone else, including the same person re-sealing a fresh blob, still gets
 * `conflict`.
 */
export class BuddyInvite extends DurableObject<Environment> {
  #schemaReady = false

  async create(args: CreateInviteArgs): Promise<BuddiesResult<Empty>> {
    if (this.#load()) return fail('conflict')
    const now = Date.now()
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(SCHEMA)
      this.#schemaReady = true
      this.ctx.storage.sql.exec(
        `INSERT INTO invite (singleton, invite_id, creator_inbox_id, claim_verifier, blob,
                             created_at, expires_at, status, bad_claims)
         VALUES (1, ?, ?, ?, ?, ?, ?, 'open', 0)`,
        args.inviteId,
        args.creatorInboxId,
        args.claimVerifier,
        args.blob,
        now,
        args.expiresAt
      )
    })
    await this.ctx.storage.setAlarm(args.expiresAt + LIMITS.inviteGraceMs)
    return ok({})
  }

  read(inviteId: string): BuddiesResult<InviteView> {
    const invite = this.#live(inviteId, Date.now())
    if (!invite) return fail('not_found')
    return ok({
      blob: invite.blob,
      expiresAt: invite.expiresAt,
      status: invite.status,
    })
  }

  async claim(
    args: ClaimInviteArgs
  ): Promise<BuddiesResult<{ push: PushJob | null }>> {
    // Hashed before reading the invite: from the read through marking it
    // claimed below, nothing may await, or two claims could both see `open`.
    const blobHash = await blobDigest(args.blob)
    const now = Date.now()
    const invite = this.#live(args.inviteId, now)
    if (!invite) return fail('not_found')
    if (invite.status !== 'open') {
      // Wrong secrets here count nothing: a claimed invite can't be burned.
      return invite.claimBlobHash != null &&
        timingSafeEqual(args.claimHash, invite.claimVerifier) &&
        timingSafeEqual(blobHash, invite.claimBlobHash)
        ? ok({ push: null })
        : fail('conflict')
    }

    if (!timingSafeEqual(args.claimHash, invite.claimVerifier)) {
      if (invite.badClaims + 1 >= LIMITS.badClaims) {
        await this.#destroy()
        await this.#forgetAtCreator(invite)
      } else {
        this.ctx.storage.sql.exec(
          'UPDATE invite SET bad_claims = bad_claims + 1 WHERE singleton = 1'
        )
      }
      return fail('bad_signature')
    }

    // First valid claim wins: marked before the await, so a concurrent claim
    // sees `claimed` and gets `conflict`.
    this.ctx.storage.sql.exec(
      "UPDATE invite SET status = 'claimed', claimed_at = ? WHERE singleton = 1",
      now
    )
    let delivery: ClaimDelivery
    try {
      delivery = await this.#creator(invite).recordClaim({
        inboxId: invite.creatorInboxId,
        inviteId: invite.inviteId,
        blob: args.blob,
      })
    } catch (error) {
      this.#reopen(now)
      throw error
    }
    if (delivery.status === 'gone') {
      await this.#destroy()
      return fail('not_found')
    }
    if (delivery.status === 'claimed_elsewhere') return fail('conflict')
    // Only a delivered claim is repeatable: a retry while delivery is still in
    // flight (or after it failed and reopened) can't be told it succeeded.
    if (this.#ready()) {
      this.ctx.storage.sql.exec(
        'UPDATE invite SET claim_blob_hash = ? WHERE singleton = 1 AND claimed_at = ?',
        blobHash,
        now
      )
    }
    return ok({ push: delivery.push })
  }

  /** Idempotent; only the creating inbox may delete. */
  async deleteByCreator(creatorInboxId: string): Promise<BuddiesResult<Empty>> {
    const invite = this.#load()
    if (invite && invite.creatorInboxId === creatorInboxId)
      await this.#destroy()
    return ok({})
  }

  /** Deletes the invite at `expiresAt` plus a short grace. */
  async alarm(): Promise<void> {
    const invite = this.#load()
    if (!invite) {
      if (this.#ready()) await this.#destroy()
      return
    }
    const deleteAt = invite.expiresAt + LIMITS.inviteGraceMs
    if (Date.now() >= deleteAt) {
      await this.#destroy()
      return
    }
    await this.ctx.storage.setAlarm(deleteAt)
  }

  #ready(): boolean {
    if (this.#schemaReady) return true
    this.#schemaReady =
      this.ctx.storage.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invite'"
        )
        .toArray().length > 0
    // Invites from before idempotent claims gain the column in place.
    if (this.#schemaReady && !this.#hasClaimBlobHash()) {
      this.ctx.storage.sql.exec(
        'ALTER TABLE invite ADD COLUMN claim_blob_hash TEXT'
      )
    }
    return this.#schemaReady
  }

  #hasClaimBlobHash(): boolean {
    return this.ctx.storage.sql
      .exec<{ name: string }>('PRAGMA table_info(invite)')
      .toArray()
      .some((row) => row.name === 'claim_blob_hash')
  }

  #load(): InviteRow | null {
    if (!this.#ready()) return null
    return (
      this.ctx.storage.sql
        .exec<InviteRow>(
          `SELECT invite_id AS inviteId, creator_inbox_id AS creatorInboxId,
                  claim_verifier AS claimVerifier, blob, expires_at AS expiresAt,
                  status, bad_claims AS badClaims, claim_blob_hash AS claimBlobHash
           FROM invite WHERE singleton = 1`
        )
        .toArray()[0] ?? null
    )
  }

  /** Expired, deleted, and burned invites are all `not_found`. */
  #live(inviteId: string, now: number): InviteRow | null {
    const invite = this.#load()
    return invite && invite.inviteId === inviteId && now < invite.expiresAt
      ? invite
      : null
  }

  /** Undo a claim whose delivery failed, unless the invite changed meanwhile. */
  #reopen(claimedAt: number): void {
    if (!this.#ready()) return
    this.ctx.storage.sql.exec(
      `UPDATE invite SET status = 'open', claimed_at = NULL
       WHERE singleton = 1 AND status = 'claimed' AND claimed_at = ?`,
      claimedAt
    )
  }

  #creator(invite: InviteRow) {
    return this.env.BUDDY_INBOX.get(
      this.env.BUDDY_INBOX.idFromName(invite.creatorInboxId)
    )
  }

  async #forgetAtCreator(invite: InviteRow): Promise<void> {
    try {
      await this.#creator(invite).forgetInvite(invite.inviteId)
    } catch {
      // The inbox also drops the bookkeeping when the invite expires.
      console.warn('buddies: burned-invite bookkeeping cleanup failed')
    }
  }

  async #destroy(): Promise<void> {
    await this.ctx.storage.deleteAll()
    // Before compatibility date 2026-02-24, deleteAll() keeps the alarm.
    await this.ctx.storage.deleteAlarm()
    this.#schemaReady = false
  }
}

/** Compared instead of the blob itself, so a stored claim can't be read back. */
const blobDigest = async (blob: string): Promise<string> =>
  bytesToBase64Url(await sha256Bytes(new TextEncoder().encode(blob)))
