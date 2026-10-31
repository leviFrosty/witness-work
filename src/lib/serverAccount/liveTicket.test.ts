import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'
import type { AccountAuthorize } from '@/lib/serverAccount/client'
import {
  LIVE_SOCKET_PROTOCOL,
  mintLiveTicket,
  openTicketedSocket,
} from '@/lib/serverAccount/liveTicket'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

const BASE = 'https://api.test'
const TICKET = 'v1.' + 'a'.repeat(380)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

function setup(answers: (() => Response)[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return answers[calls.length - 1]()
  }) as unknown as typeof fetch
  // Like `withSession`: a 401 refreshes and runs it again, once.
  const tokens = ['at-1', 'at-2']
  const authorize: AccountAuthorize = async (run) => {
    try {
      return await run(`Bearer ${tokens[0]}`)
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error
      return run(`Bearer ${tokens[1]}`)
    }
  }
  return {
    calls,
    options: { baseUrl: BASE, authorize, fetchImpl },
  }
}

class FakeSocket {
  static opened: FakeSocket[] = []
  constructor(
    readonly url: string,
    readonly protocols: string[]
  ) {
    FakeSocket.opened.push(this)
  }
}

describe('live tickets', () => {
  it('mints a ticket for one socket, with the session’s token', async () => {
    const { calls, options } = setup([
      () => json(200, { ok: true, ticket: TICKET, expiresAt: 5 }),
    ])
    expect(
      await mintLiveTicket({ socket: 'sync', id: 'slot-1' }, options)
    ).toEqual({ ticket: TICKET, expiresAt: 5 })
    expect(calls[0].url).toBe(`${BASE}/accounts/v1/live/ticket`)
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      socket: 'sync',
      id: 'slot-1',
    })
    expect(
      (calls[0].init.headers as Record<string, string>).authorization
    ).toBe('Bearer at-1')
  })

  it('refreshes the token when the mint answers 401', async () => {
    const { calls, options } = setup([
      () => json(401, { ok: false, error: 'unauthorized' }),
      () => json(200, { ok: true, ticket: TICKET, expiresAt: 5 }),
    ])
    await mintLiveTicket({ socket: 'buddies', id: 'inbox-1' }, options)
    expect(
      (calls[1].init.headers as Record<string, string>).authorization
    ).toBe('Bearer at-2')
  })

  it('refuses a ticket that isn’t one', async () => {
    const { options } = setup([
      () => json(200, { ok: true, ticket: 'has spaces', expiresAt: 5 }),
    ])
    await expect(
      mintLiveTicket({ socket: 'sync', id: 'slot-1' }, options)
    ).rejects.toBeInstanceOf(HttpError)
  })

  it('offers the ticket as a subprotocol, never the access token', async () => {
    const { calls, options } = setup([
      () => json(200, { ok: true, ticket: TICKET, expiresAt: 5 }),
    ])
    FakeSocket.opened = []
    const socket = await openTicketedSocket(
      {
        url: 'wss://api.test/accounts/v1/sync/live',
        socket: 'sync',
        id: 'slot-1',
      },
      {
        ...options,
        WebSocket: FakeSocket as unknown as typeof WebSocket,
      }
    )
    expect(socket).toBe(FakeSocket.opened[0])
    expect(FakeSocket.opened[0].url).toBe(
      'wss://api.test/accounts/v1/sync/live'
    )
    expect(FakeSocket.opened[0].protocols).toEqual([
      LIVE_SOCKET_PROTOCOL,
      `ticket.${TICKET}`,
    ])
    expect(JSON.stringify(FakeSocket.opened[0])).not.toContain('at-1')
    expect(calls).toHaveLength(1)
  })

  it('mints a new ticket for every connect', async () => {
    const { calls, options } = setup([
      () => json(200, { ok: true, ticket: TICKET, expiresAt: 5 }),
      () => json(200, { ok: true, ticket: `${TICKET}b`, expiresAt: 6 }),
    ])
    FakeSocket.opened = []
    const target = {
      url: 'wss://api.test/buddies/v1/inbox/live',
      socket: 'buddies' as const,
      id: 'inbox-1',
    }
    const deps = { ...options, WebSocket: FakeSocket as never }
    await openTicketedSocket(target, deps)
    await openTicketedSocket(target, deps)
    expect(calls).toHaveLength(2)
    expect(FakeSocket.opened[1].protocols[1]).toBe(`ticket.${TICKET}b`)
  })
})
