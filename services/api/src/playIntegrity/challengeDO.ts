import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import { randomToken, sha256Hex, timingSafeEqual } from '../crypto'
import { playIntegrityFailure, type PlayIntegrityFailure } from './errors'
import {
  PLAY_INTEGRITY_CHALLENGE_TTL_SECONDS,
  PLAY_INTEGRITY_PROTOCOL_VERSION,
  PLAY_INTEGRITY_PROVIDER,
  buildPlayIntegrityChallengeDescriptor,
  type PlayIntegrityChallengeRequest,
  type PlayIntegrityChallengeResponse,
} from './protocol'

const MAX_ACTIVE_CHALLENGES = 32
const CHALLENGE_TTL_MS = PLAY_INTEGRITY_CHALLENGE_TTL_SECONDS * 1000

export type PlayIntegrityDoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: PlayIntegrityFailure }

export interface PlayIntegrityChallengeDependencies {
  now(): number
  randomChallenge(): string
}

const defaultDependencies: PlayIntegrityChallengeDependencies = {
  now: () => Date.now(),
  randomChallenge: () => randomToken(32),
}

type ChallengeRow = {
  operation_id: string
  descriptor_hash: string
  challenge: string
  issued_at: number
  expires_at: number
  consumed_at: number | null
}

const fail = <T>(
  reason: PlayIntegrityFailure['reason'],
  message: string
): PlayIntegrityDoResult<T> => ({
  ok: false,
  error: playIntegrityFailure(reason, message),
})

/**
 * One instance per install uuid. Issues Play Integrity challenges bound to a
 * request descriptor and consumes each exactly once, atomically. Play already
 * clears verdicts on repeatedly decrypted standard tokens; this keeps our own
 * freshness and single-use guarantee independent of that. Holds no tokens and
 * no verdicts, and deletes itself once every challenge has expired.
 */
export class PlayIntegrityChallenges extends DurableObject<Environment> {
  readonly #dependencies: PlayIntegrityChallengeDependencies
  #schemaReady = false

  constructor(
    ctx: DurableObjectState,
    environment: Environment,
    dependencies: PlayIntegrityChallengeDependencies = defaultDependencies
  ) {
    super(ctx, environment)
    this.#dependencies = dependencies
  }

  async issueChallenge(
    request: PlayIntegrityChallengeRequest
  ): Promise<PlayIntegrityDoResult<PlayIntegrityChallengeResponse>> {
    const descriptorHash = await sha256Hex(
      buildPlayIntegrityChallengeDescriptor(request)
    )
    const now = this.#dependencies.now()
    this.#ensureSchema()
    const response = (
      row: Pick<ChallengeRow, 'challenge' | 'expires_at'>
    ): PlayIntegrityDoResult<PlayIntegrityChallengeResponse> => ({
      ok: true,
      value: {
        attestationProvider: PLAY_INTEGRITY_PROVIDER,
        protocolVersion: PLAY_INTEGRITY_PROTOCOL_VERSION,
        operation: 'assert',
        operationId: request.operationId,
        challenge: row.challenge,
        expiresAt: row.expires_at,
      },
    })

    const result = this.ctx.storage.transactionSync(() => {
      this.#purgeExpired(now)
      const existing = this.#read(request.operationId)
      if (existing) {
        // A lost response may be retried with the same descriptor; anything
        // else under this operation id is a different request.
        if (
          existing.descriptor_hash !== descriptorHash ||
          existing.consumed_at !== null
        ) {
          return fail<PlayIntegrityChallengeResponse>(
            'operation_conflict',
            'operation id already used for another request'
          )
        }
        return response(existing)
      }
      const active = this.ctx.storage.sql
        .exec<{ count: number }>(
          'SELECT COUNT(*) AS count FROM challenge WHERE consumed_at IS NULL'
        )
        .one().count
      if (active >= MAX_ACTIVE_CHALLENGES) {
        return fail<PlayIntegrityChallengeResponse>(
          'too_many_challenges',
          'too many active Play Integrity challenges'
        )
      }
      const row = {
        challenge: this.#dependencies.randomChallenge(),
        expires_at: now + CHALLENGE_TTL_MS,
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO challenge (
           operation_id, descriptor_hash, challenge, issued_at, expires_at
         ) VALUES (?, ?, ?, ?, ?)`,
        request.operationId,
        descriptorHash,
        row.challenge,
        now,
        row.expires_at
      )
      return response(row)
    })
    await this.#scheduleCleanup(now)
    return result
  }

  /**
   * Consumes the challenge for exactly this request. Returns when it was issued
   * so the verdict check can reject a token timestamp that predates it.
   */
  async consumeChallenge(
    request: PlayIntegrityChallengeRequest & { challenge: string }
  ): Promise<PlayIntegrityDoResult<{ issuedAt: number }>> {
    const descriptorHash = await sha256Hex(
      buildPlayIntegrityChallengeDescriptor(request)
    )
    const now = this.#dependencies.now()
    this.#ensureSchema()
    return this.ctx.storage.transactionSync(() => {
      const existing = this.#read(request.operationId)
      if (!existing || !timingSafeEqual(existing.challenge, request.challenge)) {
        return fail<{ issuedAt: number }>(
          'challenge_not_found',
          'unknown Play Integrity challenge'
        )
      }
      if (existing.descriptor_hash !== descriptorHash) {
        return fail<{ issuedAt: number }>(
          'operation_conflict',
          'challenge was issued for another request'
        )
      }
      if (existing.consumed_at !== null) {
        return fail<{ issuedAt: number }>(
          'challenge_not_found',
          'Play Integrity challenge already used'
        )
      }
      if (existing.expires_at <= now) {
        return fail<{ issuedAt: number }>(
          'challenge_expired',
          'Play Integrity challenge expired'
        )
      }
      this.ctx.storage.sql.exec(
        'UPDATE challenge SET consumed_at = ? WHERE operation_id = ?',
        now,
        request.operationId
      )
      return { ok: true, value: { issuedAt: existing.issued_at } }
    })
  }

  async alarm(): Promise<void> {
    const now = this.#dependencies.now()
    this.#ensureSchema()
    this.#purgeExpired(now)
    const next = this.ctx.storage.sql
      .exec<{ next: number | null }>(
        'SELECT MIN(expires_at) AS next FROM challenge'
      )
      .one().next
    if (next === null) {
      await this.ctx.storage.deleteAll()
      // Before compatibility date 2026-02-24, deleteAll() keeps the alarm.
      await this.ctx.storage.deleteAlarm()
      this.#schemaReady = false
      return
    }
    await this.ctx.storage.setAlarm(Math.max(next, now) + 1_000)
  }

  #ensureSchema(): void {
    if (this.#schemaReady) return
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS challenge (
         operation_id     TEXT PRIMARY KEY,
         descriptor_hash  TEXT NOT NULL,
         challenge        TEXT NOT NULL,
         issued_at        INTEGER NOT NULL,
         expires_at       INTEGER NOT NULL,
         consumed_at      INTEGER
       )`
    )
    this.#schemaReady = true
  }

  #read(operationId: string): ChallengeRow | null {
    return (
      this.ctx.storage.sql
        .exec<ChallengeRow>(
          `SELECT operation_id, descriptor_hash, challenge, issued_at,
                  expires_at, consumed_at
           FROM challenge WHERE operation_id = ?`,
          operationId
        )
        .toArray()[0] ?? null
    )
  }

  #purgeExpired(now: number): void {
    this.ctx.storage.sql.exec(
      'DELETE FROM challenge WHERE expires_at <= ?',
      now
    )
  }

  async #scheduleCleanup(now: number): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(now + CHALLENGE_TTL_MS + 1_000)
    }
  }
}
