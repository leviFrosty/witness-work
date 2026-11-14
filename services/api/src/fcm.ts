import { z } from 'zod'
import type { Environment } from './types'
import {
  FIREBASE_MESSAGING_SCOPE,
  forgetGoogleAccessToken,
  getGoogleAccessToken,
} from './googleAuth'

/**
 * Worker → Firebase Cloud Messaging delivery (HTTP v1, OAuth service-account
 * auth). Feature-neutral, like `apns.ts`: callers build each message and decide
 * what to do with each outcome (e.g. deleting devices FCM reports as
 * unregistered).
 *
 * Privacy: registration tokens appear only in Google request bodies. Nothing
 * here logs tokens or payloads.
 */

/**
 * Captured at module evaluation, before Sentry's fetch integration wraps
 * `globalThis.fetch`, so Google requests carry no Sentry trace headers and the
 * OAuth and send calls stay out of Sentry spans.
 */
const uninstrumentedFetch: typeof fetch = globalThis.fetch.bind(globalThis)

/**
 * An FCM registration token. Google doesn't document a format; real ones are
 * about 150 to 200 characters of base64url plus `:`.
 */
export const FCM_TOKEN_PATTERN = /^[A-Za-z0-9_:-]{32,4096}$/

const FCM_HOST = 'https://fcm.googleapis.com'

/** One retry, well inside the 30 s `waitUntil` budget. */
const RETRY_DELAY_MS = 1_000

export type FcmEnv = Pick<Environment, 'FCM_SERVICE_ACCOUNT_JSON'>

export interface FcmDependencies {
  fetch: typeof fetch
  now(): number
  sleep(ms: number): Promise<void>
}

export const defaultFcmDependencies: FcmDependencies = {
  fetch: uninstrumentedFetch,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/** One message to one registration token. */
export interface FcmNotification {
  token: string
  /** The HTTP v1 `message` fields other than `token` (`data`, `android`, …). */
  message: Record<string, unknown>
}

/**
 * - `sent`: FCM accepted it.
 * - `unregistered`: the token is gone (`UNREGISTERED`), belongs to another
 *   project (`SENDER_ID_MISMATCH`), or is not a token at all; stop using it.
 * - `failed`: anything else (network, rejected payload, auth), after one retry
 *   where Google says retrying can help.
 * - `skipped`: the FCM service account is not configured.
 */
export type FcmOutcome = 'sent' | 'unregistered' | 'failed' | 'skipped'

const serviceAccountProjectSchema = z.object({ project_id: z.string().min(1) })

/** Google's error body; only fixed identifiers are read from it. */
const errorBodySchema = z.object({
  error: z.object({
    status: z.string().optional(),
    details: z
      .array(
        z
          .object({
            errorCode: z.string().optional(),
            fieldViolations: z
              .array(z.object({ field: z.string().optional() }).passthrough())
              .optional(),
          })
          .passthrough()
      )
      .optional(),
  }),
})

let warnedMissingConfig = false

/** Clears the log-once flag (tests only). */
export const resetFcmState = (): void => {
  warnedMissingConfig = false
}

const readProject = (json: string): string | null => {
  try {
    const parsed = serviceAccountProjectSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data.project_id : null
  } catch {
    return null
  }
}

/**
 * `unauthorized`: the access token was rejected; mint a new one and resend.
 * `retryable`: network error, 429, or 5xx; Google asks senders to retry these.
 */
type SendResult =
  | 'sent'
  | 'unregistered'
  | 'failed'
  | 'unauthorized'
  | 'retryable'

/** `errorCode` from Google's FcmError detail, plus whether the token field was rejected. */
const readError = async (
  response: Response
): Promise<{ code: string; badToken: boolean }> => {
  try {
    const parsed = errorBodySchema.safeParse(await response.json())
    if (!parsed.success) return { code: 'unknown', badToken: false }
    const details = parsed.data.error.details ?? []
    const code =
      details.find((detail) => detail.errorCode)?.errorCode ??
      parsed.data.error.status ??
      'unknown'
    const badToken = details.some((detail) =>
      detail.fieldViolations?.some(
        (violation) => violation.field === 'message.token'
      )
    )
    return {
      code: /^[A-Z_]{1,64}$/.test(code) ? code : 'unknown',
      badToken,
    }
  } catch {
    return { code: 'unknown', badToken: false }
  }
}

/** On the `final` attempt, `retryable` becomes a logged `failed`. */
const send = async (
  deps: FcmDependencies,
  project: string,
  accessToken: string,
  notification: FcmNotification,
  final: boolean
): Promise<SendResult> => {
  let response: Response
  try {
    response = await deps.fetch(
      `${FCM_HOST}/v1/projects/${encodeURIComponent(project)}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: { ...notification.message, token: notification.token },
        }),
      }
    )
  } catch {
    if (!final) return 'retryable'
    console.warn('fcm: request failed')
    return 'failed'
  }
  if (response.ok) {
    await response.body?.cancel()
    return 'sent'
  }
  const { code, badToken } = await readError(response)
  if (
    code === 'UNREGISTERED' ||
    code === 'SENDER_ID_MISMATCH' ||
    (response.status === 400 && badToken)
  ) {
    return 'unregistered'
  }
  if (response.status === 401) return 'unauthorized'
  if (!final && (response.status === 429 || response.status >= 500))
    return 'retryable'
  console.warn('fcm: rejected a message', { status: response.status, code })
  return 'failed'
}

/**
 * Sends each notification and returns one outcome per input, in order.
 * Network errors, 429, 5xx, and a rejected access token get one retry (with a
 * newly minted token for the latter). Never throws, so it is safe to run in
 * `waitUntil`.
 */
export const sendFcmNotifications = async (
  env: FcmEnv,
  notifications: FcmNotification[],
  deps: FcmDependencies = defaultFcmDependencies
): Promise<FcmOutcome[]> => {
  if (!notifications.length) return []

  const serviceAccount = env.FCM_SERVICE_ACCOUNT_JSON?.trim()
  const project = serviceAccount ? readProject(serviceAccount) : null
  if (!serviceAccount || !project) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true
      console.warn('fcm: not configured; skipping messages')
    }
    return notifications.map(() => 'skipped')
  }

  const mint = async (): Promise<string | null> => {
    try {
      return await getGoogleAccessToken(
        serviceAccount,
        FIREBASE_MESSAGING_SCOPE,
        deps
      )
    } catch {
      console.error('fcm: could not get an access token')
      return null
    }
  }
  const outcomes = (results: SendResult[]): FcmOutcome[] =>
    results.map((result) =>
      result === 'sent' || result === 'unregistered' ? result : 'failed'
    )
  const sendAll = (
    accessToken: string,
    batch: FcmNotification[],
    final: boolean
  ): Promise<SendResult[]> =>
    Promise.all(
      batch.map((notification) =>
        send(deps, project, accessToken, notification, final).catch(
          (): SendResult => {
            console.warn('fcm: request failed')
            return 'failed'
          }
        )
      )
    )

  let accessToken = await mint()
  if (!accessToken) return notifications.map(() => 'failed')

  const results = await sendAll(accessToken, notifications, false)
  const retry = results.flatMap((result, index) =>
    result === 'unauthorized' || result === 'retryable' ? [index] : []
  )
  if (!retry.length) return outcomes(results)

  if (results.includes('retryable')) await deps.sleep(RETRY_DELAY_MS)
  if (results.includes('unauthorized')) {
    forgetGoogleAccessToken(serviceAccount, FIREBASE_MESSAGING_SCOPE, accessToken)
    accessToken = await mint()
    if (!accessToken) return outcomes(results)
  }

  const retried = await sendAll(
    accessToken,
    retry.map((index) => notifications[index]),
    true
  )
  retry.forEach((index, position) => {
    results[index] = retried[position]
  })
  if (retried.includes('unauthorized')) {
    console.warn('fcm: access token rejected after minting a new one')
    forgetGoogleAccessToken(serviceAccount, FIREBASE_MESSAGING_SCOPE, accessToken)
  }
  return outcomes(results)
}
