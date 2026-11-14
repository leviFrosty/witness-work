import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'
import { AccountSessionError } from '@/lib/serverAccount/session'
import { createMapKitTokens } from '@/vendor/web/maps/mapkitTokens'

const ORIGIN = 'https://maps-beta.witnesswork.app'
const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ0ZWFtIn0.c2lnbmF0dXJl'

const setup = (answer: () => Promise<{ data: unknown }>) => {
  let time = 1_000_000
  const request = vi.fn(answer)
  const tokens = createMapKitTokens({
    request,
    url: 'https://api.test/maps/v1/mapkit-tokens',
    origin: ORIGIN,
    now: () => time,
  })
  return { tokens, request, advance: (ms: number) => (time += ms) }
}

const ok = (expiresAt = 1_000_000 + 30 * 60_000) =>
  Promise.resolve({
    data: { ok: true, token: TOKEN, origin: ORIGIN, expiresAt },
  })

describe('MapKit JS tokens', () => {
  it("asks for the frame's origin and keeps the token while it's fresh", async () => {
    const { tokens, request, advance } = setup(() => ok())
    await expect(tokens.get()).resolves.toEqual({
      ok: true,
      token: TOKEN,
      expiresAt: 1_000_000 + 30 * 60_000,
    })
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', json: { origin: ORIGIN } })
    )
    advance(20 * 60_000)
    await tokens.get()
    expect(request).toHaveBeenCalledOnce()
    advance(6 * 60_000)
    await tokens.get()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('asks once for callers that ask together', async () => {
    const { tokens, request } = setup(() => ok())
    await Promise.all([tokens.get(), tokens.get(), tokens.get()])
    expect(request).toHaveBeenCalledOnce()
  })

  it('asks again after a reset', async () => {
    const { tokens, request } = setup(() => ok())
    await tokens.get()
    tokens.reset()
    await tokens.get()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('says maps are unconfigured on 503 maps_unconfigured', async () => {
    const { tokens } = setup(() =>
      Promise.reject(new HttpError('server', 503, 'maps_unconfigured', 60_000))
    )
    await expect(tokens.get()).resolves.toEqual({
      ok: false,
      reason: 'unconfigured',
    })
  })

  it('sorts the other failures', async () => {
    const cases: [unknown, string][] = [
      [new AccountSessionError('signedOut'), 'signedOut'],
      [
        new AccountSessionError('unavailable', {
          serverCode: 'account_key_unavailable',
        }),
        'signedOut',
      ],
      [new AccountSessionError('offline'), 'offline'],
      [new HttpError('rateLimited', 429, 'rate_limited', 1000), 'busy'],
      [new HttpError('server', 500, 'internal'), 'failed'],
    ]
    for (const [error, reason] of cases) {
      const { tokens } = setup(() => Promise.reject(error))
      await expect(tokens.get()).resolves.toEqual({ ok: false, reason })
    }
  })

  it("refuses an answer that isn't a token for this frame", async () => {
    for (const data of [
      { ok: true, token: 'nope', origin: ORIGIN, expiresAt: 2e6 },
      { ok: true, token: TOKEN, origin: 'https://evil.test', expiresAt: 2e6 },
      { ok: true, token: TOKEN, origin: ORIGIN },
      null,
    ]) {
      const { tokens } = setup(() => Promise.resolve({ data }))
      await expect(tokens.get()).resolves.toEqual({
        ok: false,
        reason: 'failed',
      })
    }
  })
})
