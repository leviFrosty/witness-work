import { classifyNetworkError } from '@/lib/http/networkError'
import type { HttpError } from '@/lib/http/request'
import { isToken } from '@/lib/mapsFrame/protocol'

/** Why the web shows no map (docs/web-maps.md). */
export type MapUnavailableReason =
  /** Ww-api has no MapKit JS key yet (`maps_unconfigured`). */
  | 'unconfigured'
  /** This browser has no account session to ask with. */
  | 'signedOut'
  | 'offline'
  /** Too many tokens for now (429). */
  | 'busy'
  /** The frame didn't answer, or MapKit refused or failed. */
  | 'failed'

export type MapKitTokenResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; reason: MapUnavailableReason }

type TokenRequest = (options: {
  url: string
  method: 'POST'
  json: { origin: string }
  timeoutMs: number
}) => Promise<{ data: unknown }>

/** Ww-api signs in well under a second. */
const TOKEN_TIMEOUT_MS = 10_000
/** A token this close to expiring isn't handed out again. */
const MIN_LIFETIME_MS = 5 * 60_000

export function reasonFor(error: unknown): MapUnavailableReason {
  const failure = (error as { failure?: unknown } | null)?.failure
  const serverCode = (error as Partial<HttpError> | null)?.serverCode
  // A browser without its account key hasn't signed in.
  if (failure === 'signedOut' || serverCode === 'account_key_unavailable')
    return 'signedOut'
  if (serverCode === 'maps_unconfigured') return 'unconfigured'
  switch (classifyNetworkError(error)) {
    case 'offline':
      return 'offline'
    case 'rateLimited':
      return 'busy'
    default:
      return 'failed'
  }
}

/**
 * MapKit JS tokens for the maps frame at `origin`, through the account session
 * (`request`). Maps open and close often, and ww-api counts tokens per account,
 * so one stays in use until it's near its end.
 */
export function createMapKitTokens({
  request,
  url,
  origin,
  now = Date.now,
}: {
  request: TokenRequest
  url: string
  origin: string
  now?: () => number
}) {
  let current: { token: string; expiresAt: number } | null = null
  let pending: Promise<MapKitTokenResult> | null = null

  async function fetchToken(): Promise<MapKitTokenResult> {
    try {
      const { data } = await request({
        url,
        method: 'POST',
        json: { origin },
        timeoutMs: TOKEN_TIMEOUT_MS,
      })
      const body = data as Record<string, unknown> | null
      if (
        body?.ok !== true ||
        !isToken(body.token) ||
        body.origin !== origin ||
        typeof body.expiresAt !== 'number' ||
        !Number.isFinite(body.expiresAt)
      )
        return { ok: false, reason: 'failed' }
      current = { token: body.token, expiresAt: body.expiresAt }
      return { ok: true, ...current }
    } catch (error) {
      return { ok: false, reason: reasonFor(error) }
    }
  }

  return {
    /** A token with at least a few minutes left, or why there's none. */
    get(): Promise<MapKitTokenResult> {
      if (current && current.expiresAt - now() > MIN_LIFETIME_MS)
        return Promise.resolve({ ok: true, ...current })
      pending ??= fetchToken().finally(() => (pending = null))
      return pending
    },
    /** Forgets the token, e.g. after MapKit refused it. */
    reset() {
      current = null
    },
  }
}
