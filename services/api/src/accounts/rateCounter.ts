import type { AppContext, Environment } from '../types'
import { bytesToBase64Url } from '../crypto'
import { captureFailure } from '../sentry'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import { logLimitHit } from '../buddies/limits'
import { derivedHmacKey, MIN_TOKEN_SECRET_CHARS } from './tokens'
import type { CounterLimit } from './rateCounterDO'

/**
 * Names for the accounts routes' rolling counters
 * (src/accounts/rateCounterDO.ts): the object a count lives in and its keys
 * are HMAC-SHA256s of what they count (a caller's IP or network) under a key
 * from `ACCOUNT_TICKET_SECRET`, never a plain hash, which anyone could
 * compute for every IPv4 address. Derived from the secret alone, so a count
 * is found again by every isolate and after a restart; rotating the secret
 * starts every count over.
 *
 * Privacy: names never reach logs; the values they're made from never leave
 * the Worker.
 */

const encoder = new TextEncoder()

/**
 * The name of what `label` counts for `value` (`passkey-assert-failures`
 * and an IP, say). `scope` keeps keys apart that rotate (`web-caps/<day>`)
 * from those that don't. Throws without a usable secret; the routes that
 * count answer `disabled` before they get here.
 */
export const counterName = async (
  env: Pick<Environment, 'ACCOUNT_TICKET_SECRET'>,
  label: string,
  value: string,
  scope = 'names'
): Promise<string> => {
  const secret = env.ACCOUNT_TICKET_SECRET?.trim()
  if (!secret || secret.length < MIN_TOKEN_SECRET_CHARS)
    throw new Error('accounts: ACCOUNT_TICKET_SECRET is not configured')
  const key = await derivedHmacKey(`ww-account/v1/rate-counter/${scope}`, secret)
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${label}\n${value}`)
  )
  return bytesToBase64Url(new Uint8Array(mac))
}

/** The counter object named `name`. */
export const rateCounter = (
  env: Pick<Environment, 'ACCOUNT_RATE_COUNTER'>,
  name: string
) => env.ACCOUNT_RATE_COUNTER.get(env.ACCOUNT_RATE_COUNTER.idFromName(name))

/** How `refuseOverRateCounter` uses the counter. */
export interface RateCounterUse {
  /** The name `limit hit` logs under (`failuresPerHour`, `webCaps`, …). */
  limitName: string
  /** Count this request (`take`, all or nothing), or only check (`peek`). */
  count?: boolean
  /**
   * An unreachable counter lets the request on (`allow`, the default), or
   * refuses it with 503 `unavailable` and `Retry-After` (`refuse`).
   */
  onOutage?: 'allow' | 'refuse'
  /** The time the counts are at (a later refund passes the same). */
  now?: number
}

/** `Retry-After` when the counter can't be reached and the use refuses. */
const OUTAGE_RETRY_SECONDS = 30

/**
 * Checks (or counts) `limits` in the counter named `name` for `op`. Null
 * admits; over a limit it's 429 `rate_limited` with a `Retry-After` never
 * past the window.
 *
 * Privacy: logs name the op and limit only, never the name or its value.
 */
export const refuseOverRateCounter = async (
  c: AppContext,
  name: string,
  limits: CounterLimit[],
  op: string,
  { limitName, count = false, onOutage = 'allow', now = Date.now() }: RateCounterUse
): Promise<Response | null> => {
  try {
    const counter = rateCounter(c.env, name)
    const result = count
      ? await counter.take(now, limits)
      : await counter.peek(now, limits)
    if (result.ok) return null
    logLimitHit(op, limitName)
    return buddiesErrorResponse('rate_limited', {
      retryAfterSeconds: result.retryAfterSeconds,
    })
  } catch (error) {
    console.warn(
      `accounts: rate counter unavailable; ${onOutage === 'allow' ? 'allowing' : 'refusing'}`,
      { op }
    )
    captureFailure(error, `${op} rate counter`)
    return onOutage === 'allow'
      ? null
      : buddiesErrorResponse('unavailable', { retryAfterSeconds: OUTAGE_RETRY_SECONDS })
  }
}
