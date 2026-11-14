import type { Environment } from '../types'
import { playIntegrityConfig, type PlayIntegrityEnv } from './config'
import { decodeIntegrityToken } from './decode'
import { PlayIntegrityError } from './errors'
import { getPlayIntegrityAccessToken, GoogleAuthError } from '../googleAuth'
import {
  PLAY_INTEGRITY_PROTOCOL_VERSION,
  PLAY_INTEGRITY_PROVIDER,
  computePlayIntegrityRequestBinding,
  type PlayIntegrityAssertionRequest,
  type PlayIntegrityAssertionResponse,
  type PlayIntegrityChallengeRequest,
  type PlayIntegrityChallengeResponse,
} from './protocol'
import { evaluateVerdict } from './verdict'

export { PlayIntegrityError, type PlayIntegrityReason } from './errors'
export { playIntegrityConfig } from './config'
export {
  PLAY_INTEGRITY_PROTOCOL_VERSION,
  PLAY_INTEGRITY_PROVIDER,
  isPlayIntegrityRequest,
  parsePlayIntegrityAssertionRequest,
  parsePlayIntegrityChallengeRequest,
} from './protocol'

export type PlayIntegrityServiceEnv = PlayIntegrityEnv &
  Pick<Environment, 'PLAY_INTEGRITY_CHALLENGES'>

export interface PlayIntegrityServiceDependencies {
  fetch: typeof fetch
  now(): number
  /** Operator-actionable failures (credentials, quota); never request data. */
  report(error: Error): void
}

const notConfigured = (): PlayIntegrityError =>
  new PlayIntegrityError(
    'integrity_unavailable',
    'Play Integrity is not configured on this worker'
  )

const storageUnavailable = (cause: unknown): PlayIntegrityError =>
  new PlayIntegrityError(
    'storage_unavailable',
    'Play Integrity storage is temporarily unavailable',
    { cause }
  )

const challengeStub = (env: PlayIntegrityServiceEnv, uuid: string) =>
  env.PLAY_INTEGRITY_CHALLENGES.get(
    env.PLAY_INTEGRITY_CHALLENGES.idFromName(uuid)
  )

export const issuePlayIntegrityChallenge = async (
  env: PlayIntegrityServiceEnv,
  request: PlayIntegrityChallengeRequest
): Promise<PlayIntegrityChallengeResponse> => {
  if (!playIntegrityConfig(env)) throw notConfigured()
  let result
  try {
    result = await challengeStub(env, request.uuid).issueChallenge(request)
  } catch (error) {
    throw storageUnavailable(error)
  }
  if (!result.ok) throw PlayIntegrityError.fromFailure(result.error)
  return result.value
}

/**
 * The Android security boundary: consume the one-time challenge, have Google
 * decode the token, then require the request binding, a Play-recognized app,
 * and the configured device verdict. Throws {@link PlayIntegrityError}.
 */
export const verifyPlayIntegrityAssertion = async (
  env: PlayIntegrityServiceEnv,
  request: PlayIntegrityAssertionRequest,
  dependencies: PlayIntegrityServiceDependencies
): Promise<PlayIntegrityAssertionResponse> => {
  const config = playIntegrityConfig(env)
  if (!config) throw notConfigured()

  // Consume before decoding: one challenge buys at most one decode, which
  // also bounds how much of the daily decode quota a client can spend.
  const { integrityToken, ...bound } = request
  let consumed
  try {
    consumed = await challengeStub(env, request.uuid).consumeChallenge(bound)
  } catch (error) {
    throw storageUnavailable(error)
  }
  if (!consumed.ok) throw PlayIntegrityError.fromFailure(consumed.error)

  let accessToken: string
  try {
    accessToken = await getPlayIntegrityAccessToken(
      config.serviceAccountJson,
      dependencies
    )
  } catch (error) {
    const reported =
      error instanceof GoogleAuthError
        ? error
        : new GoogleAuthError('Google token exchange failed', { cause: error })
    dependencies.report(reported)
    throw new PlayIntegrityError('integrity_unavailable', reported.message, {
      cause: error,
    })
  }

  let decoded
  try {
    decoded = await decodeIntegrityToken({
      packageName: config.packageName,
      integrityToken,
      accessToken,
      fetch: dependencies.fetch,
    })
  } catch (error) {
    throw new PlayIntegrityError(
      'integrity_unavailable',
      'Play Integrity decode request failed',
      { cause: error }
    )
  }
  if (!decoded.ok) {
    if (decoded.kind === 'invalid_token') {
      throw new PlayIntegrityError(
        'integrity_token_invalid',
        'Google could not decode the integrity token'
      )
    }
    const error = new PlayIntegrityError(
      'integrity_unavailable',
      `Play Integrity decode failed with HTTP ${decoded.status}`
    )
    dependencies.report(error)
    throw error
  }

  const verdict = evaluateVerdict(decoded.payload, config, {
    requestBinding: await computePlayIntegrityRequestBinding(bound),
    challengeIssuedAt: consumed.value.issuedAt,
    now: dependencies.now(),
  })
  if (!verdict.ok) throw new PlayIntegrityError(verdict.reason, verdict.detail)

  return {
    ok: true,
    attestationProvider: PLAY_INTEGRITY_PROVIDER,
    protocolVersion: PLAY_INTEGRITY_PROTOCOL_VERSION,
    operationId: request.operationId,
  }
}
