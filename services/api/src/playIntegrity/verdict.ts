import { z } from 'zod'
import type { PlayIntegrityConfig, RequiredDeviceVerdict } from './config'
import type { PlayIntegrityReason } from './errors'

/**
 * The decoded `tokenPayloadExternal` fields this policy reads. Unknown and
 * optional verdicts are ignored, so opting into more responses in Play Console
 * never breaks verification.
 */
export const tokenPayloadSchema = z.object({
  requestDetails: z
    .object({
      requestPackageName: z.string().optional(),
      requestHash: z.string().optional(),
      timestampMillis: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
  appIntegrity: z
    .object({
      appRecognitionVerdict: z.string().optional(),
      packageName: z.string().optional(),
      certificateSha256Digest: z.array(z.string()).optional(),
      versionCode: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
  deviceIntegrity: z
    .object({
      deviceRecognitionVerdict: z.array(z.string()).optional(),
    })
    .optional(),
})

export type TokenPayload = z.infer<typeof tokenPayloadSchema>

/** Labels that satisfy each requirement; a stronger verdict always qualifies. */
const SATISFYING_VERDICTS: Record<RequiredDeviceVerdict, readonly string[]> = {
  MEETS_BASIC_INTEGRITY: [
    'MEETS_BASIC_INTEGRITY',
    'MEETS_DEVICE_INTEGRITY',
    'MEETS_STRONG_INTEGRITY',
  ],
  MEETS_DEVICE_INTEGRITY: ['MEETS_DEVICE_INTEGRITY', 'MEETS_STRONG_INTEGRITY'],
  MEETS_STRONG_INTEGRITY: ['MEETS_STRONG_INTEGRITY'],
}

/** Clock skew tolerated between Google's token timestamp and this Worker. */
const MAX_FUTURE_SKEW_MS = 60_000

export interface VerdictExpectation {
  /** Lowercase hex SHA-256 of the request's client data. */
  requestBinding: string
  /** When the consumed challenge was issued; a valid token cannot predate it. */
  challengeIssuedAt: number
  now: number
}

export type VerdictResult =
  | { ok: true }
  | { ok: false; reason: PlayIntegrityReason; detail: string }

const reject = (
  reason: PlayIntegrityReason,
  detail: string
): VerdictResult => ({ ok: false, reason, detail })

/**
 * Applies ADR 0017's policy to a decoded payload. Binding and freshness come
 * first: a payload for another app, request, or time is invalid regardless of
 * its verdicts. Device integrity is checked before app recognition because Play
 * leaves the app verdict UNEVALUATED on devices that fail integrity.
 *
 * Licensing is never required: WitnessWork is free, and a genuine Play binary
 * on a genuine device is the same client whether or not this account installed
 * it from Play.
 */
export const evaluateVerdict = (
  payload: TokenPayload,
  config: PlayIntegrityConfig,
  expected: VerdictExpectation
): VerdictResult => {
  const request = payload.requestDetails
  if (request?.requestPackageName !== config.packageName) {
    return reject('integrity_token_invalid', 'request package mismatch')
  }
  if (request.requestHash !== expected.requestBinding) {
    return reject('integrity_token_invalid', 'request hash mismatch')
  }
  const issuedAt = Number(request.timestampMillis)
  if (
    !Number.isFinite(issuedAt) ||
    issuedAt < expected.challengeIssuedAt - MAX_FUTURE_SKEW_MS ||
    issuedAt > expected.now + MAX_FUTURE_SKEW_MS
  ) {
    return reject('integrity_token_invalid', 'token timestamp out of range')
  }

  const deviceVerdicts =
    payload.deviceIntegrity?.deviceRecognitionVerdict ?? []
  const satisfying = SATISFYING_VERDICTS[config.requiredDeviceVerdict]
  if (!deviceVerdicts.some((verdict) => satisfying.includes(verdict))) {
    return reject('device_integrity_failed', 'device verdict not met')
  }

  const app = payload.appIntegrity
  if (app?.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
    return reject('app_not_recognized', 'app not recognized by Play')
  }
  if (app.packageName !== config.packageName) {
    return reject('app_not_recognized', 'app package mismatch')
  }
  if (
    config.certificateDigests.length > 0 &&
    !(app.certificateSha256Digest ?? []).some((digest) =>
      config.certificateDigests.includes(digest)
    )
  ) {
    return reject('app_not_recognized', 'signing certificate mismatch')
  }

  return { ok: true }
}
