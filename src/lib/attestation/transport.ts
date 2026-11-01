import apis from '@/constants/apis'
import { apiDevBypass } from '@/lib/http/devBypass'
import { HttpError, request } from '@/lib/http/request'
import { perf } from '@/lib/perf'
import {
  AttestationHttpError,
  type AttestationEndpoint,
} from '@/lib/attestation/appAttest'

export const STATUS_TIMEOUT_MS = 8_000

export const ENDPOINT_TIMEOUT_MS: Record<AttestationEndpoint, number> = {
  challenge: 15_000,
  registration: 15_000,
  verify: 15_000,
}

export const attestationDevBypass = apiDevBypass

export const attestationBaseUrl = apis.attestationStatus.replace(
  /\/attestation\/v1\/status$/,
  ''
)

const endpointUrl = (endpoint: AttestationEndpoint): string => {
  switch (endpoint) {
    case 'challenge':
      return apis.attestationChallenge
    case 'registration':
      return apis.attestationRegister
    case 'verify':
      return apis.attestationVerify
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
    ...(retryAfterMs !== null && { retryAfterMs }),
  })
}

let statusInFlight: Promise<unknown> | null = null

const getStatus = (): Promise<unknown> => {
  if (statusInFlight) return statusInFlight
  perf.count('attestation:statusProbe')
  const pending = request<unknown>({
    url: apis.attestationStatus,
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
