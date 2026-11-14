import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { base64ToBytes } from './crypto'
import {
  resetApnsState,
  sendApnsNotifications,
  type ApnsEnv,
  type ApnsNotification,
} from './apns'
import { makeMemoryKv } from './test/memoryKv'

const NOW = Date.UTC(2026, 8, 23, 12)
const APNS_KEY_ID = 'ABCDE12345'
const TEAM_ID = 'TEAM123456'
const BUNDLE_ID = 'com.example.app'
const TOKEN_KV_KEY = 'apns:provider-token'
const decoder = new TextDecoder()

const hexToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')

const pemOf = async (key: CryptoKey) => {
  const der = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', key)) as ArrayBuffer
  )
  let binary = ''
  for (const byte of der) binary += String.fromCharCode(byte)
  return `-----BEGIN PRIVATE KEY-----\n${btoa(binary)
    .match(/.{1,64}/g)
    ?.join('\n')}\n-----END PRIVATE KEY-----`
}

const notification = (
  overrides: Partial<ApnsNotification> = {}
): ApnsNotification => ({
  device: { token: hexToken(), environment: 'sandbox' },
  payload: { aps: { alert: { title: 'Title', body: 'Body' } } },
  ...overrides,
})

const setup = async (overrides: Partial<ApnsEnv> = {}) => {
  const keys = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair
  const kv = makeMemoryKv()
  const env: ApnsEnv = {
    APNS_KEY_ID,
    APNS_PRIVATE_KEY: await pemOf(keys.privateKey),
    APPLE_TEAM_ID: TEAM_ID,
    IOS_BUNDLE_ID: BUNDLE_ID,
    NOTES_KV: kv,
    ...overrides,
  }
  const requests: Array<{ url: string; init: RequestInit }> = []
  let respond = (_url: string): Response => new Response(null, { status: 200 })
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init: init ?? {} })
    return respond(String(input))
  })
  let now = NOW
  const deps = {
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => now,
    sleep: vi.fn(async (_ms: number) => undefined),
  }
  return {
    env,
    kv,
    keys,
    requests,
    fetch,
    deps,
    setNow: (value: number) => {
      now = value
    },
    respondWith: (fn: (url: string) => Response) => {
      respond = fn
    },
  }
}

const tokenOf = (init: RequestInit) =>
  new Headers(init.headers).get('authorization')?.replace(/^bearer /, '') ?? ''

beforeEach(() => resetApnsState())
afterEach(() => vi.restoreAllMocks())

describe('sendApnsNotifications', () => {
  it('posts the caller payload with an ES256 provider token to the device environment host', async () => {
    const { env, keys, requests, deps } = await setup()
    const sandbox = notification({ payload: { aps: {}, custom: { a: 1 } } })
    const production = notification({
      device: { token: hexToken(), environment: 'production' },
    })

    expect(await sendApnsNotifications(env, [sandbox, production], deps)).toEqual(
      ['sent', 'sent']
    )

    expect(requests.map((request) => request.url)).toEqual([
      `https://api.sandbox.push.apple.com/3/device/${sandbox.device.token}`,
      `https://api.push.apple.com/3/device/${production.device.token}`,
    ])
    const [first, second] = requests
    expect(first.init.method).toBe('POST')
    const headers = new Headers(first.init.headers)
    expect(headers.get('apns-topic')).toBe(BUNDLE_ID)
    expect(headers.get('apns-push-type')).toBe('alert')
    expect(JSON.parse(String(first.init.body))).toEqual(sandbox.payload)
    expect(JSON.parse(String(second.init.body))).toEqual(production.payload)

    const jwt = tokenOf(first.init)
    expect(tokenOf(second.init)).toBe(jwt)
    const [header, claims, signature] = jwt.split('.')
    expect(JSON.parse(decoder.decode(base64ToBytes(header)))).toEqual({
      alg: 'ES256',
      kid: APNS_KEY_ID,
    })
    expect(JSON.parse(decoder.decode(base64ToBytes(claims)))).toEqual({
      iss: TEAM_ID,
      iat: Math.floor(NOW / 1000),
    })
    const raw = base64ToBytes(signature)
    expect(raw).toHaveLength(64)
    expect(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.publicKey,
        raw,
        new TextEncoder().encode(`${header}.${claims}`)
      )
    ).toBe(true)
  })

  it('reuses the provider token from memory, then KV, and re-signs after 45 minutes', async () => {
    const { env, kv, requests, deps, setNow } = await setup()
    const batch = [notification()]

    await sendApnsNotifications(env, batch, deps)
    const first = tokenOf(requests[0].init)
    expect(JSON.parse(kv.store.get(TOKEN_KV_KEY) ?? '{}')).toMatchObject({
      token: first,
      keyId: APNS_KEY_ID,
      teamId: TEAM_ID,
    })

    setNow(NOW + 10 * 60 * 1000)
    await sendApnsNotifications(env, batch, deps)
    resetApnsState()
    await sendApnsNotifications(env, batch, deps)
    expect(tokenOf(requests[1].init)).toBe(first)
    expect(tokenOf(requests[2].init)).toBe(first)

    setNow(NOW + 46 * 60 * 1000)
    await sendApnsNotifications(env, batch, deps)
    expect(tokenOf(requests[3].init)).not.toBe(first)
  })

  it('ignores a malformed cached token and signs a new one', async () => {
    const { env, kv, requests, deps } = await setup()
    await kv.put(TOKEN_KV_KEY, JSON.stringify({ token: 'x', issuedAt: 'soon' }))

    expect(await sendApnsNotifications(env, [notification()], deps)).toEqual([
      'sent',
    ])
    expect(tokenOf(requests[0].init)).not.toBe('x')
  })

  it('reports unregistered only for 410 or BadDeviceToken, logging reasons without tokens', async () => {
    const { env, deps, respondWith } = await setup()
    const gone = notification()
    const bad = notification()
    const wrongTopic = notification()
    const fine = notification()
    respondWith((url) => {
      if (url.endsWith(gone.device.token))
        return Response.json({ reason: 'Unregistered' }, { status: 410 })
      if (url.endsWith(bad.device.token))
        return Response.json({ reason: 'BadDeviceToken' }, { status: 400 })
      if (url.endsWith(wrongTopic.device.token)) {
        return Response.json(
          { reason: 'DeviceTokenNotForTopic' },
          { status: 400 }
        )
      }
      return new Response(null, { status: 200 })
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(
      await sendApnsNotifications(env, [gone, bad, wrongTopic, fine], deps)
    ).toEqual(['unregistered', 'unregistered', 'failed', 'sent'])

    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toContain('DeviceTokenNotForTopic')
    expect(logged).not.toContain(wrongTopic.device.token)
  })

  it('re-signs and resends once when APNs rejects the provider token', async () => {
    const { env, kv, requests, deps, respondWith } = await setup()
    let rejected = 0
    respondWith(() =>
      rejected++ === 0
        ? Response.json({ reason: 'ExpiredProviderToken' }, { status: 403 })
        : new Response(null, { status: 200 })
    )

    expect(await sendApnsNotifications(env, [notification()], deps)).toEqual([
      'sent',
    ])
    expect(requests).toHaveLength(2)
    const retried = tokenOf(requests[1].init)
    expect(retried).not.toBe(tokenOf(requests[0].init))
    expect(JSON.parse(kv.store.get(TOKEN_KV_KEY) ?? '{}').token).toBe(retried)
    expect(deps.sleep).not.toHaveBeenCalled()
  })

  it('gives up and drops the token when the re-signed one is rejected too', async () => {
    const { env, kv, requests, deps, respondWith } = await setup()
    respondWith(() =>
      Response.json({ reason: 'InvalidProviderToken' }, { status: 403 })
    )
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(await sendApnsNotifications(env, [notification()], deps)).toEqual([
      'failed',
    ])
    expect(requests).toHaveLength(2)
    expect(kv.store.has(TOKEN_KV_KEY)).toBe(false)
  })

  it('retries network errors, 429, and 5xx once after a delay with the same collapse id', async () => {
    const { env, requests, fetch, deps, respondWith } = await setup()
    const network = notification()
    const throttled = notification()
    const unavailable = notification()
    const seen = new Set<string>()
    respondWith((url) => {
      const first = !seen.has(url)
      seen.add(url)
      if (first && url.endsWith(throttled.device.token))
        return Response.json({ reason: 'TooManyRequests' }, { status: 429 })
      if (first && url.endsWith(unavailable.device.token))
        return Response.json({ reason: 'ServiceUnavailable' }, { status: 503 })
      return new Response(null, { status: 200 })
    })
    fetch.mockRejectedValueOnce(new Error('connection reset'))

    expect(
      await sendApnsNotifications(env, [network, throttled, unavailable], deps)
    ).toEqual(['sent', 'sent', 'sent'])

    expect(deps.sleep).toHaveBeenCalledTimes(1)
    expect(deps.sleep).toHaveBeenCalledWith(1_000)
    const collapseIds = (token: string) =>
      requests
        .filter((request) => request.url.endsWith(token))
        .map((request) =>
          new Headers(request.init.headers).get('apns-collapse-id')
        )
    // The network failure never reached `requests`; only its retry did.
    expect(collapseIds(network.device.token)).toHaveLength(1)
    for (const { device } of [throttled, unavailable]) {
      const [first, second] = collapseIds(device.token)
      expect(first).toMatch(/^[0-9a-f-]{36}$/)
      expect(second).toBe(first)
    }
  })

  it('fails after one retry and never retries a rejected payload', async () => {
    const { env, requests, deps, respondWith } = await setup()
    const down = notification()
    const tooLarge = notification()
    respondWith((url) =>
      url.endsWith(down.device.token)
        ? Response.json({ reason: 'InternalServerError' }, { status: 500 })
        : Response.json({ reason: 'PayloadTooLarge' }, { status: 413 })
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(await sendApnsNotifications(env, [down, tooLarge], deps)).toEqual([
      'failed',
      'failed',
    ])
    expect(
      requests.filter((request) => request.url.endsWith(down.device.token))
    ).toHaveLength(2)
    expect(
      requests.filter((request) => request.url.endsWith(tooLarge.device.token))
    ).toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('skips and logs once when APNs secrets are missing', async () => {
    const { env, fetch, deps } = await setup({ APNS_PRIVATE_KEY: undefined })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(await sendApnsNotifications(env, [notification()], deps)).toEqual([
      'skipped',
    ])
    await sendApnsNotifications(env, [notification()], deps)

    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]).toEqual(['apns: not configured; skipping pushes'])
  })

  it('accepts a PEM stored with literal \\n sequences', async () => {
    const base = await setup()
    const env = {
      ...base.env,
      APNS_PRIVATE_KEY: String(base.env.APNS_PRIVATE_KEY).replace(/\n/g, '\\n'),
    }

    expect(
      await sendApnsNotifications(env, [notification()], base.deps)
    ).toEqual(['sent'])
  })
})
