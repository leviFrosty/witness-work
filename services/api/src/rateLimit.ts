import type { MiddlewareHandler } from 'hono'
import type { Environment } from './types'
import { apiError } from './errors'

/**
 * Per-IP limits for the public routes outside Buddies (which has its own
 * tiers in src/buddies/limits.ts).
 *
 * One `RATE_LIMITER` binding (60 requests per 60 s in wrangler.toml), but each
 * route family counts in its own bucket: the key is `<family>:<client IP>`.
 * Before, every family shared one bucket per IP, so on congregation Wi-Fi or
 * carrier NAT a few people searching addresses could lock everyone behind
 * that IP out of Notes Import, and the reverse.
 *
 * What it still guards: no family gets more than it had (60/min per IP), so
 * the cost ceiling per IP for any one upstream (HERE place search, OpenRouter,
 * HERE routing) is unchanged; only the families no longer starve each other.
 * Address search, geocoding, and point-of-interest search stay in one
 * `places` bucket because all three spend HERE transactions. Behind each
 * family sit stronger, identity-keyed limits (Notes Import: App Attest or
 * Play Integrity, allowances, the concurrency cap; Scribe AI: the per-account
 * usage windows and active-step cap; attestation: the per-install challenge
 * cap; route planning and MapKit JS tokens: the per-account quota), which a
 * client-supplied install or account id can't replace here: before those
 * checks it is unauthenticated, so keying on it
 * would let one caller mint fresh buckets at will. The attestation routes'
 * old `/notes-import/*` paths still count in `notes-import`.
 */

/** The binding's window (`[ratelimits.simple] period`), so the longest wait. */
export const RATE_LIMIT_PERIOD_SECONDS = 60

export type RateLimitFamily =
  | 'places'
  | 'notes-import'
  | 'attestation'
  | 'route-planning'
  | 'admin'
  | 'app'
  | 'scribe'
  | 'maps'

/** The bucket key for one family and caller. */
export const rateLimitKey = (
  family: RateLimitFamily,
  clientIp: string | undefined
): string => `${family}:${clientIp || 'unknown'}`

/**
 * Counts the request against its family's per-IP bucket. Refusals are 429
 * `rate_limited` with `Retry-After` set to the limiter's window: the binding
 * doesn't say when its window ends, so that's the longest the caller waits.
 */
export const rateLimit =
  (
    family: RateLimitFamily,
    /** Paths under the family's prefix that count elsewhere instead. */
    except: readonly string[] = []
  ): MiddlewareHandler<{ Bindings: Environment }> =>
  async (context, next) => {
    if (except.includes(context.req.path)) return next()
    const key = rateLimitKey(family, context.req.header('CF-Connecting-IP'))
    const { success } = await context.env.RATE_LIMITER.limit({ key })
    if (!success) {
      return apiError(429, 'rate_limited', {
        retryAfter: RATE_LIMIT_PERIOD_SECONDS,
      })
    }
    await next()
  }
