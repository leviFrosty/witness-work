import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import { randomToken, sha256Hex, timingSafeEqual } from '../crypto'
import { buildAssertionClientData } from './clientData'
import { deleteChallenge, hasChallenge } from './challenge'
import { acceptedBundleIds } from './appId'
import { AppAttestError, type AppAttestFailure } from './errors'
import {
  deleteKeyRecord,
  getKeyRecord,
  getUuidOwner,
  putKeyRecord,
  putUuidOwner,
  type DeviceKeyRecord,
} from './keyStore'
import {
  APP_ATTEST_CHALLENGE_TTL_SECONDS,
  buildV2AssertionClientData,
  buildV2BindClientData,
  buildV2ChallengeDescriptor,
  buildV2EnrollClientData,
  deriveRecoveryTokenMaterial,
  type V1AssertionRequest,
  type V1AssertionResponse,
  type V1RegistrationRequest,
  type V1RegistrationResponse,
  type V2AssertionRequest,
  type V2AssertionResponse,
  type V2ChallengeRequest,
  type V2ChallengeResponse,
  type V2RegistrationRequest,
  type V2RegistrationResponse,
} from './protocol'
import {
  verifyAssertionCryptography,
  type VerifyAssertionCryptographyArgs,
  type VerifiedAssertion,
} from './assert'
import {
  verifyAttestationCryptography,
  type VerifyAttestationCryptographyArgs,
  type VerifiedAttestation,
} from './attest'

const MAX_ACTIVE_CHALLENGES = 32
const MAX_COMPLETED_OPERATION_RECEIPTS = 256
const MAX_LEGACY_CHALLENGE_RECEIPTS = 256
const MAX_LEGACY_REGISTRATION_RECEIPTS = 256
const OPERATION_REPLAY_RETENTION_MS = 24 * 60 * 60 * 1000
const LEGACY_REPLAY_RETENTION_MS = 24 * 60 * 60 * 1000
const MIRROR_RETRY_DELAY_MS = 5_000

export type AppAttestDoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppAttestFailure }

interface IdentityRecord {
  uuid: string
  keyId: string
  spki: string
  signCount: number
  environment: 'development' | 'production'
  attestedAt: number
  recoveryVerifier: string | null
  /**
   * Bundle id the active key attested against; its assertions verify against
   * this App ID only. Null for keys stored before bundle binding, which are
   * bound to the primary `IOS_BUNDLE_ID`.
   */
  bundleId: string | null
}

interface OperationRecord {
  operationId: string
  descriptorHash: string
  operation: string
  challenge: string
  expiresAt: number
  attemptHash: string | null
  completionHash: string | null
  resultJson: string | null
  errorJson: string | null
}

interface MirrorOutboxRecord {
  [column: string]: string | number | null
  sequence: number
  action: 'delete_key' | 'put_owner' | 'put_key'
  mirrorKey: string
  valueJson: string | null
}

interface LegacyIdentity {
  identity: IdentityRecord | null
  owner: string | null
}

export interface AppAttestIdentityDependencies {
  now(): number
  randomChallenge(): string
  verifyAttestation(
    args: VerifyAttestationCryptographyArgs
  ): Promise<VerifiedAttestation>
  verifyAssertion(
    args: VerifyAssertionCryptographyArgs
  ): Promise<VerifiedAssertion>
}

const defaultDependencies: AppAttestIdentityDependencies = {
  now: () => Date.now(),
  randomChallenge: () => randomToken(32),
  verifyAttestation: verifyAttestationCryptography,
  verifyAssertion: verifyAssertionCryptography,
}

const failure = (
  reason: AppAttestFailure['reason'],
  action: AppAttestFailure['action'],
  message: string,
  status: number
): { ok: false; error: AppAttestFailure } => ({
  ok: false,
  error: { reason, action, message, status },
})

const challengeNotFound = () =>
  failure(
    'challenge_not_found',
    'start_new_operation',
    'challenge invalid or already consumed',
    401
  )

const challengeExpired = () =>
  failure(
    'challenge_expired',
    'start_new_operation',
    'challenge expired',
    401
  )

const mirrorUnavailable = () =>
  failure(
    'storage_unavailable',
    'retry',
    'App Attest compatibility state is temporarily unavailable',
    503
  )

const operationConflict = () =>
  failure(
    'operation_conflict',
    'start_new_operation',
    'operationId was already used with different data',
    409
  )

const counterDidNotIncrease = () =>
  failure(
    'counter_not_increasing',
    'start_new_operation',
    'assertion sign-count did not increase',
    409
  )

const fromCryptographyError = (
  error: unknown,
  kind: 'attestation' | 'assertion'
): { ok: false; error: AppAttestFailure } => {
  if (!(error instanceof AppAttestError)) throw error
  return failure(
    kind === 'attestation' ? 'attestation_invalid' : 'assertion_invalid',
    'none',
    error.message,
    401
  )
}

const hashParts = (parts: string[]): Promise<string> =>
  sha256Hex(JSON.stringify(parts))

/**
 * One SQLite Durable Object per install UUID. It is the authoritative identity,
 * recovery-verifier, operation replay, challenge, and assertion-counter store.
 * KV is consulted once for lazy legacy import and then maintained only as a v1
 * compatibility mirror.
 */
export class AppAttestIdentity extends DurableObject<Environment> {
  readonly #environment: Environment
  readonly #dependencies: AppAttestIdentityDependencies
  #mirrorFlushPromise: Promise<boolean> | null = null

  constructor(
    ctx: DurableObjectState,
    environment: Environment,
    dependencies: AppAttestIdentityDependencies = defaultDependencies
  ) {
    super(ctx, environment)
    this.#environment = environment
    this.#dependencies = dependencies

    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS identity (
         singleton             INTEGER PRIMARY KEY CHECK (singleton = 1),
         uuid                  TEXT NOT NULL,
         key_id                TEXT NOT NULL,
         spki                  TEXT NOT NULL,
         sign_count            INTEGER NOT NULL CHECK (sign_count >= 0),
         environment           TEXT NOT NULL,
         attested_at           INTEGER NOT NULL,
         recovery_verifier     TEXT,
         bundle_id             TEXT
       )`
    )
    // Identities created before bundle binding lack the column; NULL there
    // means "bound to the primary IOS_BUNDLE_ID".
    const hasBundleIdColumn = ctx.storage.sql
      .exec<{ name: string }>('PRAGMA table_info(identity)')
      .toArray()
      .some((column) => column.name === 'bundle_id')
    if (!hasBundleIdColumn) {
      ctx.storage.sql.exec('ALTER TABLE identity ADD COLUMN bundle_id TEXT')
    }
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS operation (
         operation_id          TEXT PRIMARY KEY,
         descriptor_hash       TEXT NOT NULL,
         operation             TEXT NOT NULL,
         challenge             TEXT NOT NULL,
         expires_at            INTEGER NOT NULL,
         attempt_hash          TEXT,
         completion_hash       TEXT,
         result_json           TEXT,
         error_json            TEXT,
         completed_at          INTEGER
       )`
    )
    ctx.storage.sql.exec(
      `CREATE INDEX IF NOT EXISTS operation_active_idx
       ON operation (completion_hash, expires_at)`
    )
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS legacy_challenge (
         challenge_hash        TEXT PRIMARY KEY,
         consumed_at           INTEGER NOT NULL
       )`
    )
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS legacy_registration_receipt (
         challenge_hash        TEXT PRIMARY KEY,
         request_hash          TEXT NOT NULL,
         completed_at          INTEGER NOT NULL
       )`
    )
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS retired_key (
         key_id                TEXT PRIMARY KEY,
         retired_at            INTEGER NOT NULL
       )`
    )
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS mirror_outbox (
         sequence              INTEGER PRIMARY KEY AUTOINCREMENT,
         action                TEXT NOT NULL,
         mirror_key            TEXT NOT NULL,
         value_json            TEXT
       )`
    )
  }

  async issueChallenge(
    request: V2ChallengeRequest
  ): Promise<AppAttestDoResult<V2ChallengeResponse>> {
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    const descriptorHash = await sha256Hex(buildV2ChallengeDescriptor(request))
    const challenge = this.#dependencies.randomChallenge()
    const now = this.#dependencies.now()
    const expiresAt = now + APP_ATTEST_CHALLENGE_TTL_SECONDS * 1000

    return this.ctx.storage.transactionSync(() => {
      const existing = this.#readOperation(request.operationId)
      if (existing) {
        if (existing.descriptorHash !== descriptorHash) return operationConflict()
        if (existing.expiresAt <= now) {
          this.#garbageCollectOperations(now)
          return challengeExpired()
        }
        return {
          ok: true,
          value: {
            protocolVersion: 2,
            operation: request.operation,
            operationId: request.operationId,
            challenge: existing.challenge,
            expiresAt: existing.expiresAt,
          },
        }
      }

      this.#garbageCollectOperations(now)
      const active = this.ctx.storage.sql
        .exec<{ count: number }>(
          `SELECT COUNT(*) AS count FROM operation
           WHERE completion_hash IS NULL AND expires_at > ?`,
          now
        )
        .one().count
      if (active >= MAX_ACTIVE_CHALLENGES) {
        return failure(
          'too_many_challenges',
          'retry',
          'too many active App Attest challenges',
          429
        )
      }

      this.ctx.storage.sql.exec(
        `INSERT INTO operation (
           operation_id, descriptor_hash, operation, challenge, expires_at
         ) VALUES (?, ?, ?, ?, ?)`,
        request.operationId,
        descriptorHash,
        request.operation,
        challenge,
        expiresAt
      )
      return {
        ok: true,
        value: {
          protocolVersion: 2,
          operation: request.operation,
          operationId: request.operationId,
          challenge,
          expiresAt,
        },
      }
    })
  }

  async register(
    request: V1RegistrationRequest | V2RegistrationRequest
  ): Promise<
    AppAttestDoResult<V1RegistrationResponse | V2RegistrationResponse>
  > {
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    return request.protocolVersion === 1
      ? this.#registerV1(request)
      : request.operation === 'bind'
        ? this.#bindV2(request)
        : this.#enrollV2(request)
  }

  async verifyAssertion(
    request: V1AssertionRequest | V2AssertionRequest
  ): Promise<AppAttestDoResult<V1AssertionResponse | V2AssertionResponse>> {
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    return request.protocolVersion === 1
      ? this.#verifyV1(request)
      : this.#verifyV2(request)
  }

  /** Durable retry for compatibility writes that failed after SQLite committed. */
  async alarm(): Promise<void> {
    await this.#flushMirrorOutbox()
  }

  async #bindV2(
    request: Extract<V2RegistrationRequest, { operation: 'bind' }>
  ): Promise<AppAttestDoResult<V2RegistrationResponse>> {
    const token = await deriveRecoveryTokenMaterial(request.recoveryToken)
    if (!token) {
      return failure(
        'invalid_request',
        'none',
        'recoveryToken must be 32 bytes encoded as base64url',
        400
      )
    }

    const descriptorHash = await sha256Hex(buildV2ChallengeDescriptor(request))
    const attestationHash = await sha256Hex(request.attestation)
    const completionHash = await hashParts([
      'bind',
      request.operationId,
      request.challenge,
      request.uuid,
      request.keyId,
      token.tokenHash,
      attestationHash,
    ])
    const preflight = this.#reserveOperation<V2RegistrationResponse>(
      request,
      descriptorHash,
      completionHash
    )
    if (preflight.kind === 'error') return preflight.result
    if (preflight.kind === 'replay') return preflight.result

    let attested: VerifiedAttestation
    try {
      attested = await this.#dependencies.verifyAttestation({
        attestation: request.attestation,
        keyId: request.keyId,
        clientData: buildV2BindClientData({
          operationId: request.operationId,
          challenge: request.challenge,
          uuid: request.uuid,
          tokenHash: token.tokenHash,
        }),
        teamId: this.#environment.APPLE_TEAM_ID,
        bundleIds: acceptedBundleIds(this.#environment),
        requireProduction: this.#requireProduction(),
      })
    } catch (error) {
      return this.#completeFailure<V2RegistrationResponse>(
        request,
        descriptorHash,
        completionHash,
        fromCryptographyError(error, 'attestation')
      )
    }

    // Read the legacy owner index only after a valid Apple attestation, so
    // malformed random-UUID binds cannot amplify KV reads.
    const legacy = await this.#loadOrImportLegacyIdentity(request.uuid)
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()

    const result = this.#completeOperation<V2RegistrationResponse>(
      request,
      descriptorHash,
      completionHash,
      () => {
        const current = this.#readIdentity()
        const decision = this.#decideBind(
          current,
          legacy.owner,
          request.keyId,
          token.verifier
        )
        if (!decision.ok) return decision
        if (
          decision.value === 'already_bound' &&
          current &&
          (current.spki !== attested.spki ||
            this.#boundBundleId(current) !== attested.bundleId)
        ) {
          return failure(
            'attestation_invalid',
            'none',
            'attested key does not match the active key material',
            401
          )
        }

        let value: V2RegistrationResponse
        if (decision.value === 'bound') {
          const identity: IdentityRecord = {
            uuid: request.uuid,
            keyId: request.keyId,
            spki: attested.spki,
            signCount: 0,
            environment: attested.environment,
            attestedAt: this.#dependencies.now(),
            recoveryVerifier: token.verifier,
            bundleId: attested.bundleId,
          }
          this.#insertIdentity(identity)
          this.#enqueueIdentityMirror(identity)
          value = {
            ok: true,
            protocolVersion: 2,
            operationId: request.operationId,
            status: 'bound',
            recoveryEnrolled: true,
          }
        } else if (decision.value === 'rotated') {
          if (!current) throw new Error('rotation lost the active identity')
          this.ctx.storage.sql.exec(
            'DELETE FROM retired_key WHERE key_id = ?',
            request.keyId
          )
          this.ctx.storage.sql.exec(
            `DELETE FROM mirror_outbox
             WHERE action = 'delete_key' AND mirror_key = ?`,
            request.keyId
          )
          this.ctx.storage.sql.exec(
            'INSERT OR IGNORE INTO retired_key (key_id, retired_at) VALUES (?, ?)',
            current.keyId,
            this.#dependencies.now()
          )
          this.ctx.storage.sql.exec(
            `UPDATE identity
             SET key_id = ?, spki = ?, sign_count = 0, environment = ?,
                 bundle_id = ?, attested_at = ?
             WHERE singleton = 1`,
            request.keyId,
            attested.spki,
            attested.environment,
            attested.bundleId,
            this.#dependencies.now()
          )
          const rotatedIdentity = this.#readIdentity()
          if (!rotatedIdentity) throw new Error('rotation lost the new identity')
          this.#enqueueIdentityMirror(rotatedIdentity)
          value = {
            ok: true,
            protocolVersion: 2,
            operationId: request.operationId,
            status: 'rotated',
            recoveryEnrolled: true,
          }
        } else {
          // Re-attesting the active key is idempotent. In particular, never reset
          // its assertion counter and never use bind as a shortcut for legacy
          // recovery enrollment (that requires an active-key assertion).
          if (!current) throw new Error('same-key bind lost the identity')
          this.#enqueueIdentityMirror(current)
          value = {
            ok: true,
            protocolVersion: 2,
            operationId: request.operationId,
            status: 'already_bound',
            recoveryEnrolled: current?.recoveryVerifier != null,
          }
        }
        return { ok: true, value }
      }
    )

    if (result.ok && !(await this.#flushMirrorOutbox())) {
      return mirrorUnavailable()
    }
    return result
  }

  async #enrollV2(
    request: Extract<V2RegistrationRequest, { operation: 'enroll' }>
  ): Promise<AppAttestDoResult<V2RegistrationResponse>> {
    const token = await deriveRecoveryTokenMaterial(request.recoveryToken)
    if (!token) {
      return failure(
        'invalid_request',
        'none',
        'recoveryToken must be 32 bytes encoded as base64url',
        400
      )
    }

    const descriptorHash = await sha256Hex(buildV2ChallengeDescriptor(request))
    const assertionHash = await sha256Hex(request.assertion)
    const completionHash = await hashParts([
      'enroll',
      request.operationId,
      request.challenge,
      request.uuid,
      request.keyId,
      token.tokenHash,
      assertionHash,
    ])
    const preflight = this.#reserveOperation<V2RegistrationResponse>(
      request,
      descriptorHash,
      completionHash
    )
    if (preflight.kind === 'error') return preflight.result
    if (preflight.kind === 'replay') return preflight.result

    let { identity } = await this.#loadOrImportLegacyIdentity(request.uuid, {
      presentedKeyId: request.keyId,
      deferOwnerlessImport: true,
    })
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    if (!identity) {
      return this.#completeFailure<V2RegistrationResponse>(
        request,
        descriptorHash,
        completionHash,
        failure(
          'identity_not_bound',
          'bind',
          'identity has no active App Attest key',
          401
        )
      )
    }
    if (identity.keyId !== request.keyId) {
      return this.#completeFailure<V2RegistrationResponse>(
        request,
        descriptorHash,
        completionHash,
        this.#inactiveKeyFailure()
      )
    }

    const assertedSpki = identity.spki
    let verified: VerifiedAssertion
    try {
      verified = await this.#dependencies.verifyAssertion({
        assertion: request.assertion,
        spki: identity.spki,
        clientData: buildV2EnrollClientData({
          operationId: request.operationId,
          challenge: request.challenge,
          uuid: request.uuid,
          keyId: request.keyId,
          tokenHash: token.tokenHash,
        }),
        teamId: this.#environment.APPLE_TEAM_ID,
        bundleId: this.#assertionBundleId(identity),
      })
    } catch (error) {
      return this.#completeFailure<V2RegistrationResponse>(
        request,
        descriptorHash,
        completionHash,
        fromCryptographyError(error, 'assertion')
      )
    }

    const imported = await this.#loadOrImportLegacyIdentity(request.uuid, {
      presentedKeyId: request.keyId,
    })
    identity = imported.identity
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    if (!identity || identity.keyId !== request.keyId || identity.spki !== assertedSpki) {
      return this.#completeFailure<V2RegistrationResponse>(
        request,
        descriptorHash,
        completionHash,
        identity ? this.#inactiveKeyFailure() : failure(
          'identity_not_bound',
          'bind',
          'identity has no active App Attest key',
          401
        )
      )
    }

    const result = this.#completeOperation<V2RegistrationResponse>(
      request,
      descriptorHash,
      completionHash,
      () => {
        const current = this.#readIdentity()
        if (!current) {
          return failure(
            'identity_not_bound',
            'bind',
            'identity has no active App Attest key',
            401
          )
        }
        if (current.keyId !== request.keyId) return this.#inactiveKeyFailure()
        if (verified.signCount <= current.signCount) return counterDidNotIncrease()

        this.ctx.storage.sql.exec(
          `UPDATE identity
           SET sign_count = ?, recovery_verifier = ?
           WHERE singleton = 1`,
          verified.signCount,
          token.verifier
        )
        return {
          ok: true,
          value: {
            ok: true,
            protocolVersion: 2,
            operationId: request.operationId,
            status: 'recovery_enrolled',
            recoveryEnrolled: true,
          },
        }
      }
    )

    return result
  }

  async #verifyV2(
    request: V2AssertionRequest
  ): Promise<AppAttestDoResult<V2AssertionResponse>> {
    const descriptorHash = await sha256Hex(buildV2ChallengeDescriptor(request))
    const assertionHash = await sha256Hex(request.assertion)
    const completionHash = await hashParts([
      'assert',
      request.purpose,
      request.operationId,
      request.challenge,
      request.uuid,
      request.keyId,
      request.accountId ?? '',
      request.contentHash,
      request.requestHash,
      assertionHash,
    ])
    const preflight = this.#reserveOperation<V2AssertionResponse>(
      request,
      descriptorHash,
      completionHash
    )
    if (preflight.kind === 'error') return preflight.result
    if (preflight.kind === 'replay') return preflight.result

    let { identity } = await this.#loadOrImportLegacyIdentity(request.uuid, {
      presentedKeyId: request.keyId,
      deferOwnerlessImport: true,
    })
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    if (!identity) {
      return this.#completeFailure<V2AssertionResponse>(
        request,
        descriptorHash,
        completionHash,
        failure(
          'identity_not_bound',
          'bind',
          'identity has no active App Attest key',
          401
        )
      )
    }
    if (identity.keyId !== request.keyId) {
      return this.#completeFailure<V2AssertionResponse>(
        request,
        descriptorHash,
        completionHash,
        this.#inactiveKeyFailure()
      )
    }

    const assertedSpki = identity.spki
    let verified: VerifiedAssertion
    try {
      verified = await this.#dependencies.verifyAssertion({
        assertion: request.assertion,
        spki: identity.spki,
        clientData: buildV2AssertionClientData(request),
        teamId: this.#environment.APPLE_TEAM_ID,
        bundleId: this.#assertionBundleId(identity),
      })
    } catch (error) {
      return this.#completeFailure<V2AssertionResponse>(
        request,
        descriptorHash,
        completionHash,
        fromCryptographyError(error, 'assertion')
      )
    }

    const imported = await this.#loadOrImportLegacyIdentity(request.uuid, {
      presentedKeyId: request.keyId,
    })
    identity = imported.identity
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    if (!identity || identity.keyId !== request.keyId || identity.spki !== assertedSpki) {
      return this.#completeFailure<V2AssertionResponse>(
        request,
        descriptorHash,
        completionHash,
        identity ? this.#inactiveKeyFailure() : failure(
          'identity_not_bound',
          'bind',
          'identity has no active App Attest key',
          401
        )
      )
    }

    const result = this.#completeOperation<V2AssertionResponse>(
      request,
      descriptorHash,
      completionHash,
      () => {
        const current = this.#readIdentity()
        if (!current) {
          return failure(
            'identity_not_bound',
            'bind',
            'identity has no active App Attest key',
            401
          )
        }
        if (current.keyId !== request.keyId) return this.#inactiveKeyFailure()
        if (verified.signCount <= current.signCount) return counterDidNotIncrease()

        this.ctx.storage.sql.exec(
          'UPDATE identity SET sign_count = ? WHERE singleton = 1',
          verified.signCount
        )
        return {
          ok: true,
          value: {
            ok: true,
            protocolVersion: 2,
            operationId: request.operationId,
          },
        }
      }
    )

    return result
  }

  async #registerV1(
    request: V1RegistrationRequest
  ): Promise<AppAttestDoResult<V1RegistrationResponse>> {
    const challengeHash = await sha256Hex(request.challenge)
    const attestationHash = await sha256Hex(request.attestation)
    const requestHash = await hashParts([
      'v1-register',
      request.uuid,
      request.keyId,
      request.challenge,
      attestationHash,
    ])
    const storedReceipt = this.#readLegacyRegistrationReceipt(challengeHash)
    if (storedReceipt != null) {
      if (storedReceipt !== requestHash) return challengeNotFound()
      if (!(await this.#deleteLegacyChallenge(request.challenge))) {
        return mirrorUnavailable()
      }
      if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
      return { ok: true, value: { ok: true } }
    }
    if (this.#legacyChallengeWasConsumed(challengeHash)) return challengeNotFound()
    if (!(await hasChallenge(this.#environment.NOTES_KV, request.challenge))) {
      return challengeNotFound()
    }

    let attested: VerifiedAttestation
    try {
      attested = await this.#dependencies.verifyAttestation({
        attestation: request.attestation,
        keyId: request.keyId,
        clientData: request.challenge,
        teamId: this.#environment.APPLE_TEAM_ID,
        bundleIds: acceptedBundleIds(this.#environment),
        requireProduction: this.#requireProduction(),
      })
    } catch (error) {
      return fromCryptographyError(error, 'attestation')
    }

    const legacy = await this.#loadOrImportLegacyIdentity(request.uuid)
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    if (legacy.identity && legacy.identity.keyId !== request.keyId) {
      return this.#inactiveKeyFailure()
    }
    if (!legacy.identity && legacy.owner && legacy.owner !== request.keyId) {
      return this.#inactiveKeyFailure()
    }

    const result = this.ctx.storage.transactionSync<
      AppAttestDoResult<V1RegistrationResponse>
    >(() => {
      const receipt = this.#readLegacyRegistrationReceipt(challengeHash)
      if (receipt != null) {
        return receipt === requestHash
          ? { ok: true, value: { ok: true } }
          : challengeNotFound()
      }
      if (this.#legacyChallengeWasConsumed(challengeHash)) {
        return challengeNotFound()
      }
      const current = this.#readIdentity()
      if (current && current.keyId !== request.keyId) {
        return this.#inactiveKeyFailure()
      }
      if (!current && legacy.owner && legacy.owner !== request.keyId) {
        return this.#inactiveKeyFailure()
      }

      if (!current) {
        this.#insertIdentity({
          uuid: request.uuid,
          keyId: request.keyId,
          spki: attested.spki,
          signCount: 0,
          environment: attested.environment,
          attestedAt: this.#dependencies.now(),
          recoveryVerifier: null,
          bundleId: attested.bundleId,
        })
      }
      // Same-key v1 re-registration deliberately leaves the existing row alone:
      // in particular, it can never reset an assertion counter to zero.
      const registeredIdentity = this.#readIdentity()
      if (!registeredIdentity) throw new Error('registration lost the identity')
      this.#enqueueIdentityMirror(registeredIdentity)
      this.#recordLegacyChallenge(challengeHash)
      this.#recordLegacyRegistrationReceipt(challengeHash, requestHash)
      return { ok: true, value: { ok: true } }
    })

    if (result.ok) {
      if (!(await this.#deleteLegacyChallenge(request.challenge))) {
        return mirrorUnavailable()
      }
      if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    }
    return result
  }

  async #verifyV1(
    request: V1AssertionRequest
  ): Promise<AppAttestDoResult<V1AssertionResponse>> {
    const challengeHash = await sha256Hex(request.challenge)
    if (this.#legacyChallengeWasConsumed(challengeHash)) return challengeNotFound()
    if (!(await hasChallenge(this.#environment.NOTES_KV, request.challenge))) {
      return challengeNotFound()
    }

    let { identity } = await this.#loadOrImportLegacyIdentity(request.uuid, {
      presentedKeyId: request.keyId,
      deferOwnerlessImport: true,
    })
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    if (!identity) {
      return failure(
        'identity_not_bound',
        'bind',
        'unknown device key — attest first',
        401
      )
    }
    if (identity.keyId !== request.keyId) return this.#inactiveKeyFailure()

    const assertedSpki = identity.spki
    let verified: VerifiedAssertion
    try {
      verified = await this.#dependencies.verifyAssertion({
        assertion: request.assertion,
        spki: identity.spki,
        clientData: buildAssertionClientData({
          challenge: request.challenge,
          uuid: request.uuid,
          accountId: request.accountId,
          contentHash: request.contentHash,
        }),
        teamId: this.#environment.APPLE_TEAM_ID,
        bundleId: this.#assertionBundleId(identity),
      })
    } catch (error) {
      return fromCryptographyError(error, 'assertion')
    }

    const imported = await this.#loadOrImportLegacyIdentity(request.uuid, {
      presentedKeyId: request.keyId,
    })
    identity = imported.identity
    if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
    if (!identity) {
      return failure(
        'identity_not_bound',
        'bind',
        'unknown device key — attest first',
        401
      )
    }
    if (identity.keyId !== request.keyId || identity.spki !== assertedSpki) {
      return this.#inactiveKeyFailure()
    }

    const result = this.ctx.storage.transactionSync<
      AppAttestDoResult<V1AssertionResponse>
    >(() => {
      if (this.#legacyChallengeWasConsumed(challengeHash)) {
        return challengeNotFound()
      }
      const current = this.#readIdentity()
      if (!current) {
        return failure(
          'identity_not_bound',
          'bind',
          'unknown device key — attest first',
          401
        )
      }
      if (current.keyId !== request.keyId) return this.#inactiveKeyFailure()
      if (verified.signCount <= current.signCount) return counterDidNotIncrease()

      this.ctx.storage.sql.exec(
        'UPDATE identity SET sign_count = ? WHERE singleton = 1',
        verified.signCount
      )
      this.#recordLegacyChallenge(challengeHash)
      return { ok: true, value: { ok: true } }
    })

    if (result.ok) {
      const challengeDeleted = await this.#deleteLegacyChallenge(request.challenge)
      if (!challengeDeleted) {
        // A rolled-back KV-only Worker could otherwise replay the still-visible
        // challenge against its stale counter. Mirror the advanced counter before
        // acknowledging only on this compatibility-cleanup failure path.
        const current = this.#readIdentity()
        if (!current) throw new Error('assertion lost the identity')
        this.#enqueueKeyMirror(current)
        if (!(await this.#flushMirrorOutbox())) return mirrorUnavailable()
      }
    }
    return result
  }

  #reserveOperation<T>(
    request: V2ChallengeRequest & { challenge: string },
    descriptorHash: string,
    completionHash: string
  ):
    | { kind: 'pending' }
    | { kind: 'replay'; result: AppAttestDoResult<T> }
    | { kind: 'error'; result: AppAttestDoResult<T> } {
    return this.ctx.storage.transactionSync(() => {
      const preflight = this.#preflightOperation<T>(
        request,
        descriptorHash,
        completionHash
      )
      if (preflight.kind !== 'pending') return preflight
      this.ctx.storage.sql.exec(
        `UPDATE operation SET attempt_hash = ?
         WHERE operation_id = ? AND attempt_hash IS NULL`,
        completionHash,
        request.operationId
      )
      return { kind: 'pending' as const }
    })
  }

  #preflightOperation<T>(
    request: V2ChallengeRequest & { challenge: string },
    descriptorHash: string,
    completionHash: string
  ):
    | { kind: 'pending' }
    | { kind: 'replay'; result: AppAttestDoResult<T> }
    | { kind: 'error'; result: AppAttestDoResult<T> } {
    const operation = this.#readOperation(request.operationId)
    if (!operation) return { kind: 'error', result: challengeNotFound() }
    if (
      operation.descriptorHash !== descriptorHash ||
      operation.operation !== request.operation ||
      operation.challenge !== request.challenge ||
      (operation.attemptHash != null && operation.attemptHash !== completionHash)
    ) {
      return { kind: 'error', result: operationConflict() }
    }
    if (operation.completionHash != null) {
      if (operation.completionHash !== completionHash) {
        return { kind: 'error', result: operationConflict() }
      }
      if (operation.resultJson != null) {
        // Backward defense for any assertion receipts written by an earlier
        // build that persisted a success result. New completions persist the
        // typed consumed failure directly instead.
        if (operation.operation === 'assert') {
          return { kind: 'error', result: challengeNotFound() }
        }
        return {
          kind: 'replay',
          result: { ok: true, value: JSON.parse(operation.resultJson) as T },
        }
      }
      if (operation.errorJson != null) {
        return {
          kind: 'replay',
          result: {
            ok: false,
            error: JSON.parse(operation.errorJson) as AppAttestFailure,
          },
        }
      }
      throw new Error('completed App Attest operation has no stored result')
    }
    if (operation.expiresAt <= this.#dependencies.now()) {
      this.ctx.storage.sql.exec(
        'DELETE FROM operation WHERE operation_id = ?',
        request.operationId
      )
      return { kind: 'error', result: challengeExpired() }
    }
    return { kind: 'pending' }
  }

  #completeFailure<T>(
    request: V2ChallengeRequest & { challenge: string },
    descriptorHash: string,
    completionHash: string,
    result: { ok: false; error: AppAttestFailure }
  ): AppAttestDoResult<T> {
    return this.#completeOperation<T>(
      request,
      descriptorHash,
      completionHash,
      () => result
    )
  }

  #completeOperation<T>(
    request: V2ChallengeRequest & { challenge: string },
    descriptorHash: string,
    completionHash: string,
    mutate: () => AppAttestDoResult<T>
  ): AppAttestDoResult<T> {
    return this.ctx.storage.transactionSync(() => {
      const preflight = this.#preflightOperation<T>(
        request,
        descriptorHash,
        completionHash
      )
      if (preflight.kind !== 'pending') return preflight.result

      const result = mutate()
      const completedAt = this.#dependencies.now()
      const assertionReplayFailure =
        result.ok && request.operation === 'assert'
          ? challengeNotFound().error
          : null
      this.ctx.storage.sql.exec(
        `UPDATE operation
         SET completion_hash = ?, result_json = ?, error_json = ?, completed_at = ?
         WHERE operation_id = ?`,
        completionHash,
        result.ok && assertionReplayFailure == null
          ? JSON.stringify(result.value)
          : null,
        result.ok
          ? assertionReplayFailure == null
            ? null
            : JSON.stringify(assertionReplayFailure)
          : JSON.stringify(result.error),
        completedAt,
        request.operationId
      )
      this.#garbageCollectOperations(completedAt)
      return result
    })
  }

  #decideBind(
    identity: IdentityRecord | null,
    legacyOwner: string | null,
    keyId: string,
    recoveryVerifier: string
  ):
    | { ok: true; value: 'bound' | 'already_bound' | 'rotated' }
    | { ok: false; error: AppAttestFailure } {
    if (!identity) {
      if (legacyOwner && legacyOwner !== keyId) {
        return failure(
          'recovery_not_enrolled',
          'enroll_recovery',
          'identity is bound to a legacy key without recovery',
          401
        )
      }
      return { ok: true, value: 'bound' }
    }
    if (identity.keyId === keyId) return { ok: true, value: 'already_bound' }
    if (!identity.recoveryVerifier) {
      return failure(
        'recovery_not_enrolled',
        'enroll_recovery',
        'identity has no enrolled recovery token',
        401
      )
    }
    if (!timingSafeEqual(identity.recoveryVerifier, recoveryVerifier)) {
      return failure(
        'recovery_token_mismatch',
        'none',
        'recovery token did not match',
        401
      )
    }
    return { ok: true, value: 'rotated' }
  }

  /** The bundle id an identity's key is bound to (legacy keys: the primary). */
  #boundBundleId(identity: IdentityRecord): string {
    return identity.bundleId ?? acceptedBundleIds(this.#environment)[0]
  }

  /**
   * Assertions verify only against the App ID the key attested with — never
   * any accepted id. A bound id later removed from configuration fails closed.
   */
  #assertionBundleId(identity: IdentityRecord): string {
    const bundleId = this.#boundBundleId(identity)
    if (!acceptedBundleIds(this.#environment).includes(bundleId)) {
      throw new AppAttestError('key is bound to an app id that is not accepted', {
        reason: 'assertion_invalid',
      })
    }
    return bundleId
  }

  #inactiveKeyFailure(): { ok: false; error: AppAttestFailure } {
    return failure(
      'key_not_active',
      'use_active_key',
      'device key is not active for this identity',
      401
    )
  }

  async #loadOrImportLegacyIdentity(
    uuid: string,
    options: {
      presentedKeyId?: string
      deferOwnerlessImport?: boolean
    } = {}
  ): Promise<LegacyIdentity> {
    const existing = this.#readIdentity()
    if (existing) return { identity: existing, owner: existing.keyId }

    const owner = await getUuidOwner(this.#environment.NOTES_KV, uuid)
    let legacyKeyId: string | null = owner
    let legacyRecord: DeviceKeyRecord | null = null

    if (owner) {
      // The reverse index is the deployed fast path and remains authoritative
      // even if an old partial write left its key row missing or malformed.
      legacyRecord = await getKeyRecord(this.#environment.NOTES_KV, owner)
      if (!legacyRecord || legacyRecord.uuid !== uuid) {
        return { identity: null, owner }
      }
    } else if (options.presentedKeyId) {
      // Assertion/enrollment present the key id: a direct lookup that still
      // requires the record's UUID pin. Never list the legacy key space. Since
      // the Durable Object cutover every identity mirrors its owner index with
      // its key row, so a scan for a UUID with no owner finds nothing, and it
      // reads every row: fresh binds took 15s to over 2 minutes.
      const candidate = await getKeyRecord(
        this.#environment.NOTES_KV,
        options.presentedKeyId
      )
      if (candidate?.uuid === uuid) {
        legacyKeyId = options.presentedKeyId
        legacyRecord = candidate
      }
    }

    if (!legacyKeyId || !legacyRecord) {
      return { identity: null, owner: null }
    }

    const importedIdentity: IdentityRecord = {
      uuid,
      keyId: legacyKeyId,
      spki: legacyRecord.spki,
      signCount: legacyRecord.signCount,
      environment: legacyRecord.environment,
      attestedAt: legacyRecord.attestedAt,
      recoveryVerifier: null,
      bundleId: legacyRecord.bundleId ?? null,
    }
    if (options.deferOwnerlessImport && owner == null) {
      return { identity: importedIdentity, owner: legacyKeyId }
    }
    this.ctx.storage.transactionSync(() => {
      if (this.#readIdentity()) return
      this.#insertIdentity(importedIdentity)
      this.#enqueueIdentityMirror(importedIdentity)
    })
    const identity = this.#readIdentity()
    return { identity, owner: identity?.keyId ?? legacyKeyId }
  }

  #readIdentity(): IdentityRecord | null {
    const rows = this.ctx.storage.sql
      .exec<{
        uuid: string
        keyId: string
        spki: string
        signCount: number
        environment: string
        attestedAt: number
        recoveryVerifier: string | null
        bundleId: string | null
      }>(
        `SELECT uuid, key_id AS keyId, spki, sign_count AS signCount,
                environment, attested_at AS attestedAt,
                recovery_verifier AS recoveryVerifier, bundle_id AS bundleId
         FROM identity WHERE singleton = 1`
      )
      .toArray()
    if (!rows.length) return null
    const row = rows[0]
    if (row.environment !== 'development' && row.environment !== 'production') {
      throw new Error('invalid App Attest identity environment')
    }
    return { ...row, environment: row.environment }
  }

  #insertIdentity(identity: IdentityRecord): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO identity (
         singleton, uuid, key_id, spki, sign_count, environment,
         attested_at, recovery_verifier, bundle_id
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      identity.uuid,
      identity.keyId,
      identity.spki,
      identity.signCount,
      identity.environment,
      identity.attestedAt,
      identity.recoveryVerifier,
      identity.bundleId
    )
  }

  #garbageCollectOperations(now: number): void {
    this.ctx.storage.sql.exec(
      `DELETE FROM operation
       WHERE completion_hash IS NULL AND expires_at <= ?`,
      now
    )
    this.ctx.storage.sql.exec(
      `DELETE FROM operation
       WHERE completion_hash IS NOT NULL AND completed_at < ?`,
      now - OPERATION_REPLAY_RETENTION_MS
    )
    this.ctx.storage.sql.exec(
      `DELETE FROM operation
       WHERE operation_id IN (
         SELECT operation_id FROM operation
         WHERE completion_hash IS NOT NULL
         ORDER BY completed_at DESC, operation_id DESC
         LIMIT -1 OFFSET ?
       )`,
      MAX_COMPLETED_OPERATION_RECEIPTS
    )
  }

  #readOperation(operationId: string): OperationRecord | null {
    const rows = this.ctx.storage.sql
      .exec<{
        operationId: string
        descriptorHash: string
        operation: string
        challenge: string
        expiresAt: number
        attemptHash: string | null
        completionHash: string | null
        resultJson: string | null
        errorJson: string | null
      }>(
        `SELECT operation_id AS operationId,
                descriptor_hash AS descriptorHash,
                operation, challenge, expires_at AS expiresAt,
                attempt_hash AS attemptHash,
                completion_hash AS completionHash,
                result_json AS resultJson, error_json AS errorJson
         FROM operation WHERE operation_id = ?`,
        operationId
      )
      .toArray()
    return rows[0] ?? null
  }

  #readLegacyRegistrationReceipt(challengeHash: string): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ requestHash: string }>(
        `SELECT request_hash AS requestHash
         FROM legacy_registration_receipt WHERE challenge_hash = ?`,
        challengeHash
      )
      .toArray()
    return rows[0]?.requestHash ?? null
  }

  #recordLegacyRegistrationReceipt(
    challengeHash: string,
    requestHash: string
  ): void {
    const now = this.#dependencies.now()
    this.ctx.storage.sql.exec(
      'DELETE FROM legacy_registration_receipt WHERE completed_at < ?',
      now - LEGACY_REPLAY_RETENTION_MS
    )
    this.ctx.storage.sql.exec(
      `INSERT INTO legacy_registration_receipt (
         challenge_hash, request_hash, completed_at
       ) VALUES (?, ?, ?)`,
      challengeHash,
      requestHash,
      now
    )
    this.ctx.storage.sql.exec(
      `DELETE FROM legacy_registration_receipt
       WHERE challenge_hash IN (
         SELECT challenge_hash FROM legacy_registration_receipt
         ORDER BY completed_at DESC, challenge_hash DESC
         LIMIT -1 OFFSET ?
       )`,
      MAX_LEGACY_REGISTRATION_RECEIPTS
    )
  }

  #legacyChallengeWasConsumed(challengeHash: string): boolean {
    return (
      this.ctx.storage.sql
        .exec<{ count: number }>(
          'SELECT COUNT(*) AS count FROM legacy_challenge WHERE challenge_hash = ?',
          challengeHash
        )
        .one().count > 0
    )
  }

  #recordLegacyChallenge(challengeHash: string): void {
    const now = this.#dependencies.now()
    this.ctx.storage.sql.exec(
      'DELETE FROM legacy_challenge WHERE consumed_at < ?',
      now - LEGACY_REPLAY_RETENTION_MS
    )
    this.ctx.storage.sql.exec(
      'INSERT INTO legacy_challenge (challenge_hash, consumed_at) VALUES (?, ?)',
      challengeHash,
      now
    )
    this.ctx.storage.sql.exec(
      `DELETE FROM legacy_challenge
       WHERE challenge_hash IN (
         SELECT challenge_hash FROM legacy_challenge
         ORDER BY consumed_at DESC, challenge_hash DESC
         LIMIT -1 OFFSET ?
       )`,
      MAX_LEGACY_CHALLENGE_RECEIPTS
    )
  }

  async #deleteLegacyChallenge(challenge: string): Promise<boolean> {
    try {
      await deleteChallenge(this.#environment.NOTES_KV, challenge)
      return true
    } catch {
      // The local SQLite replay row stays authoritative for this DO. The caller
      // must preserve rollback safety before it acknowledges the operation.
      console.warn('App Attest legacy challenge mirror cleanup failed')
      return false
    }
  }

  #enqueueIdentityMirror(identity: IdentityRecord): void {
    // Retired-key deletion is always queued first. A partial flush therefore
    // leaves the legacy mirror fail-closed rather than publishing a new owner
    // while an old assertion key is still usable by a rolled-back Worker.
    const retired = this.ctx.storage.sql
      .exec<{ keyId: string }>('SELECT key_id AS keyId FROM retired_key')
      .toArray()
    for (const { keyId } of retired) {
      this.ctx.storage.sql.exec(
        `DELETE FROM mirror_outbox
         WHERE action = 'put_key' AND mirror_key = ?`,
        keyId
      )
      this.#enqueueMirrorAction('delete_key', keyId, null)
    }

    this.#enqueueMirrorAction('put_owner', identity.uuid, identity.keyId)
    this.#enqueueKeyMirror(identity)
  }

  #enqueueKeyMirror(identity: IdentityRecord): void {
    const record: DeviceKeyRecord = {
      spki: identity.spki,
      signCount: identity.signCount,
      uuid: identity.uuid,
      environment: identity.environment,
      attestedAt: identity.attestedAt,
      ...(identity.bundleId == null ? {} : { bundleId: identity.bundleId }),
    }
    this.#enqueueMirrorAction(
      'put_key',
      identity.keyId,
      JSON.stringify(record)
    )
  }

  #enqueueMirrorAction(
    action: MirrorOutboxRecord['action'],
    mirrorKey: string,
    valueJson: string | null
  ): void {
    // Keep only the newest pending value for a logical mirror key. A currently
    // in-flight older write may still finish, but the serialized drain then
    // applies this newer sequence before any caller observes completion.
    this.ctx.storage.sql.exec(
      'DELETE FROM mirror_outbox WHERE action = ? AND mirror_key = ?',
      action,
      mirrorKey
    )
    this.ctx.storage.sql.exec(
      `INSERT INTO mirror_outbox (action, mirror_key, value_json)
       VALUES (?, ?, ?)`,
      action,
      mirrorKey,
      valueJson
    )
  }

  #readNextMirrorAction(): MirrorOutboxRecord | null {
    const rows = this.ctx.storage.sql
      .exec<MirrorOutboxRecord>(
        `SELECT sequence, action, mirror_key AS mirrorKey,
                value_json AS valueJson
         FROM mirror_outbox ORDER BY sequence LIMIT 1`
      )
      .toArray()
    return rows[0] ?? null
  }

  async #flushMirrorOutbox(): Promise<boolean> {
    if (this.#mirrorFlushPromise) return this.#mirrorFlushPromise
    const flush = this.#drainMirrorOutbox()
    this.#mirrorFlushPromise = flush
    try {
      return await flush
    } finally {
      if (this.#mirrorFlushPromise === flush) this.#mirrorFlushPromise = null
    }
  }

  async #drainMirrorOutbox(): Promise<boolean> {
    while (true) {
      const pending = this.#readNextMirrorAction()
      if (!pending) return true

      try {
        if (pending.action === 'delete_key') {
          await deleteKeyRecord(this.#environment.NOTES_KV, pending.mirrorKey)
        } else if (pending.action === 'put_owner') {
          if (pending.valueJson == null) throw new Error('owner mirror is empty')
          await putUuidOwner(
            this.#environment.NOTES_KV,
            pending.mirrorKey,
            pending.valueJson
          )
        } else if (pending.action === 'put_key') {
          if (pending.valueJson == null) throw new Error('key mirror is empty')
          const record = JSON.parse(pending.valueJson) as DeviceKeyRecord
          await putKeyRecord(
            this.#environment.NOTES_KV,
            pending.mirrorKey,
            record
          )
        } else {
          throw new Error('unknown App Attest mirror action')
        }
      } catch {
        // Never include the action payload, key id, request, token, or proof.
        console.warn('App Attest compatibility mirror is temporarily unavailable')
        await this.#scheduleMirrorRetry()
        return false
      }

      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          'DELETE FROM mirror_outbox WHERE sequence = ?',
          pending.sequence
        )
        if (pending.action === 'delete_key') {
          this.ctx.storage.sql.exec(
            'DELETE FROM retired_key WHERE key_id = ?',
            pending.mirrorKey
          )
        }
      })
    }
  }

  async #scheduleMirrorRetry(): Promise<void> {
    try {
      await this.ctx.storage.setAlarm(
        this.#dependencies.now() + MIRROR_RETRY_DELAY_MS
      )
    } catch {
      console.warn('App Attest compatibility mirror retry could not be scheduled')
    }
  }

  #requireProduction(): boolean {
    const mode = this.#environment.APP_ATTEST_ENVIRONMENT
    if (mode === 'production') {
      if (this.#environment.NOTES_IMPORT_DEV_BYPASS_TOKEN?.trim()) {
        throw new Error(
          'production App Attest configuration cannot include a dev bypass token'
        )
      }
      return true
    }
    if (mode === 'development') return false
    throw new Error('APP_ATTEST_ENVIRONMENT must be explicitly configured')
  }
}
