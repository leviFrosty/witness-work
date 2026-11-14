import { sha256Hex } from '../crypto'
import {
  isAppAttestAssertionPurpose,
  isAppAttestChallenge,
  isAppAttestOperationId,
  isAppAttestUuid,
  type AppAttestAssertionPurpose,
} from '../appAttest/protocol'
import { isValidMeterId } from '../notesImport/admin'

/**
 * Wire protocol for Android's Play Integrity path (witness-work ADR 0017).
 *
 * It reuses the Notes Import challenge → protected-request shape of App Attest
 * v2, but a request opts in only through `attestationProvider`. A body without
 * that field never reaches this module, so the iOS paths stay unchanged.
 *
 * There is no key to register: every protected request carries a fresh
 * standard-request integrity token whose `requestHash` is the SHA-256 of the
 * client data below, which binds the one-time server challenge to the exact
 * identity, content, and payload of the request.
 */

export const PLAY_INTEGRITY_PROVIDER = 'play-integrity'
export const PLAY_INTEGRITY_PROTOCOL_VERSION = 1 as const
export const PLAY_INTEGRITY_DOMAIN = 'witnesswork.play-integrity'
export const PLAY_INTEGRITY_CHALLENGE_TTL_SECONDS = 300

/** Integrity tokens are opaque base64url segments; bound their size and alphabet. */
const MAX_INTEGRITY_TOKEN_LENGTH = 32_768
const INTEGRITY_TOKEN_PATTERN = /^[A-Za-z0-9_.=+/-]+$/

export interface PlayIntegrityChallengeRequest {
  attestationProvider: typeof PLAY_INTEGRITY_PROVIDER
  protocolVersion: typeof PLAY_INTEGRITY_PROTOCOL_VERSION
  operation: 'assert'
  operationId: string
  uuid: string
  accountId?: string
  purpose: AppAttestAssertionPurpose
  contentHash: string
  requestHash: string
}

export interface PlayIntegrityChallengeResponse {
  attestationProvider: typeof PLAY_INTEGRITY_PROVIDER
  protocolVersion: typeof PLAY_INTEGRITY_PROTOCOL_VERSION
  operation: 'assert'
  operationId: string
  challenge: string
  expiresAt: number
}

export interface PlayIntegrityAssertionRequest
  extends PlayIntegrityChallengeRequest {
  challenge: string
  integrityToken: string
}

export interface PlayIntegrityAssertionResponse {
  ok: true
  attestationProvider: typeof PLAY_INTEGRITY_PROVIDER
  protocolVersion: typeof PLAY_INTEGRITY_PROTOCOL_VERSION
  operationId: string
}

/** True when the body explicitly opted into the Play Integrity path. */
export const isPlayIntegrityRequest = (
  record: Record<string, unknown> | null | undefined
): boolean => record?.attestationProvider === PLAY_INTEGRITY_PROVIDER

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

const isLowercaseSha256 = (value: string): boolean =>
  /^[a-f0-9]{64}$/.test(value)

export const isIntegrityToken = (value: string): boolean =>
  value.length <= MAX_INTEGRITY_TOKEN_LENGTH &&
  INTEGRITY_TOKEN_PATTERN.test(value)

export const parsePlayIntegrityChallengeRequest = (
  record: Record<string, unknown>
): PlayIntegrityChallengeRequest | null => {
  const operationId = asString(record.operationId)
  const uuid = asString(record.uuid)
  const purpose = asString(record.purpose)
  const contentHash = asString(record.contentHash)
  const requestHash = asString(record.requestHash)
  const accountId =
    record.accountId == null ? undefined : asString(record.accountId)
  if (
    !isPlayIntegrityRequest(record) ||
    record.protocolVersion !== PLAY_INTEGRITY_PROTOCOL_VERSION ||
    record.operation !== 'assert' ||
    record.keyId != null ||
    !operationId ||
    !isAppAttestOperationId(operationId) ||
    !uuid ||
    !isAppAttestUuid(uuid) ||
    !purpose ||
    !isAppAttestAssertionPurpose(purpose) ||
    (record.accountId != null && (!accountId || !isValidMeterId(accountId))) ||
    !contentHash ||
    !isLowercaseSha256(contentHash) ||
    !requestHash ||
    !isLowercaseSha256(requestHash)
  ) {
    return null
  }
  return {
    attestationProvider: PLAY_INTEGRITY_PROVIDER,
    protocolVersion: PLAY_INTEGRITY_PROTOCOL_VERSION,
    operation: 'assert',
    operationId,
    uuid,
    ...(accountId ? { accountId } : {}),
    purpose,
    contentHash,
    requestHash,
  }
}

export const parsePlayIntegrityAssertionRequest = (
  record: Record<string, unknown>,
  expectedPurpose: AppAttestAssertionPurpose
): PlayIntegrityAssertionRequest | null => {
  const request = parsePlayIntegrityChallengeRequest(record)
  const challenge = asString(record.challenge)
  const integrityToken = asString(record.integrityToken)
  if (
    !request ||
    request.purpose !== expectedPurpose ||
    record.assertion != null ||
    !challenge ||
    !isAppAttestChallenge(challenge) ||
    !integrityToken ||
    !isIntegrityToken(integrityToken)
  ) {
    return null
  }
  return { ...request, challenge, integrityToken }
}

const field = (value: string | undefined): string => value ?? ''

/** Canonical challenge identity; hashed before it is persisted. */
export const buildPlayIntegrityChallengeDescriptor = (
  request: PlayIntegrityChallengeRequest
): string =>
  [
    PLAY_INTEGRITY_DOMAIN,
    String(PLAY_INTEGRITY_PROTOCOL_VERSION),
    'challenge',
    request.operation,
    request.operationId,
    request.uuid,
    field(request.accountId),
    request.purpose,
    request.contentHash,
    request.requestHash,
  ].join('|')

/**
 * Byte-for-byte client data the app hashes into the token's `requestHash`.
 * None of the fields can contain `|`: ids and the challenge are shape-checked
 * base64url/uuid alphabets and both hashes are lowercase hex.
 *
 * MUST stay identical to the witness-work client's builder.
 */
export const buildPlayIntegrityClientData = (
  request: Omit<PlayIntegrityAssertionRequest, 'integrityToken'>
): string =>
  [
    PLAY_INTEGRITY_DOMAIN,
    String(PLAY_INTEGRITY_PROTOCOL_VERSION),
    'assert',
    request.purpose,
    request.operationId,
    request.challenge,
    request.uuid,
    field(request.accountId),
    request.contentHash,
    request.requestHash,
  ].join('|')

/** The `requestHash` the app passes to Play: lowercase hex SHA-256 of the client data. */
export const computePlayIntegrityRequestBinding = (
  request: Omit<PlayIntegrityAssertionRequest, 'integrityToken'>
): Promise<string> => sha256Hex(buildPlayIntegrityClientData(request))
