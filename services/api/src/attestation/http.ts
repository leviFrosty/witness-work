import type { AppContext, ErrorResponse } from '../types'
import { HTTP_STATUS } from '../config'
import { Sentry } from '../sentry'
import { retryAfterHeaders } from '../errors'
import { PLAY_INTEGRITY_CHALLENGE_TTL_SECONDS } from '../playIntegrity/protocol'
import {
  appAttestProtocolVersion,
  AppAttestError,
  type AppAttestAction,
  type AppAttestReason,
} from '../appAttest'
import { appAttestHttpCode } from '../appAttest/errors'
import {
  isAppAttestChallenge,
  isAppAttestKeyId,
  isAppAttestOperationId,
  isAppAttestUuid,
  type V2AssertionChallengeRequest,
  type V2AssertionFinalRequest,
} from '../appAttest/protocol'
import {
  PlayIntegrityError,
  isPlayIntegrityRequest,
  parsePlayIntegrityAssertionRequest,
  verifyPlayIntegrityAssertion,
  type PlayIntegrityReason,
} from '../playIntegrity'
import type { PlayIntegrityAction } from '../playIntegrity/errors'
import { isAttestationPurpose, type AttestationPurpose } from './purposes'

/**
 * The HTTP side of device attestation, shared by `/attestation/v1/*` and
 * every route that requires an attested request: App Attest on iOS, Play
 * Integrity on Android. A new feature calls `requireAttestation`; Notes
 * Import's kickoff keeps its own protocol gate (it still accepts App Attest
 * v1) but verifies through the same helpers.
 */

/** A 503 that didn't say otherwise: worth one more try after a short wait. */
export const UNAVAILABLE_RETRY_AFTER_SECONDS = 30

/**
 * The attestation error response: the shared envelope (src/errors.ts) with a
 * human message in `error`, as shipped builds expect, plus the stable `code`
 * and, on attestation failures, `reason` and `action`. Every 503 carries
 * `Retry-After`.
 */
export const attestationError = (
  ctx: AppContext,
  status: number,
  error: string,
  code: string,
  reason?: AppAttestReason | PlayIntegrityReason,
  action?: AppAttestAction | PlayIntegrityAction,
  retryAfter: number | undefined = status === 503
    ? UNAVAILABLE_RETRY_AFTER_SECONDS
    : undefined
): Response => {
  const body: ErrorResponse = { ok: false, error, code }
  if (retryAfter != null) body.retryAfter = retryAfter
  if (reason) body.reason = reason
  if (action) body.action = action
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ctx.json(body, status as any, retryAfterHeaders(retryAfter))
}

export const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

export const isLowercaseSha256 = (value: string): boolean =>
  /^[a-f0-9]{64}$/.test(value)

/**
 * Shape gate for the client-supplied shared account id (witness-work ADR
 * 0011). It ends up in a `|`-delimited signed clientData field, a Durable
 * Object name, and a RevenueCat path segment, so keep it to a bounded
 * uuid-ish alphabet.
 */
export const isValidAccountId = (value: string): boolean =>
  /^[A-Za-z0-9_-]{8,64}$/.test(value)

export const attestationBadRequest = (
  ctx: AppContext,
  message: string
): Response =>
  attestationError(
    ctx,
    HTTP_STATUS.BAD_REQUEST,
    message,
    'bad_request',
    'invalid_request',
    'none'
  )

export const unsupportedProtocol = (
  ctx: AppContext,
  message: string
): Response =>
  attestationError(
    ctx,
    HTTP_STATUS.BAD_REQUEST,
    message,
    'bad_request',
    'unsupported_protocol',
    'none'
  )

export const appAttestFailureResponse = (
  ctx: AppContext,
  error: AppAttestError,
  input: unknown
): Response => {
  // Stable reason only: request bodies may contain a recovery token.
  console.warn('attestation: App Attest rejected:', error.reason)
  if (error.reason === 'storage_unavailable') Sentry.captureException(error)

  const version = appAttestProtocolVersion(input)
  const status = version === 1 && error.status < 500 ? 401 : error.status
  const code = appAttestHttpCode(version, error.reason)
  return attestationError(
    ctx,
    status,
    error.message,
    code,
    error.reason,
    error.action
  )
}

export const playIntegrityFailureResponse = (
  ctx: AppContext,
  error: PlayIntegrityError
): Response => {
  // Stable reason and policy detail only; never the token or verdict payload.
  console.warn(
    'attestation: Play Integrity rejected:',
    error.reason,
    error.message
  )
  if (error.reason === 'storage_unavailable') Sentry.captureException(error)
  return attestationError(
    ctx,
    error.status,
    error.message,
    error.status >= 500 ? 'server_error' : 'attestation_failed',
    error.reason,
    error.action,
    error.status === 429
      ? PLAY_INTEGRITY_CHALLENGE_TTL_SECONDS
      : error.status === 503
        ? UNAVAILABLE_RETRY_AFTER_SECONDS
        : undefined
  )
}

export const parseV2AssertionChallengeRequest = (
  record: Record<string, unknown>
): V2AssertionChallengeRequest | null => {
  const operationId = asString(record.operationId)
  const uuid = asString(record.uuid)
  const keyId = asString(record.keyId)
  const purpose = asString(record.purpose)
  const contentHash = asString(record.contentHash)
  const requestHash = asString(record.requestHash)
  const accountId =
    record.accountId == null ? undefined : asString(record.accountId)
  if (
    record.protocolVersion !== 2 ||
    record.operation !== 'assert' ||
    !operationId ||
    !isAppAttestOperationId(operationId) ||
    !uuid ||
    !isAppAttestUuid(uuid) ||
    !keyId ||
    !isAppAttestKeyId(keyId) ||
    !purpose ||
    !isAttestationPurpose(purpose) ||
    (record.accountId != null &&
      (!accountId || !isValidAccountId(accountId))) ||
    !contentHash ||
    !isLowercaseSha256(contentHash) ||
    !requestHash ||
    !isLowercaseSha256(requestHash)
  ) {
    return null
  }
  return {
    protocolVersion: 2,
    operation: 'assert',
    operationId,
    uuid,
    keyId,
    purpose,
    ...(accountId ? { accountId } : {}),
    contentHash,
    requestHash,
  }
}

export const parseV2AssertionFinalRequest = (
  record: Record<string, unknown>,
  expectedPurpose: AttestationPurpose
): V2AssertionFinalRequest | null => {
  const challengeRequest = parseV2AssertionChallengeRequest(record)
  const challenge = asString(record.challenge)
  const assertion = asString(record.assertion)
  if (
    !challengeRequest ||
    challengeRequest.purpose !== expectedPurpose ||
    !challenge ||
    !isAppAttestChallenge(challenge) ||
    !assertion ||
    assertion.length > 65_536
  ) {
    return null
  }
  return { ...challengeRequest, challenge, assertion }
}

const storageUnavailable = (cause: unknown): AppAttestError =>
  new AppAttestError('App Attest storage is temporarily unavailable', {
    reason: 'storage_unavailable',
    action: 'retry',
    status: 503,
    cause,
  })

export const issueV2AssertionChallenge = async (
  ctx: AppContext,
  request: V2AssertionChallengeRequest
) => {
  try {
    const id = ctx.env.APP_ATTEST_IDENTITY.idFromName(request.uuid)
    const result = await ctx.env.APP_ATTEST_IDENTITY.get(id).issueChallenge(
      request
    )
    if (!result.ok) throw AppAttestError.fromFailure(result.error)
    return result.value
  } catch (error) {
    if (error instanceof AppAttestError) throw error
    throw storageUnavailable(error)
  }
}

export const verifyV2Assertion = async (
  ctx: AppContext,
  request: V2AssertionFinalRequest
) => {
  try {
    const id = ctx.env.APP_ATTEST_IDENTITY.idFromName(request.uuid)
    const result = await ctx.env.APP_ATTEST_IDENTITY.get(id).verifyAssertion(
      request
    )
    if (!result.ok) throw AppAttestError.fromFailure(result.error)
    return result.value
  } catch (error) {
    if (error instanceof AppAttestError) throw error
    throw storageUnavailable(error)
  }
}

const playIntegrityDependencies = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  now: () => Date.now(),
  report: (error: Error) => {
    Sentry.captureException(error)
  },
}

/** Android's protected-request check (ADR 0017); null when it passed. */
export const verifyPlayIntegrityRecord = async (
  ctx: AppContext,
  record: Record<string, unknown>,
  purpose: AttestationPurpose
): Promise<Response | null> => {
  const request = parsePlayIntegrityAssertionRequest(record, purpose)
  if (!request) {
    return attestationBadRequest(ctx, 'Invalid Play Integrity request')
  }
  try {
    await verifyPlayIntegrityAssertion(
      ctx.env,
      request,
      playIntegrityDependencies
    )
    return null
  } catch (e) {
    if (e instanceof PlayIntegrityError) {
      return playIntegrityFailureResponse(ctx, e)
    }
    Sentry.captureException(e)
    return attestationError(
      ctx,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Auth error',
      'server_error'
    )
  }
}

/** iOS's protected-request check (App Attest v2); null when it passed. */
export const verifyAppAttestV2Record = async (
  ctx: AppContext,
  record: Record<string, unknown>,
  request: V2AssertionFinalRequest
): Promise<Response | null> => {
  try {
    await verifyV2Assertion(ctx, request)
    return null
  } catch (e) {
    if (e instanceof AppAttestError) {
      return appAttestFailureResponse(ctx, e, record)
    }
    Sentry.captureException(e)
    return attestationError(
      ctx,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Auth error',
      'server_error'
    )
  }
}

/** Which provider attested a request: App Attest (iOS) or Play Integrity. */
export type AttestedPlatform = 'ios' | 'android'

/**
 * `requireAttestation`'s check for a route with its own error format (the
 * accounts envelope, say): resolves with the platform that attested, or
 * throws `AppAttestError` / `PlayIntegrityError` with its stable `reason`.
 * A request that doesn't parse for `purpose` is `invalid_request`, and
 * anything but App Attest v2 or Play Integrity `unsupported_protocol`. The
 * route checks its hashes first, as for `requireAttestation`.
 */
export const verifyAttestation = async (
  ctx: AppContext,
  record: Record<string, unknown>,
  purpose: AttestationPurpose
): Promise<AttestedPlatform> => {
  if (isPlayIntegrityRequest(record)) {
    const request = parsePlayIntegrityAssertionRequest(record, purpose)
    if (!request) {
      throw new PlayIntegrityError(
        'invalid_request',
        'Invalid Play Integrity request'
      )
    }
    await verifyPlayIntegrityAssertion(
      ctx.env,
      request,
      playIntegrityDependencies
    )
    return 'android'
  }
  if (appAttestProtocolVersion(record) !== 2) {
    throw new AppAttestError(
      'This request requires App Attest v2 or Play Integrity',
      { reason: 'unsupported_protocol', status: HTTP_STATUS.BAD_REQUEST }
    )
  }
  const request = parseV2AssertionFinalRequest(record, purpose)
  if (!request) {
    throw new AppAttestError('Invalid App Attest v2 assertion', {
      reason: 'invalid_request',
      status: HTTP_STATUS.BAD_REQUEST,
    })
  }
  await verifyV2Assertion(ctx, request)
  return 'ios'
}

/**
 * The attestation check for a protected request: App Attest v2 (iOS) or Play
 * Integrity (Android), signed for `purpose`; App Attest v1 is refused. Null
 * when the request passed, else the response to send.
 *
 * The route recomputes its own `contentHash` and `requestHash` from the
 * payload and rejects a mismatch before calling this, so the assertion
 * provably covers what the route is about to act on. Challenges come from
 * `POST /attestation/v1/challenge` with the same purpose and hashes.
 */
export const requireAttestation = async (
  ctx: AppContext,
  record: Record<string, unknown>,
  purpose: AttestationPurpose,
  unsupportedMessage = 'This request requires App Attest v2 or Play Integrity'
): Promise<Response | null> => {
  if (isPlayIntegrityRequest(record)) {
    return verifyPlayIntegrityRecord(ctx, record, purpose)
  }
  const request =
    appAttestProtocolVersion(record) === 2
      ? parseV2AssertionFinalRequest(record, purpose)
      : null
  if (!request) return unsupportedProtocol(ctx, unsupportedMessage)
  return verifyAppAttestV2Record(ctx, record, request)
}
