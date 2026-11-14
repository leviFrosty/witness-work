import type { MiddlewareHandler } from 'hono'
import type { AppContext, Environment } from '../types'
import { HTTP_STATUS } from '../config'
import { Sentry } from '../sentry'
import { matchesDevBypass, resolveDevBypassToken } from '../devBypass'
import {
  appAttestLifecycle,
  appAttestProtocolVersion,
  AppAttestError,
} from '../appAttest'
import {
  isAppAttestOperationId,
  type V2AssertionFinalRequest,
} from '../appAttest/protocol'
import {
  PlayIntegrityError,
  isPlayIntegrityRequest,
  issuePlayIntegrityChallenge,
  parsePlayIntegrityChallengeRequest,
} from '../playIntegrity'
import { attestationStatus } from './status'
import {
  ATTESTATION_VERIFY_PURPOSE,
  NOTES_IMPORT_VERIFY_PURPOSE,
  isVerifyPurpose,
} from './purposes'
import {
  appAttestFailureResponse,
  asRecord,
  asString,
  attestationBadRequest,
  attestationError,
  isLowercaseSha256,
  isValidAccountId,
  issueV2AssertionChallenge,
  parseV2AssertionChallengeRequest,
  parseV2AssertionFinalRequest,
  playIntegrityFailureResponse,
  unsupportedProtocol,
  verifyPlayIntegrityRecord,
  verifyV2Assertion,
} from './http'

/**
 * `/attestation/v1/*`: device attestation for the whole API, App Attest on
 * iOS and Play Integrity on Android. A device gets a challenge here, registers
 * its App Attest key here, and can prove the whole path with `verify`; each
 * protected route then checks its own assertion (src/attestation/http.ts).
 *
 * These lived under `/notes-import/` until 2026-10. The old paths still serve
 * the same handlers for deployed apps, marked with `deprecatedPath`.
 */

export const ATTESTATION_BASE_PATH = '/attestation/v1'

const readOptionalJson = async (
  ctx: AppContext
): Promise<{ ok: true; value: unknown } | { ok: false }> => {
  const text = await ctx.req.text()
  if (!text.trim()) return { ok: true, value: undefined }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

/** POST /attestation/v1/challenge: an App Attest (v1 or v2) or Play Integrity challenge. */
export async function handleAttestationChallengeRequest(ctx: AppContext) {
  const parsed = await readOptionalJson(ctx)
  if (!parsed.ok) return attestationBadRequest(ctx, 'Invalid JSON')
  if (parsed.value !== undefined && !asRecord(parsed.value)) {
    return attestationBadRequest(ctx, 'Invalid JSON body')
  }
  const record = asRecord(parsed.value)
  if (record && isPlayIntegrityRequest(record)) {
    const request = parsePlayIntegrityChallengeRequest(record)
    if (!request) {
      return attestationBadRequest(ctx, 'Invalid Play Integrity challenge')
    }
    try {
      return ctx.json(await issuePlayIntegrityChallenge(ctx.env, request))
    } catch (e) {
      if (e instanceof PlayIntegrityError) {
        return playIntegrityFailureResponse(ctx, e)
      }
      Sentry.captureException(e)
      return attestationError(
        ctx,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Challenge error',
        'server_error'
      )
    }
  }
  const isV2Assertion =
    record?.protocolVersion === 2 && record.operation === 'assert'
  const v2AssertionRequest = isV2Assertion
    ? parseV2AssertionChallengeRequest(record)
    : null
  if (isV2Assertion && !v2AssertionRequest) {
    return attestationBadRequest(
      ctx,
      'Invalid App Attest v2 assertion challenge'
    )
  }

  try {
    const response = v2AssertionRequest
      ? await issueV2AssertionChallenge(ctx, v2AssertionRequest)
      : await appAttestLifecycle(ctx.env).issueChallenge(parsed.value)
    return ctx.json(response)
  } catch (e) {
    if (e instanceof AppAttestError) {
      return appAttestFailureResponse(ctx, e, parsed.value)
    }
    Sentry.captureException(e)
    return attestationError(
      ctx,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Challenge error',
      'server_error'
    )
  }
}

/** POST /attestation/v1/register: bind an App Attest key or enroll v2 recovery. */
export async function handleAttestationRegisterRequest(ctx: AppContext) {
  let parsed: unknown
  try {
    parsed = await ctx.req.json()
  } catch {
    return attestationBadRequest(ctx, 'Invalid JSON')
  }
  const body = asRecord(parsed)
  if (!body) return attestationBadRequest(ctx, 'Invalid JSON body')
  // Play Integrity has no key to register; every request carries a token.
  if (isPlayIntegrityRequest(body)) {
    return unsupportedProtocol(ctx, 'Play Integrity has no registration step')
  }

  // Keep the deployed v1 request gate and top-level error text unchanged.
  if (appAttestProtocolVersion(body) === 1) {
    const keyId = asString(body.keyId)
    const attestation = asString(body.attestation)
    const challenge = asString(body.challenge)
    const uuid = asString(body.uuid)
    if (!keyId || !attestation || !challenge || !uuid) {
      return attestationBadRequest(
        ctx,
        'Missing keyId, attestation, challenge, or uuid'
      )
    }
  }

  try {
    const response = await appAttestLifecycle(ctx.env).register(body)
    return ctx.json(response)
  } catch (e) {
    if (e instanceof AppAttestError) {
      return appAttestFailureResponse(ctx, e, body)
    }
    Sentry.captureException(e)
    return attestationError(
      ctx,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Attestation error',
      'server_error'
    )
  }
}

/**
 * POST /attestation/v1/verify: an attested no-op for the app's developer
 * tools. Runs the same verification the protected routes use (challenge
 * consumption and sign-count advance included) but spends nothing, so the
 * Tools screen can prove the whole attestation path server-side. There is no
 * payload, so `requestHash` must equal the client-chosen `contentHash`.
 *
 * The purpose is `attestation-verify`; `notes-import-verify`, which deployed
 * apps sign, is accepted too, on both paths.
 */
export async function handleAttestationVerifyRequest(ctx: AppContext) {
  let parsed: unknown
  try {
    parsed = await ctx.req.json()
  } catch {
    return attestationBadRequest(ctx, 'Invalid JSON')
  }
  const body = asRecord(parsed)
  if (!body) return attestationBadRequest(ctx, 'Invalid JSON body')

  const devBypass = matchesDevBypass(
    resolveDevBypassToken(ctx.env),
    ctx.req.header('x-ww-dev-bypass')
  )
  if (devBypass) {
    const version = appAttestProtocolVersion(body)
    if (version === 2) {
      const operationId = asString(body.operationId)
      const contentHash = asString(body.contentHash)
      const requestHash = asString(body.requestHash)
      if (
        !operationId ||
        !isAppAttestOperationId(operationId) ||
        body.operation !== 'assert' ||
        !isVerifyPurpose(body.purpose) ||
        !contentHash ||
        !isLowercaseSha256(contentHash) ||
        requestHash !== contentHash
      ) {
        return attestationBadRequest(ctx, 'Invalid App Attest v2 bypass probe')
      }
      return ctx.json({ ok: true, protocolVersion: 2, operationId })
    }
    return ctx.json({ ok: true })
  }

  // An unknown purpose falls through to a purpose mismatch below.
  const purpose = isVerifyPurpose(body.purpose)
    ? body.purpose
    : ATTESTATION_VERIFY_PURPOSE

  if (isPlayIntegrityRequest(body)) {
    // Same no-payload probe contract as App Attest v2 verify.
    if (body.requestHash !== body.contentHash) {
      return attestationBadRequest(
        ctx,
        'requestHash must equal contentHash for Play Integrity verify'
      )
    }
    const failure = await verifyPlayIntegrityRecord(ctx, body, purpose)
    if (failure) return failure
    return ctx.json({
      ok: true,
      attestationProvider: 'play-integrity',
      protocolVersion: 1,
      operationId: body.operationId,
    })
  }

  const uuid = asString(body.uuid)
  const keyId = asString(body.keyId)
  const challenge = asString(body.challenge)
  const assertion = asString(body.assertion)
  const contentHash = asString(body.contentHash)
  if (!uuid || !keyId || !challenge || !assertion || !contentHash) {
    return attestationBadRequest(
      ctx,
      'Missing uuid, keyId, challenge, assertion, or contentHash'
    )
  }
  // Same shape gates as the protected routes: both values end up in the
  // `|`-delimited signed clientData, so keep them to their bounded alphabets.
  const accountId = body.accountId != null ? asString(body.accountId) : null
  if (body.accountId != null && (!accountId || !isValidAccountId(accountId))) {
    return attestationBadRequest(ctx, 'Invalid accountId')
  }
  if (!isLowercaseSha256(contentHash)) {
    return attestationBadRequest(ctx, 'Invalid contentHash')
  }

  const version = appAttestProtocolVersion(body)
  let v2Request: V2AssertionFinalRequest | null = null
  if (version === 2) {
    const requestHash = asString(body.requestHash)
    if (
      !requestHash ||
      !isLowercaseSha256(requestHash) ||
      requestHash !== contentHash
    ) {
      return attestationBadRequest(
        ctx,
        'requestHash must equal contentHash for App Attest verify'
      )
    }
    v2Request = parseV2AssertionFinalRequest(body, purpose)
    if (!v2Request) {
      return attestationBadRequest(
        ctx,
        'Invalid App Attest v2 verify assertion'
      )
    }
  }

  try {
    const response = v2Request
      ? await verifyV2Assertion(ctx, v2Request)
      : // v1 doesn't sign a purpose; the binding still names one.
        await appAttestLifecycle(ctx.env).verifyAssertion(body, {
          uuid,
          accountId: accountId ?? undefined,
          contentHash,
          purpose: NOTES_IMPORT_VERIFY_PURPOSE,
        })
    return ctx.json(response)
  } catch (e) {
    if (e instanceof AppAttestError) {
      return appAttestFailureResponse(ctx, e, body)
    }
    Sentry.captureException(e)
    return attestationError(
      ctx,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Verify error',
      'server_error'
    )
  }
}

/**
 * GET /attestation/v1/status: the providers this worker accepts, as
 * `capabilities` (the same objects `GET /notes-import/status` carries).
 */
export function handleAttestationStatusRequest(ctx: AppContext) {
  return ctx.json(attestationStatus(ctx.env), 200, {
    'Cache-Control': 'no-store',
  })
}

/** When the `/notes-import/*` attestation paths were deprecated (RFC 9745). */
const DEPRECATED_AT = `@${Date.UTC(2026, 9, 15) / 1000}`

/**
 * Marks an old path that serves the same handler as its successor: adds
 * `Deprecation` (RFC 9745) and a `successor-version` link, and logs the hit
 * (route names only) so Workers Logs shows when old clients stop calling it.
 */
export const deprecatedPath =
  (
    path: string,
    successor: string
  ): MiddlewareHandler<{ Bindings: Environment }> =>
  async (ctx, next) => {
    console.log(`deprecated path: ${path} -> ${successor}`)
    await next()
    ctx.res.headers.set('Deprecation', DEPRECATED_AT)
    ctx.res.headers.append('Link', `<${successor}>; rel="successor-version"`)
  }
