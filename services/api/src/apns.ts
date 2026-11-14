import { z } from 'zod'
import type { Environment } from './types'
import { importEs256PrivateKey, signEs256Jwt } from './crypto'

/**
 * Worker → APNs delivery (HTTP/2, ES256 provider-token auth). Feature-neutral:
 * callers build the payload and decide what to do with each outcome (e.g.
 * deleting devices APNs reports as unregistered).
 *
 * Privacy: device tokens appear only in the Apple request URL. Nothing here
 * logs tokens or payloads.
 */

/**
 * Captured at module evaluation, before Sentry's fetch integration wraps
 * `globalThis.fetch` on the first request. The wrapped fetch records each
 * request URL (which carries the device token) as a span and breadcrumb, and
 * adds Sentry trace headers to the Apple request.
 */
const uninstrumentedFetch: typeof fetch = globalThis.fetch.bind(globalThis)

export type ApnsEnvironment = 'sandbox' | 'production'

/** Hex device token as returned by iOS (32 bytes today; Apple allows longer). */
export const APNS_DEVICE_TOKEN_PATTERN = /^(?:[0-9A-Fa-f]{2}){16,128}$/

export const APNS_HOSTS: Record<ApnsEnvironment, string> = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
}

/** One retry, well inside the 30 s `waitUntil` budget. */
const RETRY_DELAY_MS = 1_000

/** Apple: refresh no more than every 20 minutes and no less than every 60. */
const TOKEN_MAX_AGE_SECONDS = 45 * 60
const TOKEN_KV_KEY = 'apns:provider-token'

export type ApnsEnv = Pick<
  Environment,
  'APNS_KEY_ID' | 'APNS_PRIVATE_KEY' | 'APPLE_TEAM_ID' | 'IOS_BUNDLE_ID'
> & { NOTES_KV: Pick<KVNamespace, 'get' | 'put' | 'delete'> }

export interface ApnsDependencies {
  fetch: typeof fetch
  now(): number
  sleep(ms: number): Promise<void>
}

export const defaultApnsDependencies: ApnsDependencies = {
  fetch: uninstrumentedFetch,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export interface ApnsDevice {
  token: string
  environment: ApnsEnvironment
  /** The app's bundle id; `IOS_BUNDLE_ID` when absent. */
  topic?: string
}

/** One alert to one device. `payload` is the full APNs JSON body (`aps` + custom keys). */
export interface ApnsNotification {
  device: ApnsDevice
  payload: Record<string, unknown>
}

/**
 * - `sent`: APNs accepted it.
 * - `unregistered`: the token is gone (410) or `BadDeviceToken`; stop using it.
 * - `failed`: anything else (network, rejected payload, auth), after one retry
 *   where Apple says retrying can help.
 * - `skipped`: APNs secrets are not configured.
 */
export type ApnsOutcome = 'sent' | 'unregistered' | 'failed' | 'skipped'

interface ApnsConfig {
  keyId: string
  teamId: string
  privateKey: string
  topic: string
}

const providerTokenSchema = z.object({
  token: z.string(),
  keyId: z.string(),
  teamId: z.string(),
  /** Seconds since the epoch (the JWT `iat`). */
  issuedAt: z.number(),
})

type ProviderToken = z.infer<typeof providerTokenSchema>

let memoryToken: ProviderToken | null = null
let warnedMissingConfig = false

/** Clears the isolate-level token cache and log-once flag (tests only). */
export const resetApnsState = (): void => {
  memoryToken = null
  warnedMissingConfig = false
}

const readConfig = (env: ApnsEnv): ApnsConfig | null => {
  const keyId = env.APNS_KEY_ID?.trim()
  const privateKey = env.APNS_PRIVATE_KEY?.trim()
  const teamId = env.APPLE_TEAM_ID?.trim()
  const topic = env.IOS_BUNDLE_ID?.trim()
  return keyId && privateKey && teamId && topic
    ? { keyId, privateKey, teamId, topic }
    : null
}

/** ES256 JWT: header `{alg, kid}`, claims `{iss, iat}`, P1363 signature. */
export const createProviderToken = async (
  config: Pick<ApnsConfig, 'keyId' | 'teamId' | 'privateKey'>,
  issuedAt: number
): Promise<string> =>
  signEs256Jwt(
    await importEs256PrivateKey(config.privateKey),
    { kid: config.keyId },
    { iss: config.teamId, iat: issuedAt }
  )

const parseStoredToken = (raw: string | null): ProviderToken | null => {
  if (!raw) return null
  try {
    const result = providerTokenSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** Memory, then KV (shared across isolates), then a freshly signed token. */
const providerToken = async (
  config: ApnsConfig,
  kv: ApnsEnv['NOTES_KV'],
  nowMs: number
): Promise<string> => {
  const now = Math.floor(nowMs / 1000)
  const usable = (
    candidate: ProviderToken | null
  ): candidate is ProviderToken =>
    candidate != null &&
    candidate.keyId === config.keyId &&
    candidate.teamId === config.teamId &&
    candidate.issuedAt <= now + 60 &&
    now - candidate.issuedAt < TOKEN_MAX_AGE_SECONDS

  if (usable(memoryToken)) return memoryToken.token

  try {
    const stored = parseStoredToken(await kv.get(TOKEN_KV_KEY))
    if (usable(stored)) {
      memoryToken = stored
      return stored.token
    }
  } catch {
    console.warn('apns: provider token cache read failed')
  }

  const token = await createProviderToken(config, now)
  memoryToken = {
    token,
    keyId: config.keyId,
    teamId: config.teamId,
    issuedAt: now,
  }
  try {
    await kv.put(TOKEN_KV_KEY, JSON.stringify(memoryToken), {
      expirationTtl: TOKEN_MAX_AGE_SECONDS,
    })
  } catch {
    console.warn('apns: provider token cache write failed')
  }
  return token
}

/** Drops a token APNs rejected so the next push signs a new one. */
const forgetProviderToken = async (
  kv: ApnsEnv['NOTES_KV'],
  token: string
): Promise<void> => {
  if (memoryToken?.token === token) memoryToken = null
  try {
    if (parseStoredToken(await kv.get(TOKEN_KV_KEY))?.token === token) {
      await kv.delete(TOKEN_KV_KEY)
    }
  } catch {
    console.warn('apns: provider token cache cleanup failed')
  }
}

/**
 * `unauthorized`: the provider token was rejected; re-sign and resend.
 * `retryable`: network error, 429, or 5xx; Apple asks senders to retry these.
 */
type SendResult =
  | 'sent'
  | 'unregistered'
  | 'failed'
  | 'unauthorized'
  | 'retryable'

interface Attempt {
  notification: ApnsNotification
  /**
   * Stable across the retry, so if Apple did accept the first attempt the
   * device replaces that alert instead of showing a duplicate.
   */
  collapseId: string
}

/** Apple's `reason` values are fixed identifiers; anything else is not logged. */
const readReason = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { reason?: unknown }
    return typeof body.reason === 'string' &&
      /^[A-Za-z]{1,64}$/.test(body.reason)
      ? body.reason
      : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** On the `final` attempt, `retryable` becomes a logged `failed`. */
const send = async (
  deps: ApnsDependencies,
  config: ApnsConfig,
  token: string,
  { notification, collapseId }: Attempt,
  final: boolean
): Promise<SendResult> => {
  const { device, payload } = notification
  let response: Response
  try {
    response = await deps.fetch(
      `${APNS_HOSTS[device.environment]}/3/device/${device.token}`,
      {
        method: 'POST',
        headers: {
          authorization: `bearer ${token}`,
          'apns-topic': device.topic ?? config.topic,
          'apns-push-type': 'alert',
          'apns-collapse-id': collapseId,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )
  } catch {
    if (!final) return 'retryable'
    console.warn('apns: request failed')
    return 'failed'
  }
  if (response.ok) {
    await response.body?.cancel()
    return 'sent'
  }
  const reason = await readReason(response)
  if (response.status === 410 || reason === 'BadDeviceToken')
    return 'unregistered'
  if (
    response.status === 403 &&
    (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken')
  ) {
    return 'unauthorized'
  }
  if (!final && (response.status === 429 || response.status >= 500))
    return 'retryable'
  console.warn('apns: rejected a push', { status: response.status, reason })
  return 'failed'
}

const sendAll = (
  deps: ApnsDependencies,
  config: ApnsConfig,
  token: string,
  attempts: Attempt[],
  final: boolean
): Promise<SendResult[]> =>
  Promise.all(
    attempts.map((attempt) =>
      send(deps, config, token, attempt, final).catch((): SendResult => {
        console.warn('apns: request failed')
        return 'failed'
      })
    )
  )

/**
 * Sends each notification and returns one outcome per input, in order.
 * Network errors, 429, 5xx, and a rejected provider token get one retry (with
 * a freshly signed token for the latter). Never throws, so it is safe to run
 * in `waitUntil`.
 */
export const sendApnsNotifications = async (
  env: ApnsEnv,
  notifications: ApnsNotification[],
  deps: ApnsDependencies = defaultApnsDependencies
): Promise<ApnsOutcome[]> => {
  if (!notifications.length) return []

  const config = readConfig(env)
  if (!config) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true
      console.warn('apns: not configured; skipping pushes')
    }
    return notifications.map(() => 'skipped')
  }

  const sign = async (): Promise<string | null> => {
    try {
      return await providerToken(config, env.NOTES_KV, deps.now())
    } catch {
      console.error('apns: could not sign a provider token')
      return null
    }
  }
  const outcomes = (results: SendResult[]): ApnsOutcome[] =>
    results.map((result) =>
      result === 'sent' || result === 'unregistered' ? result : 'failed'
    )

  let token = await sign()
  if (!token) return notifications.map(() => 'failed')

  const attempts = notifications.map((notification) => ({
    notification,
    collapseId: crypto.randomUUID(),
  }))
  const results = await sendAll(deps, config, token, attempts, false)

  const retry = results.flatMap((result, index) =>
    result === 'unauthorized' || result === 'retryable' ? [index] : []
  )
  if (!retry.length) return outcomes(results)

  if (results.includes('retryable')) await deps.sleep(RETRY_DELAY_MS)
  if (results.includes('unauthorized')) {
    await forgetProviderToken(env.NOTES_KV, token)
    token = await sign()
    if (!token) return outcomes(results)
  }

  const retried = await sendAll(
    deps,
    config,
    token,
    retry.map((index) => attempts[index]),
    true
  )
  retry.forEach((index, position) => {
    results[index] = retried[position]
  })
  if (retried.includes('unauthorized')) {
    console.warn('apns: provider token rejected after re-signing')
    await forgetProviderToken(env.NOTES_KV, token)
  }
  return outcomes(results)
}
