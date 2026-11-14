import { beforeEach, describe, expect, it, vi } from 'vitest'
import { base64ToBytes } from './crypto'
import { createTestServiceAccount } from './test/googleServiceAccount'
import {
  FIREBASE_MESSAGING_SCOPE,
  GoogleAuthError,
  PLAY_INTEGRITY_SCOPE,
  forgetGoogleAccessToken,
  getGoogleAccessToken,
  getPlayIntegrityAccessToken,
  resetGoogleAuthState,
} from './googleAuth'

const NOW = 1_800_000_000_000

const decodeSegment = (segment: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(base64ToBytes(segment)))

const tokenFetch = (body: unknown = { access_token: 'ya29.test', expires_in: 3599 }) =>
  vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status: 200 })
  )

describe('getPlayIntegrityAccessToken', () => {
  beforeEach(() => resetGoogleAuthState())

  it('exchanges a signed RS256 assertion at Google, ignoring the key file token_uri', async () => {
    const account = await createTestServiceAccount()
    const fetch = tokenFetch()

    await expect(
      getPlayIntegrityAccessToken(account.json, { fetch, now: () => NOW })
    ).resolves.toBe('ya29.test')

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    const form = new URLSearchParams(String(init?.body))
    expect(form.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:jwt-bearer'
    )
    const [header, claims, signature] = form.get('assertion')!.split('.')
    expect(decodeSegment(header)).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(decodeSegment(claims)).toEqual({
      iss: 'play-integrity@example.iam.gserviceaccount.com',
      scope: PLAY_INTEGRITY_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    })
    await expect(
      crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        account.publicKey,
        base64ToBytes(signature),
        new TextEncoder().encode(`${header}.${claims}`)
      )
    ).resolves.toBe(true)
  })

  it('reuses the token until five minutes before it expires', async () => {
    const account = await createTestServiceAccount()
    const fetch = tokenFetch({ access_token: 'ya29.cached', expires_in: 3600 })
    let now = NOW

    await getPlayIntegrityAccessToken(account.json, { fetch, now: () => now })
    now = NOW + 54 * 60_000
    await getPlayIntegrityAccessToken(account.json, { fetch, now: () => now })
    expect(fetch).toHaveBeenCalledTimes(1)

    now = NOW + 56 * 60_000
    await getPlayIntegrityAccessToken(account.json, { fetch, now: () => now })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not reuse a token minted for a different key', async () => {
    const first = await createTestServiceAccount()
    const second = await createTestServiceAccount()
    const fetch = tokenFetch()

    await getPlayIntegrityAccessToken(first.json, { fetch, now: () => NOW })
    await getPlayIntegrityAccessToken(second.json, { fetch, now: () => NOW })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['malformed JSON', '{not json'],
    ['a key without a private key', JSON.stringify({ client_email: 'a@b' })],
    [
      'an unusable private key',
      JSON.stringify({ client_email: 'a@b', private_key: 'not-a-key' }),
    ],
  ])('fails closed on %s without calling Google', async (_name, json) => {
    const fetch = tokenFetch()
    await expect(
      getPlayIntegrityAccessToken(json, { fetch, now: () => NOW })
    ).rejects.toBeInstanceOf(GoogleAuthError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails on a rejected or empty token exchange', async () => {
    const account = await createTestServiceAccount()
    await expect(
      getPlayIntegrityAccessToken(account.json, {
        fetch: vi.fn(async () => new Response('{}', { status: 401 })),
        now: () => NOW,
      })
    ).rejects.toThrow('HTTP 401')
    await expect(
      getPlayIntegrityAccessToken(account.json, {
        fetch: tokenFetch({}),
        now: () => NOW,
      })
    ).rejects.toThrow('returned no token')
  })
})

describe('getGoogleAccessToken', () => {
  beforeEach(() => resetGoogleAuthState())

  it('caches a token per scope, so one key can serve two APIs', async () => {
    const account = await createTestServiceAccount()
    const fetch = tokenFetch()
    const deps = { fetch, now: () => NOW }

    await getGoogleAccessToken(account.json, FIREBASE_MESSAGING_SCOPE, deps)
    await getGoogleAccessToken(account.json, FIREBASE_MESSAGING_SCOPE, deps)
    await getGoogleAccessToken(account.json, PLAY_INTEGRITY_SCOPE, deps)

    expect(fetch).toHaveBeenCalledTimes(2)
    const scopes = fetch.mock.calls.map(
      ([, init]) =>
        decodeSegment(
          new URLSearchParams(String(init?.body)).get('assertion')!.split('.')[1]
        ).scope
    )
    expect(scopes).toEqual([FIREBASE_MESSAGING_SCOPE, PLAY_INTEGRITY_SCOPE])
  })

  it('mints a new token once a rejected one is forgotten', async () => {
    const account = await createTestServiceAccount()
    const fetch = tokenFetch({ access_token: 'ya29.first', expires_in: 3600 })
    const deps = { fetch, now: () => NOW }

    const first = await getGoogleAccessToken(
      account.json,
      FIREBASE_MESSAGING_SCOPE,
      deps
    )
    // A stale token from elsewhere doesn't evict the cached one.
    forgetGoogleAccessToken(account.json, FIREBASE_MESSAGING_SCOPE, 'ya29.other')
    await getGoogleAccessToken(account.json, FIREBASE_MESSAGING_SCOPE, deps)
    expect(fetch).toHaveBeenCalledTimes(1)

    forgetGoogleAccessToken(account.json, FIREBASE_MESSAGING_SCOPE, first)
    await getGoogleAccessToken(account.json, FIREBASE_MESSAGING_SCOPE, deps)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
