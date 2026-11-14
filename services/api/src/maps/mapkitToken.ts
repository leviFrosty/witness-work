import type { Environment } from '../types'
import { importEs256PrivateKey, signEs256Jwt } from '../crypto'

/**
 * MapKit JS tokens (witness-work ADR 0037 §8): short-lived ES256 JWTs the web
 * app hands to the map frame, which passes them to MapKit JS through its
 * `authorizationCallback`. Apple checks the signature against the MapKit JS
 * key, and `origin` against the page that loaded MapKit JS (the frame), so a
 * token is useless on any other site.
 *
 * Header `{ alg: ES256, kid, typ: JWT }`; claims `{ iss, iat, exp, origin,
 * scope: "mapkit_js" }`. The scope keeps the token from opening Apple's Maps
 * Server API with the same key.
 */

export type MapKitEnv = Pick<
  Environment,
  | 'MAPKIT_JS_PRIVATE_KEY'
  | 'MAPKIT_JS_KEY_ID'
  | 'MAPKIT_JS_ORIGINS'
  | 'APPLE_TEAM_ID'
>

export interface MapKitConfig {
  keyId: string
  teamId: string
  privateKey: string
  /** Allowed frame origins; the first is the default. */
  origins: string[]
}

export interface MapKitTokenClaims {
  iss: string
  iat: number
  exp: number
  origin: string
  scope: 'mapkit_js'
}

/** Apple's key ids and team ids are 10 letters and digits. */
const APPLE_ID = /^[A-Z0-9]{10}$/

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * A public DNS name: letters, digits, and inner hyphens per label, a final
 * label starting with a letter, no wildcard or trailing dot. The URL parser
 * lets `*` through in a host, so this is checked on its own.
 */
const DNS_NAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Whether a local frame (`http://localhost:<port>`) may be named: only on a
 * development worker that is itself served from a local host, i.e. `wrangler
 * dev`. A deployed worker never mints one, whatever its config says.
 */
export const allowsLocalFrame = (
  environment: Environment['APP_ATTEST_ENVIRONMENT'],
  requestUrl: string
): boolean =>
  environment === 'development' &&
  LOCAL_HOSTS.has(new URL(requestUrl).hostname)

/** Config values already warned about in this isolate, so a bad value logs once. */
const warned = new Set<string>()
const warnOnce = (key: string, message: string) => {
  if (warned.has(key)) return
  if (warned.size > 100) warned.clear()
  warned.add(key)
  console.warn(message)
}

/**
 * The frame origins in `MAPKIT_JS_ORIGINS` that a token may name. Each must
 * be a bare origin (`https://host[:port]`, no path, no wildcard); `http:` only
 * for a local host when `allowLocal`. Anything else is dropped with a warning
 * (once per isolate).
 */
export const parseFrameOrigins = (
  value: string | undefined,
  allowLocal: boolean
): string[] => {
  const origins: string[] = []
  for (const entry of (value ?? '').split(',')) {
    const candidate = entry.trim()
    if (!candidate) continue
    let url: URL | null = null
    try {
      url = new URL(candidate)
    } catch {
      // Warned below.
    }
    const allowed =
      url != null &&
      url.origin === candidate &&
      ((url.protocol === 'https:' && DNS_NAME.test(url.hostname)) ||
        (url.protocol === 'http:' &&
          allowLocal &&
          LOCAL_HOSTS.has(url.hostname)))
    if (!allowed) {
      // A local entry is expected (and skipped) on a deployed worker.
      const local = url != null && LOCAL_HOSTS.has(url.hostname)
      if (!local)
        warnOnce(
          `origin:${candidate}`,
          'maps: ignoring an invalid MAPKIT_JS_ORIGINS entry'
        )
      continue
    }
    if (!origins.includes(candidate)) origins.push(candidate)
  }
  return origins
}

/** Everything a token needs, or null when any of it is missing. */
export const readMapKitConfig = (
  env: MapKitEnv,
  allowLocal: boolean
): MapKitConfig | null => {
  const keyId = env.MAPKIT_JS_KEY_ID?.trim() ?? ''
  const teamId = env.APPLE_TEAM_ID?.trim() ?? ''
  const privateKey = env.MAPKIT_JS_PRIVATE_KEY?.trim() ?? ''
  const origins = parseFrameOrigins(env.MAPKIT_JS_ORIGINS, allowLocal)
  // Unset is the normal state before setup; only a set, malformed id warns.
  if (keyId && !APPLE_ID.test(keyId))
    warnOnce('key-id', 'maps: MAPKIT_JS_KEY_ID is not a 10-character Apple id')
  if (teamId && !APPLE_ID.test(teamId))
    warnOnce('team-id', 'maps: APPLE_TEAM_ID is not a 10-character Apple id')
  if (!APPLE_ID.test(keyId) || !APPLE_ID.test(teamId)) return null
  if (!privateKey || origins.length === 0) return null
  return { keyId, teamId, privateKey, origins }
}

/** The imported key, per isolate; a new secret value imports afresh. */
let cachedKey: { pem: string; key: Promise<CryptoKey> } | null = null

/** Rejects when the secret isn't a P-256 PKCS#8 key. */
export const mapKitSigningKey = (pem: string): Promise<CryptoKey> => {
  if (cachedKey?.pem !== pem) {
    const key = importEs256PrivateKey(pem)
    cachedKey = { pem, key }
    // A bad key isn't kept, so fixing the secret takes effect at once.
    key.catch(() => {
      if (cachedKey?.key === key) cachedKey = null
    })
  }
  return cachedKey.key
}

export const resetMapKitKeyCache = (): void => {
  cachedKey = null
  warned.clear()
}

export const signMapKitToken = async (
  config: Pick<MapKitConfig, 'keyId' | 'teamId' | 'privateKey'>,
  origin: string,
  issuedAtSeconds: number,
  lifetimeSeconds: number
): Promise<{ token: string; claims: MapKitTokenClaims }> => {
  const claims: MapKitTokenClaims = {
    iss: config.teamId,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + lifetimeSeconds,
    origin,
    scope: 'mapkit_js',
  }
  const token = await signEs256Jwt(
    await mapKitSigningKey(config.privateKey),
    { kid: config.keyId, typ: 'JWT' },
    { ...claims }
  )
  return { token, claims }
}
