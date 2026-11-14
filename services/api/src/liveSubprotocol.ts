import type { Environment } from './types'
import { allowedWebOrigin } from './cors'

/**
 * The browser's way onto a live socket (witness-work ADR 0038 §10,
 * `docs/passkeys-protocol.md`, "Live sockets on the web"). Browsers can't set
 * headers on a WebSocket, so a web client offers a live ticket
 * (src/accounts/liveTickets.ts) as a `Sec-WebSocket-Protocol` entry, next to
 * `ww.v1`:
 *
 * ```
 * Sec-WebSocket-Protocol: ww.v1, ticket.<ticket>
 * ```
 *
 * Never the access token: Cloudflare's logs record this header in full. The
 * ticket names the socket kind and its id (the slot or the inbox) sealed, so
 * no id goes in the URL or reads in the offer. Every entry is an RFC 9110
 * token. The Worker checks `Origin` (an exact match in `WEB_APP_ORIGINS`,
 * 403) and then the offer's shape (400) before verifying the ticket or
 * touching a Durable Object, forwards only the verified account, ids, token
 * expiry, and the ticket's hash (`LIVE_TICKET_HEADER`; never the ticket) in
 * its internal headers, and answers the 101 with `Sec-WebSocket-Protocol:
 * ww.v1`, which a browser requires. Native apps keep the header path and
 * never send a subprotocol.
 *
 * Privacy: the offer holds the ticket; never log it or forward it.
 */

/** The subprotocol a live socket speaks, echoed on every browser upgrade. */
export const LIVE_SUBPROTOCOL = 'ww.v1'

/** The ticket's entry: `ticket.<ticket>`. */
const TICKET_PREFIX = 'ticket.'

/** The longest offer read: a ticket is 466 characters. */
const MAX_OFFER_CHARS = 2_048

/** RFC 9110 `token`: what a `Sec-WebSocket-Protocol` entry may hold. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

/**
 * The verified ticket's `hash` (src/accounts/liveTickets.ts) on a browser
 * upgrade the Worker forwards to a Durable Object, which keeps it in the
 * socket's attachment and refuses a second socket on it while one is open.
 * Set only by the Worker; any client copy is dropped, so a native socket
 * never has one.
 */
export const LIVE_TICKET_HEADER = 'x-ww-live-ticket'

const TICKET_HASH = /^[A-Za-z0-9_-]{43}$/

/**
 * `LIVE_TICKET_HEADER`'s hash, null without the header (a native socket), or
 * undefined when it's malformed.
 */
export const readLiveTicketHash = (value: string | null): string | null | undefined =>
  value == null ? null : TICKET_HASH.test(value) ? value : undefined

/** True when one of `sockets` was opened with the ticket `hash`. */
export const isTicketOpen = (
  sockets: WebSocket[],
  hash: string,
  ticketOf: (ws: WebSocket) => string | null | undefined
): boolean => sockets.some((ws) => ticketOf(ws) === hash)

/** Close codes are per socket; both sockets close an expired token with this. */
export const LIVE_EXPIRED_CLOSE = { code: 4004, reason: 'expired' } as const

export type BrowserLive =
  | {
      ok: true
      /** The `ticket.` entry's ticket, or null when the offer has none. */
      ticket: string | null
    }
  | { ok: false; error: 'bad_request' | 'forbidden' }

/**
 * The browser's upgrade, or null for a native (header-path) one: a request
 * without `Sec-WebSocket-Protocol`. Refuses with `forbidden` one whose
 * `Origin` isn't the web app's, first; then with `bad_request` an offer that
 * isn't a list of tokens, repeats an entry, has one other than `ww.v1` and
 * `ticket.`, has no `ww.v1`, or comes with an `Authorization` header too.
 */
export const readBrowserLive = (
  env: Pick<Environment, 'WEB_APP_ORIGINS'>,
  headers: Headers
): BrowserLive | null => {
  const offer = headers.get('sec-websocket-protocol')
  if (offer == null) return null
  // A foreign page learns nothing about what a well-formed offer looks like.
  if (!allowedWebOrigin(env, headers.get('origin')))
    return { ok: false, error: 'forbidden' }
  const bad = { ok: false, error: 'bad_request' } as const
  if (offer.length > MAX_OFFER_CHARS || headers.has('authorization')) return bad

  let subprotocol = false
  let ticket: string | null = null
  for (const entry of offer.split(',').map((part) => part.trim())) {
    if (!TOKEN.test(entry)) return bad
    if (entry === LIVE_SUBPROTOCOL) {
      if (subprotocol) return bad
      subprotocol = true
    } else if (entry.startsWith(TICKET_PREFIX)) {
      const value = entry.slice(TICKET_PREFIX.length)
      if (!value || ticket != null) return bad
      ticket = value
    } else return bad
  }
  if (!subprotocol) return bad
  return { ok: true, ticket }
}

/**
 * The request a Durable Object gets for a live upgrade: `headers` minus the
 * offer, any `Authorization`, any client copy of `LIVE_TICKET_HEADER` and of
 * the `drop` headers, plus the internal ones the Worker set.
 */
export const forwardedLiveRequest = (
  request: Request,
  internal: Record<string, string>,
  drop: string[] = []
): Request => {
  const headers = new Headers(request.headers)
  for (const name of ['sec-websocket-protocol', 'authorization', LIVE_TICKET_HEADER, ...drop])
    headers.delete(name)
  for (const [name, value] of Object.entries(internal)) headers.set(name, value)
  return new Request(request, { headers })
}

/**
 * The Durable Object's answer with `Sec-WebSocket-Protocol: ww.v1` on a 101;
 * a refusal passes through.
 */
export const acceptLiveSubprotocol = (response: Response): Response =>
  response.status === 101 && response.webSocket
    ? new Response(null, {
        status: 101,
        webSocket: response.webSocket,
        headers: { 'sec-websocket-protocol': LIVE_SUBPROTOCOL },
      })
    : response

/**
 * A socket attachment's token expiry from the Worker's internal header (the
 * access token's, from the ticket): epoch ms, or null without the header (a
 * header-path socket, which keeps outliving its token). Undefined when it's
 * malformed.
 */
export const readLiveExpiry = (value: string | null): number | null | undefined => {
  if (value == null) return null
  const expiresAt = Number(value)
  return /^\d{1,16}$/.test(value) && Number.isSafeInteger(expiresAt)
    ? expiresAt
    : undefined
}

/** Closes every socket whose `expiresAt` has passed with `4004 "expired"`. */
export const closeExpiredSockets = (
  sockets: WebSocket[],
  expiresAt: (ws: WebSocket) => number | null | undefined,
  now: number
): void => {
  for (const ws of sockets) {
    const at = expiresAt(ws)
    if (at == null || at > now) continue
    try {
      ws.close(LIVE_EXPIRED_CLOSE.code, LIVE_EXPIRED_CLOSE.reason)
    } catch {
      // Already closing or gone.
    }
  }
}

/** The soonest expiry among `sockets`, or null. */
export const soonestSocketExpiry = (
  sockets: WebSocket[],
  expiresAt: (ws: WebSocket) => number | null | undefined
): number | null => {
  let soonest: number | null = null
  for (const ws of sockets) {
    const at = expiresAt(ws)
    if (at != null && (soonest == null || at < soonest)) soonest = at
  }
  return soonest
}
