import { HttpError } from '@/lib/http/request'
import {
  type BearerAccountOptions,
  sendBearerAccountOp,
} from '@/lib/serverAccount/client'

/**
 * Live sockets on the web (docs/passkeys-protocol.md, "Live sockets on the
 * web"). A browser can't set headers on a WebSocket, and request logs record
 * `Sec-WebSocket-Protocol` in full, so it never sends its access token on one:
 * it mints a short ticket (`POST /accounts/v1/live/ticket`) for every connect
 * and offers it as a subprotocol. Native sockets keep their headers.
 */

/** The protocol every live socket offers, and the server answers. */
export const LIVE_SOCKET_PROTOCOL = 'ww.v1'

/**
 * The server closes a ticketed socket with this when the access token it was
 * minted with expires: mint a ticket with a fresh token and reconnect at once.
 */
export const LIVE_CLOSE_EXPIRED = 4004

export type LiveSocketKind = 'sync' | 'buddies'

/** Which socket, and this device's slot id (`sync`) or inbox id (`buddies`). */
export type LiveTicketTarget = { socket: LiveSocketKind; id: string }

const TICKET_PATTERN = /^[A-Za-z0-9_.-]{1,1024}$/

/** A ticket for one socket: 30 seconds, or the access token's expiry. */
export async function mintLiveTicket(
  target: LiveTicketTarget,
  options: BearerAccountOptions
): Promise<{ ticket: string; expiresAt: number }> {
  const response = await sendBearerAccountOp<{
    ok?: boolean
    ticket?: unknown
    expiresAt?: unknown
  } | null>('live/ticket', { socket: target.socket, id: target.id }, options)
  const { ok, ticket, expiresAt } = response.data ?? {}
  if (
    ok !== true ||
    typeof ticket !== 'string' ||
    !TICKET_PATTERN.test(ticket) ||
    typeof expiresAt !== 'number'
  )
    throw new HttpError('server', response.status, 'unexpected_response')
  return { ticket, expiresAt }
}

/** The part of a WebSocket a live signal uses. */
export type TicketedSocket = {
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: (() => void) | null
  onmessage: ((event: { data?: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: { code?: number; reason?: string }) => void) | null
}

/**
 * Mints a ticket and opens the socket with it. Ids never go in the URL. A
 * refused handshake only shows as a close, so callers reconnect with backoff,
 * minting again each time.
 */
export async function openTicketedSocket(
  target: LiveTicketTarget & { url: string },
  options: BearerAccountOptions & { WebSocket?: typeof WebSocket }
): Promise<TicketedSocket> {
  const { ticket } = await mintLiveTicket(target, options)
  const Socket = options.WebSocket ?? WebSocket
  return new Socket(target.url, [
    LIVE_SOCKET_PROTOCOL,
    `ticket.${ticket}`,
  ]) as unknown as TicketedSocket
}
