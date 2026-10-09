import apis from '@/constants/apis'
import { apiDevBypass } from '@/lib/http/devBypass'
import { HttpError, request } from '@/lib/http/request'
import { perf } from '@/lib/perf'
import {
  NotesImportAppAttestHttpError,
  type NotesImportAppAttestEndpoint,
} from '@/features/notes-import/lib/notesImportAppAttest'

/**
 * HTTP transport shared by both Notes Import authorizers (App Attest on iOS,
 * Play Integrity on Android) and the availability check. Failures become
 * sanitized {@link NotesImportAppAttestHttpError}s carrying only stable
 * metadata.
 */

/** Unauthenticated availability/capability probe. */
export const STATUS_TIMEOUT_MS = 8_000
/**
 * Per-endpoint budgets. Only the legacy blocking POST waits for the model; the
 * attestation round-trips and the streaming kickoff return quickly, so a
 * stalled connection there fails in seconds instead of a minute and a half.
 */
export const ENDPOINT_TIMEOUT_MS: Record<NotesImportAppAttestEndpoint, number> =
  {
    challenge: 15_000,
    registration: 15_000,
    verify: 15_000,
    kickoff: 15_000,
    legacy: 90_000,
  }

/** The shared dev-worker bypass (`@/lib/http/devBypass`). */
export const notesImportDevBypass = apiDevBypass

export const notesImportBaseUrl = apis.notesImport.replace(
  /\/notes-import$/,
  ''
)

const endpointUrl = (endpoint: NotesImportAppAttestEndpoint): string => {
  switch (endpoint) {
    case 'challenge':
      return apis.notesImportChallenge
    case 'registration':
      return apis.notesImportAttest
    case 'kickoff':
      return apis.notesImportKickoff
    case 'legacy':
      return apis.notesImport
    case 'verify':
      return apis.notesImportVerify
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * `request()` failures in the shape the authorizers branch on. Notes Import
 * bodies carry the stable code in `code` (`error` is human text), so read it
 * from the body rather than `HttpError.serverCode`.
 */
export const toNotesImportHttpError = (
  error: unknown
): NotesImportAppAttestHttpError => {
  if (error instanceof NotesImportAppAttestHttpError) return error
  if (!(error instanceof HttpError)) {
    return new NotesImportAppAttestHttpError({
      kind:
        error instanceof Error && error.name === 'AbortError'
          ? 'cancelled'
          : 'network',
    })
  }
  if (error.kind === 'cancelled') {
    return new NotesImportAppAttestHttpError({ kind: 'cancelled' })
  }
  if (error.status === null) {
    // No response: offline, refused, or the timeout fired.
    return new NotesImportAppAttestHttpError({
      kind: 'network',
      timedOut: error.kind === 'timeout',
    })
  }
  const payload = isRecord(error.body) ? error.body : null
  const bodyRetryAfter =
    typeof payload?.retryAfter === 'number' ? payload.retryAfter * 1000 : null
  const retryAfterMs = error.retryAfterMs ?? bodyRetryAfter
  return new NotesImportAppAttestHttpError({
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
      throw toNotesImportHttpError(error)
    })
    .finally(() => {
      if (statusInFlight === pending) statusInFlight = null
    })
  statusInFlight = pending
  return pending
}

export const notesImportTransport = {
  getStatus,
  post: async <T>(
    endpoint: NotesImportAppAttestEndpoint,
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
      throw toNotesImportHttpError(error)
    }
  },
}
