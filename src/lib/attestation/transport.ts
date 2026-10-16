import apis from '@/constants/apis'
import { apiDevBypass } from '@/lib/http/devBypass'
import { HttpError, request } from '@/lib/http/request'
import { perf } from '@/lib/perf'
import {
  AttestationHttpError,
  type AttestationEndpoint,
} from '@/lib/attestation/appAttest'

/**
 * HTTP transport shared by both attestation authorizers (App Attest on iOS,
 * Play Integrity on Android) and Notes Import's availability check. The
 * install's App Attest key is registered at `/attestation/v1/register`, and
 * features other than Notes Import get challenges from
 * `/attestation/v1/challenge`. Notes Import keeps its own challenge and verify
 * routes, and both providers' capabilities are still read from its status.
 * Failures become sanitized {@link AttestationHttpError}s carrying only stable
 * metadata.
 */

/** Unauthenticated availability/capability probe. */
export const STATUS_TIMEOUT_MS = 8_000
/**
 * Per-endpoint budgets. Only the legacy blocking POST waits for the model; the
 * attestation round-trips and the streaming kickoff return quickly, so a
 * stalled connection there fails in seconds instead of a minute and a half.
 */
export const ENDPOINT_TIMEOUT_MS: Record<AttestationEndpoint, number> = {
  challenge: 15_000,
  attestationChallenge: 15_000,
  registration: 15_000,
  verify: 15_000,
  kickoff: 15_000,
  // Waits for the vision model to read one page.
  transcribe: 60_000,
  legacy: 90_000,
}

/** The shared dev-worker bypass (`@/lib/http/devBypass`). */
export const attestationDevBypass = apiDevBypass

export const attestationBaseUrl = apis.notesImport.replace(
  /\/notes-import$/,
  ''
)

const endpointUrl = (endpoint: AttestationEndpoint): string => {
  switch (endpoint) {
    case 'challenge':
      return apis.notesImportChallenge
    case 'attestationChallenge':
      return apis.attestationChallenge
    case 'registration':
      return apis.attestationRegister
    case 'kickoff':
      return apis.notesImportKickoff
    case 'transcribe':
      return apis.notesImportTranscribe
    case 'legacy':
      return apis.notesImport
    case 'verify':
      return apis.notesImportVerify
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * `request()` failures in the shape the authorizers branch on. ww-api's bodies
 * carry the stable code in `code` (`error` is human text), so read it from the
 * body rather than `HttpError.serverCode`.
 */
export const toAttestationHttpError = (
  error: unknown
): AttestationHttpError => {
  if (error instanceof AttestationHttpError) return error
  if (!(error instanceof HttpError)) {
    return new AttestationHttpError({
      kind:
        error instanceof Error && error.name === 'AbortError'
          ? 'cancelled'
          : 'network',
    })
  }
  if (error.kind === 'cancelled') {
    return new AttestationHttpError({ kind: 'cancelled' })
  }
  if (error.status === null) {
    // No response: offline, refused, or the timeout fired.
    return new AttestationHttpError({
      kind: 'network',
      timedOut: error.kind === 'timeout',
    })
  }
  const payload = isRecord(error.body) ? error.body : null
  const bodyRetryAfter =
    typeof payload?.retryAfter === 'number' ? payload.retryAfter * 1000 : null
  const retryAfterMs = error.retryAfterMs ?? bodyRetryAfter
  return new AttestationHttpError({
    kind: 'http',
    status: error.status,
    serverCode: typeof payload?.code === 'string' ? payload.code : undefined,
    reason: typeof payload?.reason === 'string' ? payload.reason : undefined,
    action: typeof payload?.action === 'string' ? payload.action : undefined,
    credits: payload?.credits,
    ...(retryAfterMs !== null && { retryAfterMs }),
  })
}

let statusInFlight: Promise<unknown> | null = null

/**
 * The one status probe. Availability, App Attest protocol negotiation and Play
 * Integrity's capability lookup all read it; concurrent callers share a single
 * request.
 */
const getStatus = (): Promise<unknown> => {
  if (statusInFlight) return statusInFlight
  perf.count('notesImport:statusProbe')
  const pending = request<unknown>({
    url: apis.notesImportStatus,
    timeoutMs: STATUS_TIMEOUT_MS,
  })
    .then(({ data }) => data)
    .catch((error: unknown) => {
      throw toAttestationHttpError(error)
    })
    .finally(() => {
      if (statusInFlight === pending) statusInFlight = null
    })
  statusInFlight = pending
  return pending
}

export const attestationTransport = {
  getStatus,
  post: async <T>(
    endpoint: AttestationEndpoint,
    body: Record<string, unknown>,
    options?: { headers?: Record<string, string>; signal?: AbortSignal }
  ): Promise<T> => {
    try {
      const { data } = await request<T>({
        url: endpointUrl(endpoint),
        method: 'POST',
        json: body,
        headers: options?.headers,
        signal: options?.signal,
        timeoutMs: ENDPOINT_TIMEOUT_MS[endpoint],
      })
      return data
    } catch (error) {
      throw toAttestationHttpError(error)
    }
  },
}
