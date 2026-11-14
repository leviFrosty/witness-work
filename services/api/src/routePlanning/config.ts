import type { Environment } from '../types'
import { timingSafeEqual } from '../crypto'

export const ROUTE_PLANNING_LIMITS = {
  /**
   * Stops per optimization, not counting the start. Matches the app's cap, so
   * one Google Maps link (9 waypoints + destination) carries the whole route.
   */
  maxStops: 10,
  /** Optimizations per account in any rolling 24 hours. */
  dailyLimit: 10,
  /** Optimizations per account in any rolling minute. */
  minuteLimit: 3,
  /** A full request (account id + 11 coordinate pairs) is well under 1 KB. */
  maxBodyBytes: 4096,
  /** HERE answers a 10-stop sequence in well under a second. */
  hereTimeoutMs: 15_000,
  /**
   * Points per directions request: the start, every stop, and a finish
   * elsewhere.
   */
  maxDirectionsPoints: 12,
  /**
   * Directions per account in any rolling 24 hours. The app asks again only
   * when a leg it hasn't seen appears (a stop added, moved, or a new start), so
   * a day of planning uses a few dozen.
   */
  directionsDailyLimit: 100,
  /** Directions per account in any rolling minute. */
  directionsMinuteLimit: 10,
} as const

export const ROUTE_PLANNING_ENABLED_KEY = 'route-planning:enabled'
const CACHE_TTL_SECONDS = 60

/**
 * Route planning is on unless KV `route-planning:enabled` is `"false"`. The read
 * is edge-cached for 60 seconds. A failed read leaves it on: the per-account
 * limits still bound spend.
 */
export const isRoutePlanningEnabled = async (env: {
  NOTES_KV: Pick<KVNamespace, 'get'>
}): Promise<boolean> => {
  try {
    const value = await env.NOTES_KV.get(ROUTE_PLANNING_ENABLED_KEY, {
      cacheTtl: CACHE_TTL_SECONDS,
    })
    return value?.trim() !== 'false'
  } catch {
    console.warn('route-planning: kill-switch KV read failed; staying on')
    return true
  }
}

/**
 * The simulator and dev builds can't hold a real Supporter entitlement, so a
 * local development worker accepts the shared `x-ww-dev-bypass` token in
 * place of the RevenueCat check. Beta and production never do, even if the
 * token is set.
 */
export const isRouteDevBypass = (
  env: Pick<
    Environment,
    'APP_ATTEST_ENVIRONMENT' | 'NOTES_IMPORT_DEV_BYPASS_TOKEN'
  >,
  header: string | undefined
): boolean => {
  if (env.APP_ATTEST_ENVIRONMENT !== 'development') return false
  const token = env.NOTES_IMPORT_DEV_BYPASS_TOKEN?.trim()
  return !!token && !!header && timingSafeEqual(header, token)
}
