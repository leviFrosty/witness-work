import { HttpError } from '@/lib/http/request'
import {
  type BearerAccountOptions,
  sendBearerAccountOp,
} from '@/lib/serverAccount/client'

export const LIVE_SOCKET_PROTOCOL = 'ww.v1'

export const LIVE_CLOSE_EXPIRED = 4004

export type LiveSocketKind = 'sync' | 'buddies'

export type LiveTicketTarget = { socket: LiveSocketKind; id: string }

const TICKET_PATTERN = /^[A-Za-z0-9_.-]{1,1024}$/

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

export type TicketedSocket = {
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: (() => void) | null
  onmessage: ((event: { data?: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: { code?: number; reason?: string }) => void) | null
}

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
