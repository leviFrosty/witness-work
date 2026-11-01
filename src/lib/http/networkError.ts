export type NetworkErrorKind =
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'rateLimited'
  | 'server'
  | 'client'
  | 'unknown'

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

  'error performing request',
]

const TIMEOUT_PATTERNS = [
  'the request timed out',
  'timed out',
  'timeout of',
  'sockettimeoutexception',
]

const CODE_KINDS: Record<string, NetworkErrorKind> = {
  offline: 'offline',
  network: 'offline',
  timeout: 'timeout',
  cancelled: 'cancelled',
  rate_limited: 'rateLimited',
  'rate-limited': 'rateLimited',
  rateLimited: 'rateLimited',

  ERR_NETWORK: 'offline',
  ERR_CANCELED: 'cancelled',
  ECONNABORTED: 'timeout',
  ETIMEDOUT: 'timeout',
}

const REVENUECAT_OFFLINE_CODES = new Set(['10', '35'])

type ErrorLike = {
  name?: unknown
  message?: unknown
  code?: unknown
  kind?: unknown
  status?: unknown
  readableErrorCode?: unknown
  userInfo?: { readableErrorCode?: unknown } | null
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

  if (typeof e.kind === 'string' && KINDS.has(e.kind as NetworkErrorKind))
    return e.kind as NetworkErrorKind

  if (e.name === 'AbortError' || e.name === 'CanceledError') return 'cancelled'

  if (typeof e.code === 'string') {
    const isRevenueCat =
      e.readableErrorCode !== undefined ||
      e.userInfo?.readableErrorCode !== undefined
    if (isRevenueCat && REVENUECAT_OFFLINE_CODES.has(e.code)) return 'offline'
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

export function isConnectivityError(error: unknown): boolean {
  const kind = classifyNetworkError(error)
  return kind === 'offline' || kind === 'timeout' || kind === 'cancelled'
}
