/**
 * One vocabulary for why a request failed, whatever made it: `request()`,
 * axios, React Native's fetch, a native SDK (RevenueCat), or a feature's own
 * error type (Buddies relay, sync transports, Notes Import).
 *
 * - `offline`: no connection, DNS failure, connection refused or dropped.
 * - `timeout`: started but didn't finish in time.
 * - `cancelled`: the caller aborted it; never an error to report or show.
 * - `rateLimited`: 429, or a service's own throttling code.
 * - `server`: 5xx; the service is having trouble.
 * - `client`: any other 4xx; retrying the same request won't help.
 * - `unknown`: not a recognisable network failure (a bug, a parse error).
 */
export type NetworkErrorKind =
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'rateLimited'
  | 'server'
  | 'client'
  | 'unknown'

/**
 * Message fragments for connection failures across iOS (NSURLError), Android
 * (OkHttp, java.net), React Native's fetch and axios.
 */
const OFFLINE_PATTERNS = [
  'internet connection appears to be offline',
  'network connection was lost',
  'network request failed',
  'network error',
  'unable to resolve host',
  'failed to connect',
  'no address associated with hostname',
  'connection refused',
  'connection reset',
  'could not connect to the server',
  'a server with the specified hostname could not be found',
  'software caused connection abort',
  'econnrefused',
  'enotfound',
]

const TIMEOUT_PATTERNS = [
  'the request timed out',
  'timed out',
  'timeout of',
  'sockettimeoutexception',
]

/** Feature error codes that mean the same as a kind here. */
const CODE_KINDS: Record<string, NetworkErrorKind> = {
  // Shared request(), Buddies relay, sync transports, Notes Import.
  offline: 'offline',
  network: 'offline',
  timeout: 'timeout',
  cancelled: 'cancelled',
  rate_limited: 'rateLimited',
  'rate-limited': 'rateLimited',
  rateLimited: 'rateLimited',
  // axios
  ERR_NETWORK: 'offline',
  ERR_CANCELED: 'cancelled',
  ECONNABORTED: 'timeout',
  ETIMEDOUT: 'timeout',
}

/** RevenueCat `PURCHASES_ERROR_CODE` values for connection failures. */
const REVENUECAT_OFFLINE_CODES = new Set(['10', '35'])

type ErrorLike = {
  name?: unknown
  message?: unknown
  code?: unknown
  kind?: unknown
  status?: unknown
  readableErrorCode?: unknown
  isAxiosError?: unknown
  response?: { status?: unknown } | null
}

export function kindForStatus(status: number): NetworkErrorKind {
  if (status === 408) return 'timeout'
  if (status === 429) return 'rateLimited'
  if (status >= 500) return 'server'
  if (status >= 400) return 'client'
  return 'unknown'
}

const KINDS = new Set<NetworkErrorKind>([
  'offline',
  'timeout',
  'cancelled',
  'rateLimited',
  'server',
  'client',
  'unknown',
])

export function classifyNetworkError(error: unknown): NetworkErrorKind {
  if (error == null) return 'unknown'
  if (typeof error === 'string') return classifyMessage(error)
  if (typeof error !== 'object') return 'unknown'
  const e = error as ErrorLike

  // HttpError from request() already carries its kind.
  if (typeof e.kind === 'string' && KINDS.has(e.kind as NetworkErrorKind))
    return e.kind as NetworkErrorKind

  if (e.name === 'AbortError' || e.name === 'CanceledError') return 'cancelled'

  if (typeof e.code === 'string') {
    if (
      e.readableErrorCode !== undefined &&
      REVENUECAT_OFFLINE_CODES.has(e.code)
    )
      return 'offline'
    if (Object.prototype.hasOwnProperty.call(CODE_KINDS, e.code))
      return CODE_KINDS[e.code]
  }

  const status =
    typeof e.response?.status === 'number'
      ? e.response.status
      : typeof e.status === 'number'
        ? e.status
        : undefined
  if (status !== undefined && status >= 400) return kindForStatus(status)

  const fromMessage =
    typeof e.message === 'string' ? classifyMessage(e.message) : 'unknown'
  if (fromMessage !== 'unknown') return fromMessage

  // axios without a response never reached the server.
  if (e.isAxiosError === true && !e.response) return 'offline'
  return 'unknown'
}

function classifyMessage(message: string): NetworkErrorKind {
  const lower = message.toLowerCase()
  if (TIMEOUT_PATTERNS.some((pattern) => lower.includes(pattern)))
    return 'timeout'
  if (OFFLINE_PATTERNS.some((pattern) => lower.includes(pattern)))
    return 'offline'
  return 'unknown'
}

/**
 * The connection, not the app, failed: offline, timed out, or cancelled. These
 * are expected and never go to error tracking.
 */
export function isConnectivityError(error: unknown): boolean {
  const kind = classifyNetworkError(error)
  return kind === 'offline' || kind === 'timeout' || kind === 'cancelled'
}

/** Worth trying again later without changing the request. */
export function isRetryableNetworkError(error: unknown): boolean {
  const kind = classifyNetworkError(error)
  return (
    kind === 'offline' ||
    kind === 'timeout' ||
    kind === 'rateLimited' ||
    kind === 'server'
  )
}
