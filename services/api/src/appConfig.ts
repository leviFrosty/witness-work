import type { AppContext, Environment } from './types'
import { parseMinAppVersion } from './notesImport/config'
import {
  entitlementForApp,
  isSyncChangesOn,
  syncSwitches,
} from './accounts/syncSwitch'
import { webSignupAvailable } from './accounts/webSignup'
import { turnstileSiteKey } from './accounts/turnstile'

/**
 * `GET /app/v1/config` (witness-work ADR 0027, `docs/accounts-protocol.md`,
 * "Updates and the legacy switch"): what every app version from sessions on
 * reads at launch and on returning to the foreground. Below `minAppVersion`
 * the app shows a blocking Update Required screen with a store link. It's the
 * app-wide successor to Notes Import's own `notes-import:min-version`.
 *
 * No authentication; the worker never rejects a request for its version.
 */

export const APP_MIN_VERSION_KEY = 'app:min-version'
const CACHE_TTL_SECONDS = 60
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

/**
 * The app's minimum version (`major.minor.patch`), or null without a floor:
 * KV `app:min-version` (`{"minVersion":"1.42.0"}`), else the
 * `APP_MIN_VERSION` var. Invalid values are logged and ignored; the KV read
 * is edge-cached for 60 seconds.
 */
export const resolveAppMinVersion = async (
  env: Pick<Environment, 'APP_MIN_VERSION'> & {
    NOTES_KV: Pick<KVNamespace, 'get'>
  }
): Promise<string | null> => {
  let raw: string | null = null
  try {
    raw = await env.NOTES_KV.get(APP_MIN_VERSION_KEY, {
      cacheTtl: CACHE_TTL_SECONDS,
    })
  } catch {
    console.warn('app: min-version KV read failed; using APP_MIN_VERSION')
  }
  if (raw != null && raw.trim() !== '') {
    const version = parseMinAppVersion(raw)
    if (version) return version
    console.warn('app: min-version KV value is invalid')
  }
  const fallback = env.APP_MIN_VERSION?.trim()
  if (!fallback) return null
  if (SEMVER_PATTERN.test(fallback)) return fallback
  console.warn('APP_MIN_VERSION is invalid')
  return null
}

const COUNTRY_PATTERN = /^[A-Z]{2}$/
const REGION_PATTERN = /^[A-Z0-9]{1,3}$/
/** Cloudflare's `cf.country` for an unknown location, and for Tor. */
const NO_COUNTRY = new Set(['XX', 'T1'])

const normalizedCode = (value: unknown, pattern: RegExp): string | null => {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return pattern.test(upper) ? upper : null
}

/**
 * The caller's coarse location from `request.cf`, for the app's sales-region
 * check (witness-work ADR 0041 §3): `country` (ISO 3166-1 alpha-2) and
 * `regionCode` (the ISO 3166-2 subdivision without its country prefix, `MB`
 * for Manitoba). Null when unknown, Tor, or malformed; `regionCode` is null
 * whenever `country` is. Never stored or logged.
 */
export const requestRegion = (
  request: Request
): { country: string | null; regionCode: string | null } => {
  const raw = (request as { cf?: unknown }).cf
  const cf = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const country = normalizedCode(cf.country, COUNTRY_PATTERN)
  if (country == null || NO_COUNTRY.has(country)) return { country: null, regionCode: null }
  return { country, regionCode: normalizedCode(cf.regionCode, REGION_PATTERN) }
}

/**
 * Also carries Cloud Sync's switches (witness-work ADR 0030), so a device
 * without a session knows whether opening one would get it Cloud Sync:
 * `sync: { enabled, entitlement }`. `enabled` is false on a worker without
 * the sync bucket or the accounts database. `entitlement` is `everyone` only
 * for a request whose `?capabilities=` (comma-separated) has `sync-everyone`.
 *
 * And web sign-up's (witness-work `docs/passkeys-protocol.md`, "Web
 * sign-up"): `webSignup: { enabled, turnstileSiteKey }`. `enabled` is the
 * kill switch, false on a worker without what sign-up needs. The site key is
 * there whenever Turnstile is set up, even with sign-up off, since recovery
 * on the web uses it too; null otherwise.
 *
 * And the caller's `country` and `regionCode` (`requestRegion`), always
 * present, null when unknown.
 */
export const handleAppConfigRequest = async (c: AppContext) => {
  const [minAppVersion, switches, webSignupEnabled, changesOn] =
    await Promise.all([
      resolveAppMinVersion(c.env),
      syncSwitches(c.env),
      webSignupAvailable(c.env),
      isSyncChangesOn(c.env),
    ])
  const enabled =
    switches.enabled && c.env.ACCOUNT_SYNC != null && c.env.ACCOUNTS_DB != null
  const sync = {
    enabled,
    // Whether devices send record changes (witness-work ADR 0060); off, they
    // publish whole snapshots.
    changes: enabled && changesOn,
    // Apps that never send the capability see `supporter`, so they never
    // turn Cloud Sync on by themselves (witness-work ADR 0040 §2).
    entitlement: entitlementForApp(
      switches.entitlement,
      c.req.queries('capabilities')?.flatMap((value) => value.split(','))
    ),
  }
  const webSignup = {
    enabled: webSignupEnabled,
    turnstileSiteKey: turnstileSiteKey(c.env),
  }
  const { country, regionCode } = requestRegion(c.req.raw)
  return c.json(
    minAppVersion
      ? { ok: true, minAppVersion, sync, webSignup, country, regionCode }
      : { ok: true, sync, webSignup, country, regionCode },
    200,
    { 'Cache-Control': 'no-store' }
  )
}
