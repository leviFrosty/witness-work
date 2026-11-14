import type { Environment } from '../types'
import { isTurnstileToken } from './contracts'

/**
 * Cloudflare Turnstile (witness-work `docs/passkeys-protocol.md`, "Web
 * sign-up"): managed widgets, actions `web-signup` and `web-recovery`,
 * verified in the Worker with Siteverify before anything else happens. The
 * request carries the caller's IP (`remoteip`) and an `idempotency_key`, so
 * a retry after a dropped connection can't be counted as a second use.
 *
 * The answer must name the action, and a hostname in `TURNSTILE_HOSTNAMES`:
 * the host of the web app's Turnstile frame (witness-work
 * `docs/web-turnstile.md`), where the widget runs, never the app's own host.
 * Unset, web sign-up and recovery are off (`turnstileConfigured`). Cloudflare's test secrets
 * (`1x…`, `2x…`, `3x…`) answer for a dummy host and action, so a
 * development worker skips those two checks for them (production never
 * does, so a test secret set there passes nothing). A development worker without
 * `TURNSTILE_SECRET_KEY` uses the always-passing test secret; production
 * without it has web sign-up and recovery off.
 *
 * Privacy: never log the token, the secret, or the IP.
 */

export const TURNSTILE_ACTIONS = ['web-signup', 'web-recovery'] as const
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[number]

export const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Cloudflare's always-passing test keys, for development workers. */
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'
export const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA'
const TEST_SECRET_PATTERN = /^[123]x0{31}AA$/

const TIMEOUT_MS = 5_000

export type TurnstileEnv = Pick<
  Environment,
  | 'TURNSTILE_SECRET_KEY'
  | 'TURNSTILE_SITE_KEY'
  | 'TURNSTILE_HOSTNAMES'
  | 'APP_ATTEST_ENVIRONMENT'
>

const isDevelopment = (env: TurnstileEnv) =>
  env.APP_ATTEST_ENVIRONMENT === 'development'

export const turnstileSecret = (env: TurnstileEnv): string | null =>
  env.TURNSTILE_SECRET_KEY?.trim() ||
  (isDevelopment(env) ? TURNSTILE_TEST_SECRET : null)

export const turnstileSiteKey = (env: TurnstileEnv): string | null =>
  env.TURNSTILE_SITE_KEY?.trim() ||
  (isDevelopment(env) ? TURNSTILE_TEST_SITE_KEY : null)

/** Whether this worker skips the host and action checks: a test secret, in development. */
const skipsChecks = (env: TurnstileEnv, secret: string | null): boolean =>
  isDevelopment(env) && secret != null && TEST_SECRET_PATTERN.test(secret)

/**
 * The hostnames a token may be solved on: those of `TURNSTILE_HOSTNAMES`,
 * comma-separated, trimmed and lowercased. An entry with `/` or `:` (an origin,
 * a port, a path) is a config mistake: it's dropped, with an error in the log.
 */
export const turnstileHosts = (env: TurnstileEnv): Set<string> => {
  const hosts = new Set<string>()
  for (const entry of (env.TURNSTILE_HOSTNAMES ?? '').split(',')) {
    const host = entry.trim().toLowerCase()
    if (!host) continue
    if (/[/:]/.test(host)) {
      console.error(
        'accounts: TURNSTILE_HOSTNAMES takes bare hostnames (verify.witnesswork.app), not origins or paths; ignoring an entry',
        { entry: host }
      )
      continue
    }
    hosts.add(host)
  }
  return hosts
}

/**
 * Whether Turnstile is set up: a site key for the web, a secret here, and the
 * hostnames a token may come from. Without any, every token would fail
 * `hostname-mismatch`, so web sign-up and recovery are off instead; only a
 * development worker on a test secret, which skips the host check, needs none.
 */
export const turnstileConfigured = (env: TurnstileEnv): boolean => {
  const secret = turnstileSecret(env)
  if (secret == null || turnstileSiteKey(env) == null) return false
  return skipsChecks(env, secret) || turnstileHosts(env).size > 0
}

export type TurnstileOutcome =
  | { ok: true }
  /** Siteverify refused it: `reason` is its first error code (or ours). */
  | { ok: false; reason: string }
  /** Siteverify couldn't be reached or answered garbage. */
  | { ok: false; unavailable: true }

interface SiteverifyAnswer {
  success?: unknown
  'error-codes'?: unknown
  action?: unknown
  hostname?: unknown
}

const post = async (body: Record<string, string>): Promise<SiteverifyAnswer> => {
  const response = await fetch(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`siteverify ${response.status}`)
  return (await response.json()) as SiteverifyAnswer
}

/**
 * Verifies a Turnstile token for `action`. Tries twice on a network failure
 * with the same `idempotency_key`.
 */
export const verifyTurnstile = async (
  env: TurnstileEnv,
  input: { token: unknown; action: TurnstileAction; remoteip: string | null }
): Promise<TurnstileOutcome> => {
  const secret = turnstileSecret(env)
  if (!secret) return { ok: false, unavailable: true }
  // The routes refuse a token over 2,048 characters as `bad_request` first.
  if (!isTurnstileToken(input.token))
    return { ok: false, reason: 'invalid-input-response' }
  const body: Record<string, string> = {
    secret,
    response: input.token,
    idempotency_key: crypto.randomUUID(),
    ...(input.remoteip ? { remoteip: input.remoteip } : {}),
  }
  let answer: SiteverifyAnswer | null = null
  for (let attempt = 0; attempt < 2 && answer == null; attempt++) {
    try {
      answer = await post(body)
    } catch {
      answer = null
    }
  }
  if (!answer || typeof answer.success !== 'boolean')
    return { ok: false, unavailable: true }
  if (!answer.success) {
    const codes = Array.isArray(answer['error-codes'])
      ? answer['error-codes'].filter((code) => typeof code === 'string')
      : []
    return { ok: false, reason: codes[0] ?? 'unknown' }
  }
  // Cloudflare's test secrets answer `example.com` and no action; only a
  // development worker takes them as they are.
  if (skipsChecks(env, secret)) return { ok: true }
  if (answer.action !== input.action) return { ok: false, reason: 'action-mismatch' }
  if (typeof answer.hostname !== 'string' || !turnstileHosts(env).has(answer.hostname.toLowerCase()))
    return { ok: false, reason: 'hostname-mismatch' }
  return { ok: true }
}
