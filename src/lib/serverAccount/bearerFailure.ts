import { HttpError } from '@/lib/http/request'
import {
  AccountSessionError,
  type AttestationProblem,
  OPEN_RETRY_AFTER_MS,
} from '@/lib/serverAccount/session'

export type BearerTransportCode =
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'unverified'
  | 'unknown'

export type BearerSessionCode =
  | 'upgrade_required'
  | 'disabled'
  | 'rate_limited'
  | 'unauthorized'

export type BearerFailure<C extends string> = {
  code: C | BearerSessionCode | BearerTransportCode
  status: number

  retryAfterMs: number | null

  attestation: AttestationProblem | null
}

const failure = (
  code: BearerSessionCode | BearerTransportCode,
  status: number,
  retryAfterMs: number | null = null,
  attestation: AttestationProblem | null = null
): BearerFailure<never> => ({ code, status, retryAfterMs, attestation })

function sessionFailure(error: AccountSessionError): BearerFailure<never> {
  const status = error.status ?? 0
  switch (error.failure) {
    case 'offline':
      return failure('network', 0)
    case 'cancelled':
      return failure('cancelled', 0)
    case 'attestation': {
      const problem = error.attestation ?? 'failed'
      return failure(
        'unverified',
        status,
        OPEN_RETRY_AFTER_MS[problem],
        problem
      )
    }
    case 'upgrade':
      return failure('upgrade_required', status || 426)
    case 'unavailable':
      return failure(
        error.serverCode === 'disabled' ? 'disabled' : 'unknown',
        status,
        error.retryAfterMs
      )
    case 'rateLimited':
      return failure('rate_limited', status || 429, error.retryAfterMs)
    case 'server':
      return failure(
        status === 401 ? 'unauthorized' : 'unknown',
        status,
        error.retryAfterMs
      )
  }
}

export function bearerFailure<C extends string>(
  error: unknown,
  codes: readonly C[]
): BearerFailure<C> {
  if (error instanceof AccountSessionError) return sessionFailure(error)
  if (!(error instanceof HttpError)) return failure('network', 0)
  switch (error.kind) {
    case 'offline':
      return failure('network', 0)
    case 'timeout':
      return failure('timeout', error.status ?? 0)
    case 'cancelled':
      return failure('cancelled', 0)
  }
  const code = codes.find((known) => known === error.serverCode)
  return {
    code: code ?? (error.status === 429 ? 'rate_limited' : 'unknown'),
    status: error.status ?? 0,
    retryAfterMs: error.retryAfterMs,
    attestation: null,
  }
}
