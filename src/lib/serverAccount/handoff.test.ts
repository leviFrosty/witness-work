import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  randomBytes as nodeRandomBytes,
} from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { concatBytes, fromB64u, toB64u, utf8 } from '@/lib/bytes'
import {
  buildHandoffLink,
  createHandoffKeyPair,
  createHandoffOffer,
  deriveClaimToken,
  deriveHandoffKeys,
  deriveVerifier,
  formatHandoffCode,
  type HandoffHello,
  HANDOFF_LINK_BASE,
  isHandoffLink,
  openAccountKey,
  openHello,
  parseHandoffLink,
  sealAccountKey,
  sealHello,
} from '@/lib/serverAccount/handoff'
import {
  createClaimSession,
  createOfferSession,
  HANDOFF_POLL_FAILURE_LIMIT,
  handoffFailureFor,
  type OfferAccount,
} from '@/lib/serverAccount/handoffSession'
import { HttpError } from '@/lib/http/request'
import { AccountSessionError } from '@/lib/serverAccount/session'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

const HELLO: HandoffHello = {
  deviceName: 'Pixel 9',
  platform: 'android',
  model: 'Pixel 9',
  appVersion: '3.0.0',
}

// --- An in-memory ww-api: the handoff Durable Object's rules ----------------

type Channel = {
  accountId: string
  verifier: string
  status: 'open' | 'claimed' | 'sent' | 'done' | 'cancelled'
  expiresAt: number
  badTokens: number
  claimPub: string | null
  hello: string | null
  claimBody: string | null
  key: string | null
}

const LIFETIME_MS = 10 * 60 * 1000

function fakeServer(options: { clock?: () => number } = {}) {
  const clock = options.clock ?? Date.now
  /** Access tokens, and the account each one's session is for. */
  const accounts = new Map<string, string>()
  const bearers: { op: string; authorization: string | null }[] = []
  const channels = new Map<string, Channel>()
  const calls: string[] = []
  /** Answers the next status call with this claimPub (a hostile server). */
  let swapClaimPub: string | null = null

  const reply = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  const error = (status: number, code: string, extra: object = {}) =>
    reply(status, { ok: false, error: code, code, ...extra })

  const live = (channelId: string) => {
    const channel = channels.get(channelId)
    return channel && clock() < channel.expiresAt ? channel : null
  }
  const checkToken = (channel: Channel, claimToken: string) => {
    if (deriveVerifier(claimToken) === channel.verifier) return null
    if (channel.status !== 'cancelled') {
      if (channel.badTokens + 1 >= 5) finish(channel, 'cancelled')
      channel.badTokens++
    }
    return error(401, 'bad_signature')
  }
  const finish = (channel: Channel, status: 'done' | 'cancelled') => {
    channel.status = status
    channel.claimPub = channel.hello = channel.key = null
  }

  const fetchImpl = (async (url: string, init: RequestInit) => {
    const op = url.split('/accounts/v1/')[1]
    calls.push(op)
    const body = JSON.parse(String(init.body)) as Record<string, string>

    const headers = new Headers(init.headers)
    const authorization = headers.get('authorization')
    bearers.push({ op, authorization })
    if (authorization) {
      const payload = body as Record<string, unknown>
      const accountId = accounts.get(authorization.replace(/^Bearer /, ''))
      if (!accountId) return error(401, 'unauthorized')
      const channelId = payload.channelId as string
      if (op === 'handoff/open') {
        if (live(channelId)) return error(409, 'conflict')
        const expiresAt = clock() + LIFETIME_MS
        channels.set(channelId, {
          accountId,
          verifier: payload.verifier as string,
          status: 'open',
          expiresAt,
          badTokens: 0,
          claimPub: null,
          hello: null,
          claimBody: null,
          key: null,
        })
        return reply(200, { ok: true, expiresAt })
      }
      const channel = live(channelId)
      if (!channel) return error(404, 'not_found')
      if (channel.accountId !== accountId) return error(403, 'forbidden')
      if (op === 'handoff/status') {
        const claimPub = swapClaimPub ?? channel.claimPub
        return reply(200, {
          ok: true,
          status: channel.status,
          expiresAt: channel.expiresAt,
          ...(claimPub && channel.claimPub ? { claimPub } : {}),
          ...(channel.hello ? { hello: channel.hello } : {}),
        })
      }
      if (op === 'handoff/send') {
        if (channel.status !== 'claimed') return error(409, 'conflict')
        channel.status = 'sent'
        channel.key = payload.key as string
        return reply(200, { ok: true })
      }
      if (op === 'handoff/cancel') {
        if (channel.status !== 'done') finish(channel, 'cancelled')
        return reply(200, { ok: true })
      }
      return error(400, 'bad_request')
    }

    const channel = live(body.channelId)
    if (!channel) return error(404, 'not_found')
    const refused = checkToken(channel, body.claimToken)
    if (refused) return refused
    if (op === 'handoff/claim') {
      const claimBody = `${body.claimPub}\n${body.hello}`
      if (channel.status !== 'open')
        return channel.status !== 'cancelled' && channel.claimBody === claimBody
          ? reply(200, { ok: true, expiresAt: channel.expiresAt })
          : error(409, 'conflict')
      channel.status = 'claimed'
      channel.claimPub = body.claimPub
      channel.hello = body.hello
      channel.claimBody = claimBody
      return reply(200, { ok: true, expiresAt: channel.expiresAt })
    }
    if (op === 'handoff/receive')
      return reply(200, {
        ok: true,
        status: channel.status,
        ...(channel.status === 'sent' && channel.key
          ? { key: channel.key }
          : {}),
      })
    if (op === 'handoff/done') {
      if (channel.status === 'done') return reply(200, { ok: true })
      if (channel.status !== 'sent') return error(409, 'conflict')
      finish(channel, 'done')
      return reply(200, { ok: true })
    }
    if (op === 'handoff/cancel') {
      if (channel.status !== 'done') finish(channel, 'cancelled')
      return reply(200, { ok: true })
    }
    return error(400, 'bad_request')
  }) as unknown as typeof fetch

  return {
    fetchImpl,
    calls,
    bearers,
    channels,
    accounts,
    swapClaimPub: (value: string | null) => {
      swapClaimPub = value
    },
  }
}

type Server = ReturnType<typeof fakeServer>

/** An account with an open session, as the old phone holds it. */
function registeredAccount(server: Server): OfferAccount {
  const accountKey = random(32)
  const accountId = toB64u(random(16))
  const token = toB64u(random(16))
  server.accounts.set(token, accountId)
  return {
    accountKey,
    accountId,
    authorize: (run) => run(`Bearer ${token}`),
  }
}

const deps = (server: Server, now: () => number = Date.now) => ({
  baseUrl: 'https://relay.test',
  now,
  randomBytes: random,
  fetchImpl: server.fetchImpl,
})

// --- The link ----------------------------------------------------------------

describe('handoff link', () => {
  it('round-trips the channel, the offer key, and the secret', () => {
    const { offer } = createHandoffOffer(random)
    const link = buildHandoffLink(offer)
    expect(link.startsWith(`${HANDOFF_LINK_BASE}#1`)).toBe(true)
    expect(link).toHaveLength(HANDOFF_LINK_BASE.length + 2 + 86)
    const parsed = parseHandoffLink(link)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.offer.channelId).toBe(offer.channelId)
    expect(parsed.offer.offerPub).toBe(offer.offerPub)
    expect(toB64u(parsed.offer.secret)).toBe(toB64u(offer.secret))
  })

  it('accepts surrounding space, a trailing slash, and a query', () => {
    const link = buildHandoffLink(createHandoffOffer(random).offer)
    const fragment = link.slice(HANDOFF_LINK_BASE.length)
    for (const text of [
      `  ${link}\n`,
      `${HANDOFF_LINK_BASE}/${fragment}`,
      `${HANDOFF_LINK_BASE}?lang=es${fragment}`,
      link.replace('https://ww-proxy', 'HTTPS://WW-PROXY'),
    ])
      expect(parseHandoffLink(text).ok).toBe(true)
  })

  it('tells other links, newer versions, and damaged codes apart', () => {
    const link = buildHandoffLink(createHandoffOffer(random).offer)
    const fragment = link.slice(link.indexOf('#') + 2)
    expect(parseHandoffLink('https://example.com/h#1abc')).toEqual({
      ok: false,
      problem: 'notHandoff',
    })
    expect(
      parseHandoffLink('https://ww-proxy.leviwilkerson.com/b#1abc').ok
    ).toBe(false)
    expect(parseHandoffLink('hello')).toEqual({
      ok: false,
      problem: 'notHandoff',
    })
    expect(parseHandoffLink(`${HANDOFF_LINK_BASE}#2${fragment}`)).toEqual({
      ok: false,
      problem: 'version',
    })
    for (const damaged of [
      HANDOFF_LINK_BASE,
      `${HANDOFF_LINK_BASE}#`,
      `${HANDOFF_LINK_BASE}#1${fragment.slice(1)}`,
      `${HANDOFF_LINK_BASE}#1${fragment}A`,
      `${HANDOFF_LINK_BASE}#1${fragment.slice(1)}!`,
      `${HANDOFF_LINK_BASE}#x${fragment}`,
      `${HANDOFF_LINK_BASE}#1${toB64u(new Uint8Array(64))}`,
    ])
      expect(parseHandoffLink(damaged)).toEqual({
        ok: false,
        problem: 'damaged',
      })
    expect(isHandoffLink(HANDOFF_LINK_BASE)).toBe(true)
    expect(isHandoffLink('https://ww-proxy.leviwilkerson.com/b#1x')).toBe(false)
  })
})

// --- Keys, checked against Node's own crypto ---------------------------------

const PKCS8_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex')
const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex')

function nodeShared(privateKey: Uint8Array, publicKey: string) {
  return new Uint8Array(
    diffieHellman({
      privateKey: createPrivateKey({
        key: Buffer.concat([PKCS8_X25519, privateKey]),
        format: 'der',
        type: 'pkcs8',
      }),
      publicKey: createPublicKey({
        key: Buffer.concat([SPKI_X25519, fromB64u(publicKey)]),
        format: 'der',
        type: 'spki',
      }),
    })
  )
}

const hmac = (key: Uint8Array, data: Uint8Array) =>
  new Uint8Array(createHmac('sha256', key).update(data).digest())

describe('handoff keys', () => {
  it('derive claimToken and verifier as the spec says', () => {
    const secret = random(16)
    const channelId = toB64u(random(16))
    const token = deriveClaimToken(secret, channelId)
    const expected = new Uint8Array(
      hkdfSync(
        'sha256',
        secret,
        new Uint8Array(0),
        utf8(`ww-account/v1/handoff/claim\n${channelId}`),
        16
      )
    )
    expect(token).toBe(toB64u(expected))
    expect(deriveVerifier(token)).toBe(
      toB64u(new Uint8Array(createHash('sha256').update(expected).digest()))
    )
  })

  it('give both phones the same keys and code, matching an independent derivation', () => {
    const { offer, keyPair: old } = createHandoffOffer(random)
    const fresh = createHandoffKeyPair(random)
    const common = {
      secret: offer.secret,
      channelId: offer.channelId,
      offerPub: offer.offerPub,
      claimPub: fresh.publicKey,
    }
    const oldKeys = deriveHandoffKeys({
      ...common,
      privateKey: old.privateKey,
      peerPublicKey: fresh.publicKey,
    })
    const newKeys = deriveHandoffKeys({
      ...common,
      privateKey: fresh.privateKey,
      peerPublicKey: offer.offerPub,
    })
    expect(toB64u(oldKeys.helloKey)).toBe(toB64u(newKeys.helloKey))
    expect(toB64u(oldKeys.keyKey)).toBe(toB64u(newKeys.keyKey))
    expect(oldKeys.code).toBe(newKeys.code)
    expect(oldKeys.code).toMatch(/^\d{6}$/)

    // HKDF-Extract(salt = secret, ikm = shared), then one Expand block each.
    const prk = hmac(offer.secret, nodeShared(old.privateKey, fresh.publicKey))
    const transcript = `${offer.channelId}\n${offer.offerPub}\n${fresh.publicKey}`
    const block = (label: string) =>
      hmac(
        prk,
        concatBytes(
          utf8(`ww-account/v1/handoff/${label}\n${transcript}`),
          new Uint8Array([1])
        )
      )
    expect(toB64u(oldKeys.helloKey)).toBe(toB64u(block('hello')))
    expect(toB64u(oldKeys.keyKey)).toBe(toB64u(block('key')))
    const code = block('code')
    const value = Buffer.from(code.slice(0, 4)).readUInt32BE(0) % 1_000_000
    expect(oldKeys.code).toBe(String(value).padStart(6, '0'))
  })

  it('formats the code in two groups', () => {
    expect(formatHandoffCode('042917')).toBe('042 917')
  })

  it('seal the hello and key so only the matching keys open them', () => {
    const { offer, keyPair } = createHandoffOffer(random)
    const fresh = createHandoffKeyPair(random)
    const keys = deriveHandoffKeys({
      privateKey: fresh.privateKey,
      peerPublicKey: offer.offerPub,
      secret: offer.secret,
      channelId: offer.channelId,
      offerPub: offer.offerPub,
      claimPub: fresh.publicKey,
    })
    const longName = 'x'.repeat(100)
    const hello = sealHello(
      keys,
      offer.channelId,
      { ...HELLO, deviceName: ` ${longName} ` },
      random
    )
    const opened = openHello(keys, offer.channelId, hello)
    expect(opened.deviceName).toHaveLength(64)
    expect(opened.platform).toBe('android')
    // Bound to its channel and purpose.
    expect(() => openHello(keys, toB64u(random(16)), hello)).toThrow()
    expect(() => openAccountKey(keys, offer.channelId, hello)).toThrow()

    const accountKey = random(32)
    const accountId = toB64u(random(16))
    const sealed = sealAccountKey(
      keys,
      offer.channelId,
      { accountKey, accountId },
      random
    )
    const back = openAccountKey(keys, offer.channelId, sealed)
    expect(toB64u(back.accountKey)).toBe(toB64u(accountKey))
    expect(back.accountId).toBe(accountId)

    // A different secret: different keys, nothing opens.
    const wrong = deriveHandoffKeys({
      privateKey: keyPair.privateKey,
      peerPublicKey: fresh.publicKey,
      secret: random(16),
      channelId: offer.channelId,
      offerPub: offer.offerPub,
      claimPub: fresh.publicKey,
    })
    expect(wrong.code).not.toBe(keys.code)
    expect(() => openHello(wrong, offer.channelId, hello)).toThrow()
    expect(() => openAccountKey(wrong, offer.channelId, sealed)).toThrow()
  })
})

// --- Both phones, end to end -------------------------------------------------

/** Runs the offer and claim until both are done. */
async function handoff(server: Server) {
  const account = registeredAccount(server)
  const old = createOfferSession(account, deps(server))
  await old.open()
  expect(old.state.step).toBe('waiting')
  if (old.state.step !== 'waiting') throw new Error('not waiting')
  const parsed = parseHandoffLink(old.state.link)
  if (!parsed.ok) throw new Error('bad link')
  const fresh = createClaimSession(parsed.offer, HELLO, deps(server))
  return { account, old, fresh }
}

describe('handoff sessions', () => {
  it('move the account key from the old phone to the new one', async () => {
    const server = fakeServer()
    const { account, old, fresh } = await handoff(server)

    await old.poll()
    expect(old.state.step).toBe('waiting')

    await fresh.claim()
    expect(fresh.state.step).toBe('waiting')
    await fresh.poll()
    expect(fresh.state.step).toBe('waiting')

    await old.poll()
    expect(old.state.step).toBe('confirm')
    if (old.state.step !== 'confirm') return
    expect(old.state.hello).toEqual(HELLO)
    expect(old.state.code).toBe(fresh.code)

    await old.approve()
    expect(old.state.step).toBe('sent')

    await fresh.poll()
    expect(fresh.state.step).toBe('received')
    if (fresh.state.step !== 'received') return
    expect(toB64u(fresh.state.received.accountKey)).toBe(
      toB64u(account.accountKey)
    )
    expect(fresh.state.received.accountId).toBe(account.accountId)

    await fresh.finish()
    expect(fresh.state.step).toBe('done')
    await old.poll()
    expect(old.state.step).toBe('done')

    // The server kept no blobs.
    const channel = server.channels.get(old.channelId)
    expect(channel?.status).toBe('done')
    expect(channel?.key).toBeNull()
    expect(channel?.hello).toBeNull()

    // The log has codes, never secrets.
    const log = JSON.stringify([old.debug(), fresh.debug()])
    expect(log).not.toContain(toB64u(account.accountKey))
    expect(old.debug().events.map((e) => e.op)).toEqual([
      'handoff/open',
      'handoff/status',
      'handoff/status',
      'handoff/send',
      'handoff/status',
    ])
    expect(fresh.debug().events.every((e) => e.outcome === 'ok')).toBe(true)
  })

  it('refuses a claimPub the server swapped: the hello does not open, and the codes differ', async () => {
    const server = fakeServer()
    const { old, fresh } = await handoff(server)
    await fresh.claim()
    const attacker = createHandoffKeyPair(random)
    server.swapClaimPub(attacker.publicKey)
    await old.poll()
    expect(old.state).toEqual({ step: 'failed', reason: 'tampered' })
    expect(server.channels.get(old.channelId)?.status).toBe('cancelled')
    await fresh.poll()
    expect(fresh.state).toEqual({ step: 'failed', reason: 'cancelled' })
  })

  it('refuses a claim made with the wrong secret, and five of them burn the channel', async () => {
    const server = fakeServer()
    const { old } = await handoff(server)
    if (old.state.step !== 'waiting') throw new Error('not waiting')
    const parsed = parseHandoffLink(old.state.link)
    if (!parsed.ok) throw new Error('bad link')
    for (let attempt = 0; attempt < 5; attempt++) {
      const guess = createClaimSession(
        { ...parsed.offer, secret: random(16) },
        HELLO,
        deps(server)
      )
      await guess.claim()
      expect(guess.state).toEqual({ step: 'failed', reason: 'badToken' })
    }
    await old.poll()
    expect(old.state).toEqual({ step: 'failed', reason: 'cancelled' })
    // Even the right secret can't claim a burned channel.
    const late = createClaimSession(parsed.offer, HELLO, deps(server))
    await late.claim()
    expect(late.state).toEqual({ step: 'failed', reason: 'used' })
  })

  it('lets only the first phone claim', async () => {
    const server = fakeServer()
    const { old, fresh } = await handoff(server)
    if (old.state.step !== 'waiting') throw new Error('not waiting')
    const parsed = parseHandoffLink(old.state.link)
    if (!parsed.ok) throw new Error('bad link')
    await fresh.claim()
    const second = createClaimSession(parsed.offer, HELLO, deps(server))
    await second.claim()
    expect(second.state).toEqual({ step: 'failed', reason: 'used' })
    expect(fresh.state.step).toBe('waiting')
  })

  it('repeats a claim whose answer got lost, and the server answers ok again', async () => {
    const server = fakeServer()
    const { old } = await handoff(server)
    if (old.state.step !== 'waiting') throw new Error('not waiting')
    const parsed = parseHandoffLink(old.state.link)
    if (!parsed.ok) throw new Error('bad link')
    let dropped = false
    const flaky = (async (url: string, init: RequestInit) => {
      const response = await server.fetchImpl(url, init)
      if (!dropped && url.endsWith('handoff/claim')) {
        dropped = true
        throw new TypeError('Network request failed')
      }
      return response
    }) as unknown as typeof fetch
    const fresh = createClaimSession(parsed.offer, HELLO, {
      ...deps(server),
      fetchImpl: flaky,
    })
    await fresh.claim()
    expect(fresh.state.step).toBe('waiting')
    expect(server.calls.filter((op) => op === 'handoff/claim')).toHaveLength(2)
    expect(fresh.debug().events.map((e) => e.outcome)).toEqual([
      'offline',
      'ok',
    ])
  })

  it('tells the new phone when the old one declines', async () => {
    const server = fakeServer()
    const { old, fresh } = await handoff(server)
    await fresh.claim()
    await old.poll()
    await old.decline()
    expect(old.state.step).toBe('declined')
    await fresh.poll()
    expect(fresh.state).toEqual({ step: 'failed', reason: 'cancelled' })
  })

  it('tells the old phone when the new one stops before storing the key', async () => {
    const server = fakeServer()
    const { old, fresh } = await handoff(server)
    await fresh.claim()
    await old.poll()
    await old.approve()
    await fresh.poll()
    expect(fresh.state.step).toBe('received')
    await fresh.cancel()
    await old.poll()
    expect(old.state).toEqual({ step: 'failed', reason: 'cancelled' })
  })

  it('cancels the channel when the old phone leaves', async () => {
    const server = fakeServer()
    const { old, fresh } = await handoff(server)
    await old.cancel()
    expect(old.state.step).toBe('cancelled')
    expect(server.channels.get(old.channelId)?.status).toBe('cancelled')
    await fresh.claim()
    expect(fresh.state).toEqual({ step: 'failed', reason: 'used' })
  })

  it('expires with the channel', async () => {
    let now = Date.now()
    const server = fakeServer({ clock: () => now })
    const account = registeredAccount(server)
    const old = createOfferSession(
      account,
      deps(server, () => now)
    )
    await old.open()
    if (old.state.step !== 'waiting') throw new Error('not waiting')
    const parsed = parseHandoffLink(old.state.link)
    if (!parsed.ok) throw new Error('bad link')
    now += LIFETIME_MS + 1
    const fresh = createClaimSession(
      parsed.offer,
      HELLO,
      deps(server, () => now)
    )
    await fresh.claim()
    expect(fresh.state).toEqual({ step: 'failed', reason: 'expired' })
    // The old phone notices from its own clock, without asking.
    const before = server.calls.length
    await old.poll()
    expect(old.state).toEqual({ step: 'failed', reason: 'expired' })
    expect(server.calls.length).toBe(before)
  })

  it("sends the old phone's ops with its session token, the new phone's without", async () => {
    const server = fakeServer()
    const account = registeredAccount(server)
    const old = createOfferSession(account, deps(server))
    await old.open()
    if (old.state.step !== 'waiting') throw new Error('not waiting')
    const parsed = parseHandoffLink(old.state.link)
    if (!parsed.ok) throw new Error('bad link')
    const fresh = createClaimSession(parsed.offer, HELLO, deps(server))
    await fresh.claim()
    await old.poll()
    await old.cancel()
    const sent = (op: string) =>
      server.bearers
        .filter((entry) => entry.op === op)
        .map((entry) => entry.authorization !== null)
    expect(sent('handoff/open')).toEqual([true])
    expect(sent('handoff/status')).toContain(true)
    expect(sent('handoff/claim')).toEqual([false])
    expect(sent('handoff/cancel')).toEqual([true])
  })

  it("fails on the old phone when its session isn't the account's, or can't be opened", async () => {
    const server = fakeServer()
    const other = registeredAccount(server)
    const owner = registeredAccount(server)
    const opened = createOfferSession(owner, deps(server))
    await opened.open()
    if (opened.state.step !== 'waiting') throw new Error('not waiting')

    const unknown = createOfferSession(
      {
        accountKey: random(32),
        accountId: toB64u(random(16)),
        authorize: (run) => run('Bearer nobody'),
      },
      deps(server)
    )
    await unknown.open()
    expect(unknown.state).toEqual({ step: 'failed', reason: 'server' })

    const unverified = createOfferSession(
      {
        ...other,
        authorize: async () => {
          throw new AccountSessionError('attestation', {
            attestation: 'device',
          })
        },
      },
      deps(server)
    )
    await unverified.open()
    expect(unverified.state).toEqual({ step: 'failed', reason: 'unverified' })
  })

  it('keeps polling through a dropped connection', async () => {
    const server = fakeServer()
    let offline = false
    const flaky = (async (url: string, init: RequestInit) => {
      if (offline) throw new TypeError('Network request failed')
      return server.fetchImpl(url, init)
    }) as unknown as typeof fetch
    const old = createOfferSession(registeredAccount(server), {
      ...deps(server),
      fetchImpl: flaky,
    })
    await old.open()
    offline = true
    await old.poll()
    expect(old.state.step).toBe('waiting')
    expect(old.debug().events.at(-1)?.outcome).toBe('offline')
    offline = false
    await old.poll()
    expect(old.state.step).toBe('waiting')
  })

  it('rides out a few server errors while polling, but not a run of them', async () => {
    const server = fakeServer()
    let failing = false
    const flaky = (async (url: string, init: RequestInit) => {
      if (failing && url.endsWith('/handoff/status'))
        return new Response('{"error":"internal"}', { status: 503 })
      return server.fetchImpl(url, init)
    }) as unknown as typeof fetch
    const old = createOfferSession(registeredAccount(server), {
      ...deps(server),
      fetchImpl: flaky,
    })
    await old.open()
    failing = true
    for (let i = 1; i < HANDOFF_POLL_FAILURE_LIMIT; i++) await old.poll()
    expect(old.state.step).toBe('waiting')
    // An answer starts the count again.
    failing = false
    await old.poll()
    failing = true
    for (let i = 1; i < HANDOFF_POLL_FAILURE_LIMIT; i++) await old.poll()
    expect(old.state.step).toBe('waiting')
    await old.poll()
    expect(old.state).toEqual({ step: 'failed', reason: 'server' })
  })

  it('fails to open while offline', async () => {
    const server = fakeServer()
    const old = createOfferSession(registeredAccount(server), {
      ...deps(server),
      fetchImpl: (async () => {
        throw new TypeError('Network request failed')
      }) as unknown as typeof fetch,
    })
    await old.open()
    expect(old.state).toEqual({ step: 'failed', reason: 'offline' })
  })
})

describe('handoffFailureFor', () => {
  it('maps the server codes', () => {
    const code = (serverCode: string, status = 400) =>
      new HttpError('client', status, serverCode)
    expect(handoffFailureFor(code('conflict', 409), 'handoff/claim')).toBe(
      'used'
    )
    expect(handoffFailureFor(code('conflict', 409), 'handoff/send')).toBe(
      'conflict'
    )
    expect(handoffFailureFor(code('not_found', 404), 'x')).toBe('expired')
    expect(handoffFailureFor(code('bad_signature', 401), 'x')).toBe('badToken')
    expect(handoffFailureFor(code('forbidden', 403), 'x')).toBe('noAccount')
    expect(handoffFailureFor(code('disabled', 503), 'x')).toBe('unavailable')
    expect(handoffFailureFor(code('too_large', 413), 'x')).toBe('server')
    expect(handoffFailureFor(new HttpError('offline'), 'x')).toBe('offline')
    expect(handoffFailureFor(new HttpError('timeout'), 'x')).toBe('offline')
    expect(handoffFailureFor(new Error('x'), 'x')).toBe('server')
  })

  it("maps a session that couldn't be opened, and an outdated app", () => {
    const attestation = (problem: 'device' | 'temporary' | 'failed') =>
      new AccountSessionError('attestation', { attestation: problem })
    expect(handoffFailureFor(attestation('device'), 'x')).toBe('unverified')
    expect(handoffFailureFor(attestation('failed'), 'x')).toBe('unverified')
    expect(handoffFailureFor(attestation('temporary'), 'x')).toBe('verifyLater')
    const failed = (reason: string) =>
      new HttpError('client', 403, 'attestation_failed', null, undefined, {
        ok: false,
        code: 'attestation_failed',
        reason,
      })
    expect(handoffFailureFor(failed('integrity_unavailable'), 'x')).toBe(
      'verifyLater'
    )
    expect(handoffFailureFor(failed('app_not_recognized'), 'x')).toBe(
      'unverified'
    )
    expect(
      handoffFailureFor(new HttpError('client', 426, 'upgrade_required'), 'x')
    ).toBe('updateRequired')
    expect(
      handoffFailureFor(
        new AccountSessionError('upgrade', { status: 426 }),
        'x'
      )
    ).toBe('updateRequired')
  })
})
