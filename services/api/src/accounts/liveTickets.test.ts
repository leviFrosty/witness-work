import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesToBase64Url, sha256Bytes } from '../crypto'
import { decodeB64u } from '../buddies/contracts'
import {
  LIVE_TICKET_SECONDS,
  liveTicketKey,
  mintLiveTicket,
  verifyLiveTicket,
  type LiveTicketKey,
} from './liveTickets'

/**
 * Live socket tickets: the claims sealed with AES-GCM and a MAC over the
 * ciphertext, each under its own key from `LIVE_TICKET_SECRET`, good for one
 * socket kind and id for 30 seconds.
 */

/** A random 22-character id. */
const randomId = () => bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))

const NOW = Date.UTC(2026, 9, 30, 12)
const SECRET = 'live-ticket-secret-for-unit-tests-0123456789'
const TOKEN_SECRET = 'account-token-secret-for-unit-tests-0123456789'
const env = (
  overrides: {
    LIVE_TICKET_SECRET?: string
    APP_ATTEST_ENVIRONMENT?: string
    ACCOUNT_TOKEN_SECRET?: string
    ACCOUNT_TOKEN_SECRET_PREVIOUS?: string
  } = {}
) => ({
  LIVE_TICKET_SECRET: SECRET,
  APP_ATTEST_ENVIRONMENT: 'development',
  ACCOUNT_TOKEN_SECRET: TOKEN_SECRET,
  ...overrides,
})

const account = {
  accountId: randomId(),
  sessionId: randomId(),
  platform: 'ios' as const,
}
const slotId = randomId().slice(0, 16)
const tokenExpiresAt = NOW + 15 * 60_000

const key = async (overrides?: Parameters<typeof env>[0]) =>
  (await liveTicketKey(env(overrides)))!

const mint = async (k: LiveTicketKey, now = NOW) =>
  (await mintLiveTicket(
    k,
    { account, socket: 'sync', id: slotId, tokenExpiresAt },
    now
  ))!.ticket

const encoder = new TextEncoder()
const labelled = (label: string, secret: string) =>
  sha256Bytes(encoder.encode(`${label}\n${secret}`))

/**
 * A ticket over arbitrary bytes, sealed the way the worker seals:
 * `b64u(iv ‖ AES-GCM(plaintext)).b64u(HMAC-SHA256(first part))`.
 */
const sealBytes = async (secret: string, plaintext: Uint8Array) => {
  const [cipherRaw, macRaw] = await Promise.all([
    labelled('ww-live/v1/ticket-cipher', secret),
    labelled('ww-live/v1/ticket', secret),
  ])
  const cipher = await crypto.subtle.importKey('raw', cipherRaw, 'AES-GCM', false, ['encrypt'])
  const hmac = await crypto.subtle.importKey(
    'raw',
    macRaw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cipher, plaintext)
  )
  const body = bytesToBase64Url(new Uint8Array([...iv, ...sealed]))
  const mac = await crypto.subtle.sign('HMAC', hmac, encoder.encode(body))
  return `${body}.${bytesToBase64Url(new Uint8Array(mac))}`
}

/** A ticket over arbitrary claims, sealed the way the worker seals. */
const sign = (secret: string, claims: Record<string, unknown>) =>
  sealBytes(secret, encoder.encode(JSON.stringify(claims)))

const claims = (overrides: Record<string, unknown> = {}) => ({
  typ: 'ww-live',
  iss: 'ww-api/development',
  sub: account.accountId,
  sid: account.sessionId,
  platform: account.platform,
  socket: 'sync',
  id: slotId,
  tokenExp: tokenExpiresAt / 1_000,
  exp: NOW / 1_000 + LIVE_TICKET_SECONDS,
  ...overrides,
})

describe('live tickets', () => {
  afterEach(() => vi.restoreAllMocks())

  it('round-trips the account, the id, and the token expiry', async () => {
    const k = await key()
    const minted = await mintLiveTicket(
      k,
      { account, socket: 'sync', id: slotId, tokenExpiresAt },
      NOW
    )
    expect(minted!.expiresAt).toBe(NOW + 30_000)
    expect(await verifyLiveTicket(k, minted!.ticket, 'sync', NOW)).toEqual({
      account,
      id: slotId,
      tokenExpiresAt,
      hash: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    })
    // The hand-signed form is the same wire format.
    expect(
      await verifyLiveTicket(k, await sign(SECRET, claims()), 'sync', NOW)
    ).not.toBeNull()
  })

  it('expires 30 seconds after minting, or with the token if sooner', async () => {
    const k = await key()
    const ticket = await mint(k)
    expect(await verifyLiveTicket(k, ticket, 'sync', NOW + 29_999)).not.toBeNull()
    expect(await verifyLiveTicket(k, ticket, 'sync', NOW + 30_000)).toBeNull()
    expect(await verifyLiveTicket(k, ticket, 'sync', NOW + 31_000)).toBeNull()

    const late = NOW + 15 * 60_000 - 10_000
    const short = await mintLiveTicket(
      k,
      { account, socket: 'sync', id: slotId, tokenExpiresAt },
      late
    )
    expect(short!.expiresAt).toBe(tokenExpiresAt)
  })

  it('mints nothing for a token within a second of expiring', async () => {
    const k = await key()
    const grant = { account, socket: 'sync' as const, id: slotId, tokenExpiresAt }
    expect(await mintLiveTicket(k, grant, tokenExpiresAt - 1_000)).not.toBeNull()
    expect(await mintLiveTicket(k, grant, tokenExpiresAt - 999)).toBeNull()
    expect(await mintLiveTicket(k, grant, tokenExpiresAt)).toBeNull()
  })

  it('names no id in the ticket: every part decodes to ciphertext', async () => {
    const k = await key()
    const ticket = await mint(k)
    const ids = [account.accountId, account.sessionId, slotId]
    for (const id of ids) expect(ticket).not.toContain(id)
    const parts = ticket.split('.')
    expect(parts).toHaveLength(2)
    for (const part of parts) {
      const bytes = decodeB64u(part)!
      expect(bytes).not.toBeNull()
      const text = new TextDecoder('latin1').decode(bytes)
      for (const id of [...ids, 'ww-live', 'sync', 'ios', 'ww-api'])
        expect(text).not.toContain(id)
      expect(() => JSON.parse(new TextDecoder().decode(bytes))).toThrow()
    }
    // Each mint seals afresh, and the same plaintext never repeats a ticket.
    expect(await mint(k)).not.toBe(ticket)
  })

  it('pads its claims, so its length shows neither the socket nor the id', async () => {
    const k = await key()
    const lengths = new Set<number>()
    for (const [socket, id] of [
      ['sync', 'A'.repeat(8)],
      ['sync', 'A'.repeat(64)],
      ['buddies', 'B'.repeat(22)],
    ] as const) {
      const minted = await mintLiveTicket(k, { account, socket, id, tokenExpiresAt }, NOW)
      lengths.add(minted!.ticket.length)
      expect(await verifyLiveTicket(k, minted!.ticket, socket, NOW)).toMatchObject({ id })
    }
    expect([...lengths]).toEqual([466])
  })

  it('verifies the MAC before decrypting anything', async () => {
    const k = await key()
    const [body, mac] = (await mint(k)).split('.')
    const decrypt = vi.spyOn(crypto.subtle, 'decrypt')
    const flipped = `${body}.${mac[0] === 'A' ? 'B' : 'A'}${mac.slice(1)}`
    expect(await verifyLiveTicket(k, flipped, 'sync', NOW)).toBeNull()
    expect(decrypt).not.toHaveBeenCalled()
  })

  it('names the ticket by a hash of its MAC, the same for every copy', async () => {
    const k = await key()
    const ticket = await mint(k)
    const first = await verifyLiveTicket(k, ticket, 'sync', NOW)
    const again = await verifyLiveTicket(k, ticket, 'sync', NOW + 1_000)
    const other = await verifyLiveTicket(k, await mint(k), 'sync', NOW)
    expect(first!.hash).toBe(again!.hash)
    expect(first!.hash).not.toBe(other!.hash)
    const mac = decodeB64u(ticket.split('.')[1])!
    expect(first!.hash).toBe(bytesToBase64Url(await sha256Bytes(mac)))
  })

  it('opens only the socket it was minted for', async () => {
    const k = await key()
    expect(await verifyLiveTicket(k, await mint(k), 'buddies', NOW)).toBeNull()
  })

  it('refuses another secret or another env', async () => {
    const ticket = await mint(await key())
    expect(
      await verifyLiveTicket(
        await key({ LIVE_TICKET_SECRET: `${SECRET}-rotated` }),
        ticket,
        'sync',
        NOW
      )
    ).toBeNull()
    // The same secret on production: the issuer differs.
    const production = await key({ APP_ATTEST_ENVIRONMENT: 'production' })
    expect(await verifyLiveTicket(production, ticket, 'sync', NOW)).toBeNull()
    expect(
      await verifyLiveTicket(
        production,
        await sign(SECRET, claims({ iss: 'ww-api/production', platform: 'dev' })),
        'sync',
        NOW
      )
    ).toBeNull()
  })

  it('refuses a validly signed ticket with the wrong claims', async () => {
    const k = await key()
    for (const overrides of [
      { typ: 'JWT' },
      { typ: undefined },
      { iss: 'ww-api/production' },
      { socket: 'buddies' },
      { exp: NOW / 1_000 },
      { exp: 'soon' },
      { tokenExp: NOW / 1_000 },
      // Past the 30 seconds a ticket lives, beyond the allowed skew.
      { exp: NOW / 1_000 + LIVE_TICKET_SECONDS + 6 },
      // Past the 15 minutes (plus the token's `iat` skew) a token lives.
      { tokenExp: NOW / 1_000 + 15 * 60 + 60 + 6 },
      // Outliving its token.
      { tokenExp: NOW / 1_000 + 10, exp: NOW / 1_000 + 11 },
      { sub: 'nope' },
      { sid: 42 },
      { platform: 'mac' },
      { id: 'bad slot' },
    ]) {
      expect(
        await verifyLiveTicket(k, await sign(SECRET, claims(overrides)), 'sync', NOW),
        JSON.stringify(overrides)
      ).toBeNull()
    }
    // At the bounds, within the skew: still good.
    for (const overrides of [
      { exp: NOW / 1_000 + LIVE_TICKET_SECONDS + 5 },
      { tokenExp: NOW / 1_000 + 15 * 60 + 60 + 5 },
      { tokenExp: NOW / 1_000 + 10, exp: NOW / 1_000 + 10 },
    ]) {
      expect(
        await verifyLiveTicket(k, await sign(SECRET, claims(overrides)), 'sync', NOW),
        JSON.stringify(overrides)
      ).not.toBeNull()
    }
    // Sealed but not claims: not JSON, or not UTF-8.
    for (const plaintext of [encoder.encode('nope'), new Uint8Array([0xff, 0xfe])])
      expect(await verifyLiveTicket(k, await sealBytes(SECRET, plaintext), 'sync', NOW)).toBeNull()
  })

  it('refuses malformed tickets', async () => {
    const k = await key()
    const ticket = await mint(k)
    const [body, mac] = ticket.split('.')
    for (const bad of [
      '',
      body,
      `${body}.${mac}.x`,
      `${body}.${mac.slice(0, -1)}`,
      `${body}x.${mac}`,
      `${'A'.repeat(2_000)}.${mac}`,
    ])
      expect(await verifyLiveTicket(k, bad, 'sync', NOW), bad.slice(0, 20)).toBeNull()
  })

  it('is off without a long enough secret or an environment', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await liveTicketKey(env({ LIVE_TICKET_SECRET: '' }))).toBeNull()
    expect(await liveTicketKey(env({ LIVE_TICKET_SECRET: 'short' }))).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('LIVE_TICKET_SECRET'))
    expect(await liveTicketKey(env({ APP_ATTEST_ENVIRONMENT: '' }))).toBeNull()
  })

  it('is off when the secret is the access token’s, current or previous', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await liveTicketKey(env({ ACCOUNT_TOKEN_SECRET: SECRET }))).toBeNull()
    expect(
      await liveTicketKey(env({ ACCOUNT_TOKEN_SECRET: ` ${SECRET} ` }))
    ).toBeNull()
    expect(
      await liveTicketKey(env({ ACCOUNT_TOKEN_SECRET_PREVIOUS: SECRET }))
    ).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ACCOUNT_TOKEN_SECRET'))
  })
})
