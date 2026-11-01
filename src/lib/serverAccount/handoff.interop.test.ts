import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import { HttpError, request } from '@/lib/http/request'
import { deriveClaimToken, parseHandoffLink } from '@/lib/serverAccount/handoff'
import {
  cancelHandoffAsOffer,
  handoffStatus,
  sendHandoffKey,
} from '@/lib/serverAccount/handoffClient'
import {
  createClaimSession,
  createOfferSession,
} from '@/lib/serverAccount/handoffSession'
import {
  interopAccount,
  interopEnabled,
  interopRelayUrl,
  interopSessions,
} from '@/lib/serverAccount/testing/interopSessions'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const relayUrl = interopRelayUrl
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

const HELLO = {
  deviceName: 'Interop',
  platform: 'android' as const,
  model: 'Pixel 9',
  appVersion: '3.0.0',
}

async function oldPhone() {
  const { accountKey, accountId, bearer } = await interopAccount(random)
  const options = bearer
  const session = createOfferSession(
    { accountKey, accountId, authorize: bearer.authorize },
    { baseUrl: relayUrl!, now: Date.now, randomBytes: random }
  )
  await session.open()
  if (session.state.step !== 'waiting') throw new Error(session.state.step)
  const parsed = parseHandoffLink(session.state.link)
  if (!parsed.ok) throw new Error(parsed.problem)
  return { accountKey, accountId, session, offer: parsed.offer, options }
}

const newPhone = (offer: Parameters<typeof createClaimSession>[0]) =>
  createClaimSession(offer, HELLO, {
    baseUrl: relayUrl!,
    now: Date.now,
    randomBytes: random,
  })

const code = async (run: () => Promise<unknown>) => {
  try {
    await run()
    return 'ok'
  } catch (error) {
    return error instanceof HttpError
      ? `${error.status} ${error.serverCode}`
      : String(error)
  }
}

describe.skipIf(!interopEnabled)('handoff against a real worker', () => {
  it('hands the account key to a new phone', async () => {
    const old = await oldPhone()
    const fresh = newPhone(old.offer)
    await fresh.claim()
    expect(fresh.state.step).toBe('waiting')
    await old.session.poll()
    expect(old.session.state.step).toBe('confirm')
    if (old.session.state.step !== 'confirm') return
    expect(old.session.state.code).toBe(fresh.code)
    expect(old.session.state.hello).toEqual(HELLO)
    await old.session.approve()
    await fresh.poll()
    expect(fresh.state.step).toBe('received')
    if (fresh.state.step !== 'received') return
    expect(toB64u(fresh.state.received.accountKey)).toBe(toB64u(old.accountKey))
    expect(fresh.state.received.accountId).toBe(old.accountId)

    const received = fresh.state.received.accountKey
    const opened = await interopSessions(random).openDetached(received)
    expect(opened.accountId).toBe(old.accountId)
    await opened.close()
    await fresh.finish()
    expect(fresh.debug().events.at(-1)?.outcome).toBe('ok')
    await old.session.poll()
    expect(old.session.state.step).toBe('done')

    expect(
      await code(() => cancelHandoffAsOffer(old.session.channelId, old.options))
    ).toBe('ok')
    expect(
      (await handoffStatus(old.session.channelId, old.options)).status
    ).toBe('done')
  })

  it('answers the documented codes', async () => {
    const old = await oldPhone()
    const channelId = old.session.channelId

    expect(
      await code(() =>
        sendHandoffKey({ channelId, key: toB64u(random(64)) }, old.options)
      )
    ).toBe('409 conflict')

    const wrong = { channelId, claimToken: toB64u(random(16)) }
    const plain = (op: string, json: object) =>
      code(() =>
        request({
          url: `${relayUrl}/accounts/v1/${op}`,
          json,
          timeoutMs: 10_000,
        })
      )
    expect(await plain('handoff/receive', wrong)).toBe('401 bad_signature')

    expect(
      await plain('handoff/claim', {
        channelId,
        claimToken: deriveClaimToken(old.offer.secret, channelId),
        claimPub: toB64u(random(32)),
        hello: 'A'.repeat(4096),
      })
    ).toBe('413 too_large')

    const stranger = await oldPhone()
    expect(await code(() => handoffStatus(channelId, stranger.options))).toBe(
      '403 forbidden'
    )

    const fresh = newPhone(old.offer)
    await fresh.claim()
    expect(
      await plain('handoff/done', {
        channelId,
        claimToken: deriveClaimToken(old.offer.secret, channelId),
      })
    ).toBe('409 conflict')
    await old.session.cancel()
    await stranger.session.cancel()
  })

  it('burns the channel after five wrong tokens, even once claimed', async () => {
    const old = await oldPhone()
    const fresh = newPhone(old.offer)
    await fresh.claim()
    for (let attempt = 0; attempt < 5; attempt++)
      await request({
        url: `${relayUrl}/accounts/v1/handoff/receive`,
        json: {
          channelId: old.session.channelId,
          claimToken: toB64u(random(16)),
        },
        timeoutMs: 10_000,
      }).catch(() => undefined)
    await old.session.poll()
    expect(old.session.state).toEqual({ step: 'failed', reason: 'cancelled' })
  })
})
