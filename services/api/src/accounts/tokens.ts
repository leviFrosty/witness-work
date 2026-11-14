import type { Environment } from '../types'
import { bytesToBase64Url, sha256Bytes } from '../crypto'
import { BUDDIES_ID_PATTERN, decodeB64u, isPlainObject } from '../buddies/contracts'
import {
  ACCOUNT_LIMITS,
  SESSION_CAPABILITIES,
  isAccountId,
  type SessionCapability,
} from './contracts'
import { SESSION_PLATFORMS, type SessionPlatform } from './schema'

/**
 * Access tokens (witness-work ADR 0027, `docs/accounts-protocol.md`, "The
 * access token"): JWTs signed with HMAC-SHA256 under the Worker secret
 * `ACCOUNT_TOKEN_SECRET`, 15 minutes each. Nothing is stored; a token is
 * valid while its signature, issuer, audience, and expiry check out.
 *
 * Claims: the registered `iss`, `aud`, `sub` (the account id), `iat`, and
 * `exp`, plus `sid` (the session id, as in OpenID Connect), `platform`
 * (`ios`, `android`, `dev`, or `web`), `kep`, the session's key epoch
 * (ADR 0039; a token without one counts as `0`), and `cap`, the session's
 * capabilities when the issuer knew them (witness-work ADR 0060), so a route
 * on the write path needn't read them from D1. A token without `cap` says
 * nothing: the route reads the session.
 *
 * Rotation: the header's `kid` is derived from the secret that signed it, so
 * moving the old secret to `ACCOUNT_TOKEN_SECRET_PREVIOUS` keeps its tokens
 * valid until they expire. Without it, they fail once and the app refreshes.
 * Refresh tokens issued under the old secret refresh only while it's there,
 * since their MAC is checked under it; once it's gone, their sessions open
 * anew.
 *
 * Each secret also yields the two refresh token keys
 * (src/accounts/sessionStore.ts): the one each token's MAC is signed under
 * (`macKey`), and the one the next token is derived under (`rotationKey`),
 * each kept apart from the signing key and the other by its own derivation;
 * and the two keys that seal activity entry ids (src/accounts/activityIds.ts).
 *
 * The issuer names the environment (`APP_ATTEST_ENVIRONMENT`) and each
 * environment has its own secret, so a development token never passes on
 * production.
 *
 * Privacy: tokens carry the account id and session id; never log them.
 */

export const ACCESS_TOKEN_AUDIENCE = 'ww-account'
/** `openssl rand -base64 32` is 44 characters; anything shorter is refused. */
export const MIN_TOKEN_SECRET_CHARS = 32
/** Clock skew allowed on `iat`, seconds. */
export const IAT_SKEW_SECONDS = 60
/** Far beyond any token this worker mints; longer input isn't parsed. */
const MAX_TOKEN_CHARS = 2_048
export const ACCESS_TOKEN_SECONDS = ACCOUNT_LIMITS.accessTokenMs / 1_000

export type TokenEnv = Pick<
  Environment,
  | 'ACCOUNT_TOKEN_SECRET'
  | 'ACCOUNT_TOKEN_SECRET_PREVIOUS'
  | 'APP_ATTEST_ENVIRONMENT'
>

/** Who a verified access token says is calling. */
export interface AccessTokenClaims {
  accountId: string
  sessionId: string
  platform: SessionPlatform
  /** The session's key epoch when the token was issued (`kep`). */
  keyEpoch: number
  /**
   * The session's capabilities when the token was issued (`cap`); undefined
   * on a token without the claim.
   */
  capabilities?: SessionCapability[]
  /** Epoch milliseconds. */
  expiresAt: number
}

/**
 * The HMAC-SHA256 keys one secret yields for refresh tokens, each the
 * SHA-256 of its own label and the secret.
 */
export interface RefreshKeys {
  /** Signs every refresh token's MAC. */
  macKey: CryptoKey
  /** Derives the token that replaces a refresh token. */
  rotationKey: CryptoKey
}

/**
 * The keys one secret yields for activity entry ids
 * (src/accounts/activityIds.ts), each the SHA-256 of its own label and the
 * secret.
 */
export interface ActivityIdKeys {
  /** AES-256-GCM: seals the row id. */
  cipherKey: CryptoKey
  /** HMAC-SHA256: derives each id's nonce from what it seals. */
  nonceKey: CryptoKey
}

interface TokenKey extends RefreshKeys {
  kid: string
  key: CryptoKey
  activityIds: ActivityIdKeys
}

export interface AccessTokenKeys {
  issuer: string
  current: TokenKey
  previous: TokenKey | null
}

/** `ww-api/production` or `ww-api/development`; null when unset. */
export const accessTokenIssuer = (
  env: Pick<Environment, 'APP_ATTEST_ENVIRONMENT'>
): string | null =>
  env.APP_ATTEST_ENVIRONMENT === 'production' ||
  env.APP_ATTEST_ENVIRONMENT === 'development'
    ? `ww-api/${env.APP_ATTEST_ENVIRONMENT}`
    : null

const encoder = new TextEncoder()
const keyCache = new Map<string, Promise<TokenKey>>()

const labelled = (label: string, secret: string) =>
  sha256Bytes(encoder.encode(`${label}\n${secret}`))

const hmacKey = (bytes: Uint8Array) =>
  crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )

const derivedKeyCache = new Map<string, Promise<CryptoKey>>()

/**
 * The HMAC-SHA256 key `label` derives from a Worker secret: the SHA-256 of
 * `<label>\n<secret>`. Every key the accounts routes take from a secret is
 * one of these, each kept apart from the others by its label: the refresh
 * token and activity id keys here, the challenge and ticket keys
 * (src/accounts/passkeyTokens.ts), and rate counter names
 * (src/accounts/rateCounter.ts). Cached per isolate.
 */
export const derivedHmacKey = (
  label: string,
  secret: string
): Promise<CryptoKey> => {
  const cacheKey = `${label}\n${secret}`
  let cached = derivedKeyCache.get(cacheKey)
  if (!cached) {
    // Labels can carry a day (rate counter names), so the cache is bounded.
    if (derivedKeyCache.size >= 64) derivedKeyCache.clear()
    cached = labelled(label, secret).then(hmacKey)
    cached.catch(() => derivedKeyCache.delete(cacheKey))
    derivedKeyCache.set(cacheKey, cached)
  }
  return cached
}

const tokenKey = (secret: string): Promise<TokenKey> => {
  let cached = keyCache.get(secret)
  if (!cached) {
    cached = (async () => {
      const digest = await sha256Bytes(
        encoder.encode(`ww-account/v1/token-kid\n${secret}`)
      )
      const [key, macKey, rotationKey, cipherKey, nonceKey] =
        await Promise.all([
          hmacKey(encoder.encode(secret)),
          derivedHmacKey('ww-account/v1/refresh-mac', secret),
          derivedHmacKey('ww-account/v1/refresh-rotation', secret),
          labelled('ww-account/v1/activity-id-cipher', secret).then((bytes) =>
            crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
              'encrypt',
              'decrypt',
            ])
          ),
          derivedHmacKey('ww-account/v1/activity-id-nonce', secret),
        ])
      return {
        kid: bytesToBase64Url(digest).slice(0, 16),
        key,
        macKey,
        rotationKey,
        activityIds: { cipherKey, nonceKey },
      }
    })()
    cached.catch(() => keyCache.delete(secret))
    keyCache.set(secret, cached)
  }
  return cached
}

const warnedShortSecrets = new Set<string>()

/**
 * `value` trimmed, or null when it's unset or shorter than
 * `MIN_TOKEN_SECRET_CHARS` (warned once per isolate for each `name`).
 */
export const usableSecret = (
  value: string | undefined,
  name = 'a token secret'
): string | null => {
  const secret = value?.trim()
  if (!secret) return null
  if (secret.length >= MIN_TOKEN_SECRET_CHARS) return secret
  if (!warnedShortSecrets.has(name)) {
    warnedShortSecrets.add(name)
    console.warn(
      `accounts: ${name} is shorter than ${MIN_TOKEN_SECRET_CHARS} characters; ignoring it`
    )
  }
  return null
}

/**
 * The keys this worker signs and verifies with, or null when sessions are
 * off: no usable `ACCOUNT_TOKEN_SECRET`, or no `APP_ATTEST_ENVIRONMENT` to
 * name the issuer. Never mints an unsigned token.
 */
export const accessTokenKeys = async (
  env: TokenEnv
): Promise<AccessTokenKeys | null> => {
  const issuer = accessTokenIssuer(env)
  const secret = usableSecret(env.ACCOUNT_TOKEN_SECRET)
  if (!issuer || !secret) return null
  const previousSecret = usableSecret(env.ACCOUNT_TOKEN_SECRET_PREVIOUS)
  const [current, previous] = await Promise.all([
    tokenKey(secret),
    previousSecret && previousSecret !== secret
      ? tokenKey(previousSecret)
      : null,
  ])
  return { issuer, current, previous }
}

/** Each secret's refresh token keys: the current secret's first. */
export const refreshKeys = (keys: AccessTokenKeys): RefreshKeys[] =>
  (keys.previous ? [keys.current, keys.previous] : [keys.current]).map(
    ({ macKey, rotationKey }) => ({ macKey, rotationKey })
  )

/** Each secret's activity id keys: the current secret's first. */
export const activityIdKeys = (keys: AccessTokenKeys): ActivityIdKeys[] =>
  (keys.previous ? [keys.current, keys.previous] : [keys.current]).map(
    ({ activityIds }) => activityIds
  )

const encodeJson = (value: unknown): string =>
  bytesToBase64Url(encoder.encode(JSON.stringify(value)))

const decodeJson = (segment: string): Record<string, unknown> | null => {
  const bytes = decodeB64u(segment)
  if (!bytes) return null
  try {
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
    )
    return isPlainObject(value) ? value : null
  } catch {
    return null
  }
}

/**
 * A 15-minute access token for this session, cut short to the session's own
 * `sessionExpiresAt` (epoch ms) when that comes first.
 */
export const signAccessToken = async (
  keys: AccessTokenKeys,
  session: {
    accountId: string
    sessionId: string
    platform: SessionPlatform
    /**
     * The session's key epoch (`kep`). Defaults to `0`, which fails closed:
     * after a key change, a write with it is refused.
     */
    keyEpoch?: number
    /** The session's capabilities (`cap`); left out when not known here. */
    capabilities?: readonly SessionCapability[] | null
    sessionExpiresAt?: number
  },
  now: number = Date.now()
): Promise<{ accessToken: string; accessExpiresAt: number }> => {
  const iat = Math.floor(now / 1_000)
  const exp = Math.min(
    iat + ACCESS_TOKEN_SECONDS,
    session.sessionExpiresAt == null
      ? Infinity
      : Math.floor(session.sessionExpiresAt / 1_000)
  )
  const header = encodeJson({ alg: 'HS256', typ: 'JWT', kid: keys.current.kid })
  const payload = encodeJson({
    iss: keys.issuer,
    aud: ACCESS_TOKEN_AUDIENCE,
    sub: session.accountId,
    sid: session.sessionId,
    platform: session.platform,
    kep: session.keyEpoch ?? 0,
    ...(session.capabilities == null ? {} : { cap: [...session.capabilities] }),
    iat,
    exp,
  })
  const signature = await crypto.subtle.sign(
    'HMAC',
    keys.current.key,
    encoder.encode(`${header}.${payload}`)
  )
  return {
    accessToken: `${header}.${payload}.${bytesToBase64Url(new Uint8Array(signature))}`,
    accessExpiresAt: exp * 1_000,
  }
}

const isPlatform = (value: unknown): value is SessionPlatform =>
  SESSION_PLATFORMS.includes(value as SessionPlatform)

const isSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const isKeyEpoch = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** `cap`: the names this server knows; undefined when absent or malformed. */
const readCapabilities = (value: unknown): SessionCapability[] | undefined =>
  Array.isArray(value)
    ? SESSION_CAPABILITIES.filter((name) => value.includes(name))
    : undefined

/**
 * The claims of a token this worker signed and that hasn't expired, or null.
 * Checks, in order: three base64url segments, an `HS256` header whose `kid`
 * names a configured key, the signature, then `iss`, `aud`, `iat`, `exp`, and
 * the shapes of `sub`, `sid`, `platform`, and `kep` (absent is `0`). A `dev`
 * token never passes on production.
 */
export const verifyAccessToken = async (
  keys: AccessTokenKeys,
  token: string,
  now: number = Date.now()
): Promise<AccessTokenClaims | null> => {
  if (token.length > MAX_TOKEN_CHARS) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerPart, payloadPart, signaturePart] = parts

  const header = decodeJson(headerPart)
  if (
    !header ||
    header.alg !== 'HS256' ||
    (header.typ !== undefined && header.typ !== 'JWT') ||
    typeof header.kid !== 'string'
  )
    return null
  const key = [keys.current, keys.previous].find(
    (candidate) => candidate?.kid === header.kid
  )?.key
  if (!key) return null

  const signature = decodeB64u(signaturePart)
  if (!signature || signature.length !== 32) return null
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    encoder.encode(`${headerPart}.${payloadPart}`)
  )
  if (!valid) return null

  const claims = decodeJson(payloadPart)
  if (!claims) return null
  const { iss, aud, sub, sid, platform, iat, exp, kep = 0 } = claims
  const nowSeconds = now / 1_000
  if (iss !== keys.issuer || aud !== ACCESS_TOKEN_AUDIENCE) return null
  if (!isSeconds(iat) || !isSeconds(exp)) return null
  if (iat > nowSeconds + IAT_SKEW_SECONDS) return null
  if (exp <= nowSeconds || exp - iat > ACCESS_TOKEN_SECONDS) return null
  if (!isAccountId(sub)) return null
  if (typeof sid !== 'string' || !BUDDIES_ID_PATTERN.test(sid)) return null
  if (!isPlatform(platform)) return null
  if (!isKeyEpoch(kep)) return null
  if (platform === 'dev' && keys.issuer === 'ww-api/production') return null
  return {
    accountId: sub,
    sessionId: sid,
    platform,
    keyEpoch: kep,
    ...(claims.cap === undefined
      ? {}
      : { capabilities: readCapabilities(claims.cap) ?? [] }),
    expiresAt: exp * 1_000,
  }
}
