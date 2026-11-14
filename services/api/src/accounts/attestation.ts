import type { AppContext } from '../types'
import { captureFailure } from '../sentry'
import { isPlainObject } from '../buddies/contracts'
import {
  buddiesErrorResponse,
  buddiesInternalError,
} from '../buddies/errorResponse'
import {
  AppAttestError,
  type AppAttestAction,
  type AppAttestReason,
} from '../appAttest'
import { APP_ATTEST_CHALLENGE_TTL_SECONDS } from '../appAttest/protocol'
import { PlayIntegrityError, type PlayIntegrityReason } from '../playIntegrity'
import type { PlayIntegrityAction } from '../playIntegrity/errors'
import { verifyAttestation, type AttestedPlatform } from '../attestation/http'
import { ACCOUNT_SESSION_PURPOSE } from '../attestation/purposes'
import { matchesDevBypass, resolveDevBypassToken } from '../devBypass'
import { sessionAttestationHash } from './contracts'

/**
 * Attesting a session (witness-work ADR 0027): the answer to a
 * `POST /attestation/v1/challenge` challenge under purpose `account-session`,
 * App Attest v2 `assert` (iOS) or Play Integrity v1 (Android), with
 * `contentHash` and `requestHash` both `sessionAttestationHash(accountPub)`.
 * The App Attest key is the install's (`AppAttestIdentity` per install uuid),
 * bound through `POST /attestation/v1/register`. Verified by the shared
 * registry's `verifyAttestation` (src/attestation/http.ts).
 *
 * Refusals use the accounts envelope: a malformed attestation, or one for
 * another key, is 400 `bad_request`, too many open challenges 429
 * `rate_limited`, our own storage failing 500 `internal`, and everything
 * else 403 `attestation_failed`. Each carries the stable `reason` and
 * `action` the attestation routes use.
 *
 * Privacy: logs carry the reason only, never tokens, assertions, or ids.
 */

type Reason = AppAttestReason | PlayIntegrityReason
type Action = AppAttestAction | PlayIntegrityAction

const refusal = (reason: Reason, action: Action, cause?: unknown): Response => {
  console.warn('accounts: session attestation rejected', { reason })
  const extras = { reason, action }
  switch (reason) {
    case 'invalid_request':
    case 'unsupported_protocol':
      return buddiesErrorResponse('bad_request', { extras })
    case 'too_many_challenges':
      return buddiesErrorResponse('rate_limited', {
        retryAfterSeconds: APP_ATTEST_CHALLENGE_TTL_SECONDS,
        extras,
      })
    case 'storage_unavailable':
      captureFailure(cause, 'session/open attestation')
      return buddiesInternalError()
    default:
      return buddiesErrorResponse('attestation_failed', { extras })
  }
}

/**
 * The development worker's stand-in for attestation: `x-ww-dev-bypass`
 * matching `NOTES_IMPORT_DEV_BYPASS_TOKEN` (src/devBypass.ts). Production
 * ignores the header, and throws when the token is set there.
 */
export const isSessionDevBypass = (c: AppContext): boolean =>
  matchesDevBypass(
    resolveDevBypassToken(c.env),
    c.req.header('x-ww-dev-bypass')
  )

/**
 * The session's attestation: the answer to an `account-session` challenge
 * whose hashes are `sessionAttestationHash(accountPub)` for the envelope's
 * own key. Consumes the challenge.
 */
export const verifySessionAttestation = async (
  c: AppContext,
  attestation: Record<string, unknown> | null,
  accountPub: string
): Promise<
  { ok: true; platform: AttestedPlatform } | { ok: false; response: Response }
> => {
  const expected = await sessionAttestationHash(accountPub)
  if (
    !isPlainObject(attestation) ||
    attestation.purpose !== ACCOUNT_SESSION_PURPOSE ||
    attestation.contentHash !== expected ||
    attestation.requestHash !== expected
  )
    return { ok: false, response: refusal('invalid_request', 'none') }
  try {
    return {
      ok: true,
      platform: await verifyAttestation(
        c,
        attestation,
        ACCOUNT_SESSION_PURPOSE
      ),
    }
  } catch (error) {
    if (error instanceof AppAttestError || error instanceof PlayIntegrityError)
      return {
        ok: false,
        response: refusal(error.reason, error.action, error),
      }
    throw error
  }
}
