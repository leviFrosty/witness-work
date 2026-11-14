import { describe, expect, it, vi } from 'vitest'
import { bytesToBase64Url } from '../crypto'
import {
  ACCESS_TOKEN_AUDIENCE,
  accessTokenKeys,
  refreshKeys,
  signAccessToken,
  verifyAccessToken,
  type TokenEnv,
} from './tokens'

const SECRET = 'a-token-secret-of-at-least-32-characters!'
const OTHER_SECRET = 'another-token-secret-also-32-characters!!'
const NOW = Date.UTC(2026, 9, 15, 12)
const SESSION = {
  accountId: 'AAAAAAAAAAAAAAAAAAAAAA',
  sessionId: 'BBBBBBBBBBBBBBBBBBBBBB',
  platform: 'ios' as const,
}
const encoder = new TextEncoder()

const env = (overrides: Partial<TokenEnv> = {}): TokenEnv => ({
  ACCOUNT_TOKEN_SECRET: SECRET,
  APP_ATTEST_ENVIRONMENT: 'production',
  ...overrides,
})

const keysFor = async (overrides: Partial<TokenEnv> = {}) => {
  const keys = await accessTokenKeys(env(overrides))
  if (!keys) throw new Error('expected keys')
  return keys
}

const segment = (value: unknown) =>
  bytesToBase64Url(encoder.encode(JSON.stringify(value)))

/** A token with any header and claims, signed (HS256) by `secret`. */
const forge = async (
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  secret = SECRET
) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const input = `${segment(header)}.${segment(claims)}`
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(input))
  return `${input}.${bytesToBase64Url(new Uint8Array(signature))}`
}

/** The claims a real token carries, to vary one at a time. */
const realParts = async (keys: Awaited<ReturnType<typeof keysFor>>) => {
  const { accessToken } = await signAccessToken(keys, SESSION, NOW)
  const [header, payload] = accessToken.split('.')
  const decode = (part: string) =>
    JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  return { header: decode(header), claims: decode(payload) }
}

describe('access tokens', () => {
  it('round-trips the account, session, and platform for 15 minutes', async () => {
    const keys = await keysFor()
    const { accessToken, accessExpiresAt } = await signAccessToken(
      keys,
      SESSION,
      NOW
    )
    expect(accessExpiresAt).toBe(NOW + 15 * 60_000)
    expect(await verifyAccessToken(keys, accessToken, NOW)).toEqual({
      ...SESSION,
      keyEpoch: 0,
      expiresAt: accessExpiresAt,
    })
    const { header, claims } = await realParts(keys)
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT', kid: keys.current.kid })
    expect(claims).toEqual({
      iss: 'ww-api/production',
      aud: ACCESS_TOKEN_AUDIENCE,
      sub: SESSION.accountId,
      sid: SESSION.sessionId,
      platform: 'ios',
      kep: 0,
      iat: NOW / 1_000,
      exp: NOW / 1_000 + 900,
    })
  })

  it('carries the session’s capabilities when the issuer knew them', async () => {
    const keys = await keysFor()
    const verify = async (capabilities?: readonly string[] | null) =>
      (await verifyAccessToken(
        keys,
        (
          await signAccessToken(
            keys,
            { ...SESSION, capabilities: capabilities as never },
            NOW
          )
        ).accessToken,
        NOW
      ))!.capabilities
    expect(await verify(['sync-everyone'])).toEqual(['sync-everyone'])
    // Known to have none is not the same as not known.
    expect(await verify([])).toEqual([])
    expect(await verify()).toBeUndefined()
    expect(await verify(null)).toBeUndefined()
    // Only the names this server knows.
    expect(await verify(['sync-everyone', 'sync-later'])).toEqual(['sync-everyone'])
  })

  it('expires at exp, and never outlives its session', async () => {
    const keys = await keysFor()
    const { accessToken } = await signAccessToken(keys, SESSION, NOW)
    expect(
      await verifyAccessToken(keys, accessToken, NOW + 15 * 60_000 - 1)
    ).not.toBeNull()
    expect(await verifyAccessToken(keys, accessToken, NOW + 15 * 60_000)).toBeNull()

    const short = await signAccessToken(
      keys,
      { ...SESSION, sessionExpiresAt: NOW + 60_000 },
      NOW
    )
    expect(short.accessExpiresAt).toBe(NOW + 60_000)
    expect(await verifyAccessToken(keys, short.accessToken, NOW + 60_000)).toBeNull()
  })

  it('refuses another environment’s issuer, even under the same secret', async () => {
    const dev = await keysFor({ APP_ATTEST_ENVIRONMENT: 'development' })
    const prod = await keysFor()
    const { accessToken } = await signAccessToken(dev, SESSION, NOW)
    expect(await verifyAccessToken(dev, accessToken, NOW)).not.toBeNull()
    expect(await verifyAccessToken(prod, accessToken, NOW)).toBeNull()
  })

  it('refuses a dev-platform token on production', async () => {
    const prod = await keysFor()
    const dev = await keysFor({ APP_ATTEST_ENVIRONMENT: 'development' })
    const devSession = { ...SESSION, platform: 'dev' as const }
    expect(
      await verifyAccessToken(prod, (await signAccessToken(prod, devSession, NOW)).accessToken, NOW)
    ).toBeNull()
    expect(
      await verifyAccessToken(dev, (await signAccessToken(dev, devSession, NOW)).accessToken, NOW)
    ).toMatchObject({ platform: 'dev' })
  })

  it('refuses a wrong audience, kid, algorithm, or claim shape', async () => {
    const keys = await keysFor()
    const { header, claims } = await realParts(keys)
    const variants: [Record<string, unknown>, Record<string, unknown>][] = [
      [header, { ...claims, aud: 'ww-buddies' }],
      [header, { ...claims, aud: [ACCESS_TOKEN_AUDIENCE] }],
      [{ ...header, kid: 'not-a-known-kid' }, claims],
      [{ ...header, kid: undefined }, claims],
      [{ ...header, alg: 'HS512' }, claims],
      [{ ...header, typ: 'JWS' }, claims],
      [header, { ...claims, sub: 'short' }],
      [header, { ...claims, sid: 42 }],
      [header, { ...claims, platform: 'windows' }],
      // The draft's short name never verifies.
      [header, { ...claims, platform: undefined, plat: 'ios' }],
      [header, { ...claims, exp: claims.iat + 901 }],
      [header, { ...claims, iat: claims.iat + 120, exp: claims.iat + 600 }],
      [header, { ...claims, exp: String(claims.exp) }],
    ]
    for (const [h, c] of variants)
      expect(await verifyAccessToken(keys, await forge(h, c), NOW)).toBeNull()
    // The unmodified forgery passes, so each refusal is the one change.
    expect(await verifyAccessToken(keys, await forge(header, claims), NOW)).not.toBeNull()
  })

  it('refuses tampering and unsigned tokens', async () => {
    const keys = await keysFor()
    const { accessToken } = await signAccessToken(keys, SESSION, NOW)
    const [header, payload, signature] = accessToken.split('.')
    const other = segment({
      ...JSON.parse(Buffer.from(payload, 'base64url').toString()),
      sub: 'CCCCCCCCCCCCCCCCCCCCCC',
    })
    const flipped = `${signature.slice(0, 10)}${signature[10] === 'A' ? 'B' : 'A'}${signature.slice(11)}`
    for (const token of [
      `${header}.${other}.${signature}`,
      `${header}.${payload}.${flipped}`,
      `${header}.${payload}.`,
      `${segment({ alg: 'none', typ: 'JWT', kid: keys.current.kid })}.${payload}.`,
      `${header}.${payload}`,
      `${accessToken}.extra`,
      'not a token',
      '',
      `${header}.${payload}.${signature}${'A'.repeat(2_048)}`,
    ])
      expect(await verifyAccessToken(keys, token, NOW)).toBeNull()
    expect(
      await verifyAccessToken(keys, await forge(JSON.parse(Buffer.from(header, 'base64url').toString()), JSON.parse(Buffer.from(payload, 'base64url').toString()), OTHER_SECRET), NOW)
    ).toBeNull()
  })

  it('keeps the previous secret’s tokens valid through a rotation', async () => {
    const before = await keysFor()
    const { accessToken } = await signAccessToken(before, SESSION, NOW)
    const rotated = await keysFor({
      ACCOUNT_TOKEN_SECRET: OTHER_SECRET,
      ACCOUNT_TOKEN_SECRET_PREVIOUS: SECRET,
    })
    expect(rotated.current.kid).not.toBe(before.current.kid)
    expect(rotated.previous?.kid).toBe(before.current.kid)
    expect(await verifyAccessToken(rotated, accessToken, NOW)).not.toBeNull()
    // New tokens use the new secret.
    const fresh = await signAccessToken(rotated, SESSION, NOW)
    expect(await verifyAccessToken(before, fresh.accessToken, NOW)).toBeNull()
    // Once the previous secret is gone, its tokens fail (the app refreshes).
    const done = await keysFor({ ACCOUNT_TOKEN_SECRET: OTHER_SECRET })
    expect(await verifyAccessToken(done, accessToken, NOW)).toBeNull()
  })

  it('is off without a usable secret or a named environment', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await accessTokenKeys(env({ ACCOUNT_TOKEN_SECRET: undefined }))).toBeNull()
    expect(await accessTokenKeys(env({ ACCOUNT_TOKEN_SECRET: '   ' }))).toBeNull()
    expect(await accessTokenKeys(env({ ACCOUNT_TOKEN_SECRET: 'short' }))).toBeNull()
    expect(
      await accessTokenKeys(env({ APP_ATTEST_ENVIRONMENT: undefined as never }))
    ).toBeNull()
    const keys = await keysFor({ ACCOUNT_TOKEN_SECRET_PREVIOUS: 'short' })
    expect(keys.previous).toBeNull()
    warn.mockRestore()
  })
})

describe('refresh token keys', () => {
  const signWith = async (key: CryptoKey) =>
    bytesToBase64Url(
      new Uint8Array(
        await crypto.subtle.sign('HMAC', key, encoder.encode('message'))
      )
    )

  it('yields a MAC key and a rotation key per secret, the current first', async () => {
    const rotated = await keysFor({
      ACCOUNT_TOKEN_SECRET: OTHER_SECRET,
      ACCOUNT_TOKEN_SECRET_PREVIOUS: SECRET,
    })
    const [current, previous] = refreshKeys(rotated)
    expect(refreshKeys(rotated)).toHaveLength(2)
    expect(refreshKeys(await keysFor())).toHaveLength(1)
    const [own] = refreshKeys(await keysFor())
    expect(await signWith(previous.macKey)).toBe(await signWith(own.macKey))
    expect(await signWith(current.macKey)).not.toBe(await signWith(own.macKey))

    // Each kept apart from the others and from the access-token key.
    const macs = await Promise.all(
      [own.macKey, own.rotationKey, rotated.previous!.key].map(signWith)
    )
    expect(new Set(macs).size).toBe(3)
  })
})
