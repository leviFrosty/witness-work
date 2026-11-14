import type { Environment } from '../types'

/**
 * The relying party (witness-work `docs/passkeys-protocol.md`, "Relying
 * party"): each RP ID this worker accepts, with the origins that pair with
 * it. A response's origin and RP ID are checked as a pair from this table,
 * never as two separate lists.
 *
 * - `PASSKEY_RP_IDS`: comma-separated RP IDs; the first is the env's
 *   default (and the one Android origins pair with).
 * - `PASSKEY_ORIGINS`: a JSON object (or TOML table) from RP ID to its
 *   origins: web origins and `android:apk-key-hash:<b64u>` ones.
 *
 * Both are vars, so an Android signing key can be added without code. An RP
 * ID without origins accepts nothing.
 */

export interface RelyingParty {
  rpId: string
  origins: readonly string[]
}

export interface PasskeyRelyingParties {
  /** In `PASSKEY_RP_IDS` order; the first is the default. */
  parties: readonly RelyingParty[]
  byRpId: ReadonlyMap<string, RelyingParty>
}

export const RP_NAME = 'WitnessWork'
export const ANDROID_ORIGIN_PREFIX = 'android:apk-key-hash:'

const RP_ID_PATTERN = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

const parseOrigins = (value: unknown): Record<string, unknown> | null => {
  if (value == null) return null
  if (typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const cache = new WeakMap<object, PasskeyRelyingParties | null>()
let warned = false

const build = (
  env: Pick<Environment, 'PASSKEY_RP_IDS' | 'PASSKEY_ORIGINS'>
): PasskeyRelyingParties | null => {
  const ids = (env.PASSKEY_RP_IDS ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id !== '')
  const origins = parseOrigins(env.PASSKEY_ORIGINS)
  if (ids.length === 0 || !origins) return null
  const parties: RelyingParty[] = []
  for (const rpId of ids) {
    if (!RP_ID_PATTERN.test(rpId) || parties.some((p) => p.rpId === rpId)) {
      if (!warned) {
        warned = true
        console.warn('accounts: PASSKEY_RP_IDS has an invalid entry; ignoring it')
      }
      continue
    }
    const list = origins[rpId]
    parties.push({
      rpId,
      origins: Array.isArray(list)
        ? list.filter((origin): origin is string => typeof origin === 'string')
        : [],
    })
  }
  return parties.length > 0
    ? { parties, byRpId: new Map(parties.map((p) => [p.rpId, p])) }
    : null
}

/** The env's relying parties, or null when passkeys aren't configured. */
export const passkeyRelyingParties = (
  env: Pick<Environment, 'PASSKEY_RP_IDS' | 'PASSKEY_ORIGINS'>
): PasskeyRelyingParties | null => {
  if (!cache.has(env)) cache.set(env, build(env))
  return cache.get(env) ?? null
}

/**
 * The relying party for a request's optional `rpId`, null for one the env
 * doesn't list (`bad_request`). Absent, it's the one the request's `Origin`
 * pairs with (a browser on `localhost` gets `localhost`), else the env's
 * first.
 */
export const resolveRelyingParty = (
  config: PasskeyRelyingParties,
  rpId: unknown,
  origin?: string | null
): RelyingParty | null => {
  if (rpId === undefined || rpId === null)
    return (
      (origin != null &&
        config.parties.find((party) => party.origins.includes(origin))) ||
      config.parties[0]
    )
  if (typeof rpId !== 'string') return null
  return config.byRpId.get(rpId) ?? null
}

/** Whether `origin` pairs with `rpId` in the env's table. */
export const originPairs = (
  config: PasskeyRelyingParties,
  rpId: string,
  origin: string
): boolean => config.byRpId.get(rpId)?.origins.includes(origin) ?? false

export const isAndroidOrigin = (origin: string): boolean =>
  origin.startsWith(ANDROID_ORIGIN_PREFIX)
