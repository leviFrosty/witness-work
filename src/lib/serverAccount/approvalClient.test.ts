import { describe, expect, it, type Mock, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import type { AccountAuthorize } from '@/lib/serverAccount/client'
import {
  approvalStatusAsBrowser,
  approvalStatusAsPhone,
  cancelApprovalAsBrowser,
  cancelApprovalAsPhone,
  claimApproval,
  finishApproval,
  openApproval,
  receiveApproval,
  sendApprovalKey,
} from '@/lib/serverAccount/approvalClient'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

type Seen = {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

function fakeFetch(respond: (seen: Seen) => unknown, status = 200) {
  const seen: Seen[] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const entry = {
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    }
    seen.push(entry)
    return new Response(JSON.stringify(respond(entry)), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  const authorize = vi.fn(<T>(run: (authorization: string) => Promise<T>) =>
    run('Bearer access')
  ) as AccountAuthorize & Mock
  return {
    seen,
    browser: { baseUrl: 'https://api.test', fetchImpl },
    phone: { baseUrl: 'https://api.test', authorize, fetchImpl },
  }
}

const CHANNEL = 'C'.repeat(22)
const PHONE_PUB = toB64u(new Uint8Array(32).fill(7))
const TOKEN = { channelId: CHANNEL, browserToken: 'bt' }

describe('approval client: the browser', () => {
  it('opens a channel without auth', async () => {
    const { seen, browser } = fakeFetch(() => ({ ok: true, expiresAt: 75 }))
    const args = {
      channelId: CHANNEL,
      verifier: 'v',
      browserVerifier: 'bv',
      hello: 'h',
    }
    expect(await openApproval(args, browser)).toEqual({ expiresAt: 75 })
    expect(seen[0].url).toBe('https://api.test/accounts/v1/approval/open')
    expect(seen[0].body).toEqual(args)
    expect(seen[0].headers.authorization).toBeUndefined()
  })

  it('reads the status with its token', async () => {
    const { seen, browser } = fakeFetch(() => ({
      ok: true,
      status: 'claimed',
      expiresAt: 300,
      phonePub: PHONE_PUB,
    }))
    expect(await approvalStatusAsBrowser(TOKEN, browser)).toEqual({
      status: 'claimed',
      expiresAt: 300,
      phonePub: PHONE_PUB,
    })
    expect(seen[0].url).toBe('https://api.test/accounts/v1/approval/status')
    expect(seen[0].body).toEqual(TOKEN)
  })

  it('receives the key and ticket', async () => {
    const { seen, browser } = fakeFetch(() => ({
      ok: true,
      status: 'sent',
      key: 'k',
      ticket: 't',
      ticketExpiresAt: 9,
    }))
    expect(await receiveApproval(TOKEN, browser)).toEqual({
      status: 'sent',
      key: 'k',
      ticket: 't',
      ticketExpiresAt: 9,
    })
    expect(seen[0].url).toBe('https://api.test/accounts/v1/approval/receive')
  })

  it('reads a receive before the key', async () => {
    const { browser } = fakeFetch(() => ({ ok: true, status: 'claimed' }))
    expect(await receiveApproval(TOKEN, browser)).toEqual({
      status: 'claimed',
    })
  })

  it('finishes and cancels with its token', async () => {
    const { seen, browser } = fakeFetch(() => ({ ok: true }))
    await finishApproval(TOKEN, browser)
    await cancelApprovalAsBrowser(TOKEN, browser)
    expect(seen.map((entry) => entry.url)).toEqual([
      'https://api.test/accounts/v1/approval/done',
      'https://api.test/accounts/v1/approval/cancel',
    ])
    expect(seen[1].body).toEqual(TOKEN)
  })

  it('refuses a phone key that is not 32 bytes of b64u', async () => {
    for (const phonePub of [
      'pp',
      PHONE_PUB.slice(1),
      `${PHONE_PUB}A`,
      `${PHONE_PUB.slice(0, -1)}!`,
      `${PHONE_PUB.slice(0, -1)}=`,
      12,
    ]) {
      const { browser } = fakeFetch(() => ({
        ok: true,
        status: 'claimed',
        expiresAt: 300,
        phonePub,
      }))
      await expect(
        approvalStatusAsBrowser(TOKEN, browser)
      ).rejects.toMatchObject({ serverCode: 'unexpected_response' })
    }
  })

  it('refuses a status it does not know', async () => {
    const { browser } = fakeFetch(() => ({
      ok: true,
      status: 'weird',
      expiresAt: 1,
    }))
    await expect(approvalStatusAsBrowser(TOKEN, browser)).rejects.toMatchObject(
      { serverCode: 'unexpected_response' }
    )
  })
})

describe('approval client: the phone', () => {
  it('claims with the session and reads the browser', async () => {
    const { seen, phone } = fakeFetch(() => ({
      ok: true,
      expiresAt: 300,
      hello: 'h',
      location: { city: 'Lyon', country: 'FR', extra: 1 },
      far: true,
    }))
    const result = await claimApproval(
      { channelId: CHANNEL, claimToken: 'ct', phonePub: 'pp' },
      phone
    )
    expect(result).toEqual({
      expiresAt: 300,
      hello: 'h',
      location: { city: 'Lyon', country: 'FR' },
      far: true,
    })
    expect(seen[0].url).toBe('https://api.test/accounts/v1/approval/claim')
    expect(seen[0].headers.authorization).toBe('Bearer access')
    expect(seen[0].body).toEqual({
      channelId: CHANNEL,
      claimToken: 'ct',
      phonePub: 'pp',
    })
  })

  it('reads a claim without a location as near', async () => {
    const { phone } = fakeFetch(() => ({
      ok: true,
      expiresAt: 300,
      hello: 'h',
    }))
    expect(
      await claimApproval(
        { channelId: CHANNEL, claimToken: 'ct', phonePub: 'pp' },
        phone
      )
    ).toEqual({ expiresAt: 300, hello: 'h', far: false })
  })

  it('reads the status, sends and cancels with the session', async () => {
    const { seen, phone } = fakeFetch((entry) =>
      entry.url.endsWith('status')
        ? { ok: true, status: 'sent', expiresAt: 1 }
        : { ok: true }
    )
    expect(await approvalStatusAsPhone(CHANNEL, phone)).toEqual({
      status: 'sent',
      expiresAt: 1,
    })
    await sendApprovalKey({ channelId: CHANNEL, key: 'k' }, phone)
    await cancelApprovalAsPhone(CHANNEL, phone)
    expect(seen.map((entry) => entry.body)).toEqual([
      { channelId: CHANNEL },
      { channelId: CHANNEL, key: 'k' },
      { channelId: CHANNEL },
    ])
    expect(
      seen.every((entry) => entry.headers.authorization === 'Bearer access')
    ).toBe(true)
  })

  it('throws the server code', async () => {
    const { phone } = fakeFetch(() => ({ ok: false, error: 'conflict' }), 409)
    await expect(
      claimApproval(
        { channelId: CHANNEL, claimToken: 'ct', phonePub: 'p' },
        phone
      )
    ).rejects.toMatchObject({ status: 409, serverCode: 'conflict' })
  })
})
