import { sha256Hex } from './crypto'
import type { Environment } from './types'

/**
 * Worker → PostHog server-side capture. Feature-neutral: callers build each
 * event and decide when to send it. Off unless `POSTHOG_PROJECT_TOKEN` is set.
 *
 * Privacy: events are anonymous. No person profiles, no GeoIP, and the
 * distinct id is a one-way hash of an internal identity
 * ({@link analyticsDistinctId}), never the identity itself. Properties are
 * structural only (counts, booleans, bounded enums): never notes text, model
 * output, names, ids, or tokens. Delivery is best-effort and never throws.
 */

/**
 * Captured at module evaluation, before Sentry's fetch integration wraps
 * `globalThis.fetch`, so capture calls stay out of Sentry spans.
 */
const uninstrumentedFetch: typeof fetch = globalThis.fetch.bind(globalThis)

const DEFAULT_HOST = 'https://us.i.posthog.com'

/** Analytics must never hold a request or a Durable Object open for long. */
const CAPTURE_TIMEOUT_MS = 2_000

export type AnalyticsEnv = Pick<
  Environment,
  'POSTHOG_PROJECT_TOKEN' | 'POSTHOG_HOST' | 'APP_ATTEST_ENVIRONMENT'
>

export type AnalyticsValue = string | number | boolean | null

export interface AnalyticsEvent {
  event: string
  distinctId: string
  properties: Record<string, AnalyticsValue>
}

export interface AnalyticsDependencies {
  fetch: typeof fetch
  now(): number
}

const defaultDependencies: AnalyticsDependencies = {
  fetch: uninstrumentedFetch,
  now: () => Date.now(),
}

export const analyticsEnabled = (env: AnalyticsEnv): boolean =>
  !!env.POSTHOG_PROJECT_TOKEN?.trim()

/**
 * Stable anonymous distinct id for an internal identity (e.g. the Notes Import
 * meter id). Unique-user counts and retention work on it; it can't be reversed
 * or joined to the app's own anonymous PostHog ids.
 */
export const analyticsDistinctId = async (identity: string): Promise<string> =>
  `ww_${(await sha256Hex(`ww-api:analytics:${identity}`)).slice(0, 32)}`

/** Send one event. Resolves (never rejects) once PostHog answers or gives up. */
export async function captureAnalyticsEvent(
  env: AnalyticsEnv,
  event: AnalyticsEvent,
  deps: AnalyticsDependencies = defaultDependencies
): Promise<void> {
  const token = env.POSTHOG_PROJECT_TOKEN?.trim()
  if (!token) return
  const host = (env.POSTHOG_HOST?.trim() || DEFAULT_HOST).replace(/\/+$/, '')
  try {
    const response = await deps.fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: token,
        event: event.event,
        distinct_id: event.distinctId,
        timestamp: new Date(deps.now()).toISOString(),
        properties: {
          ...event.properties,
          environment: env.APP_ATTEST_ENVIRONMENT,
          $lib: 'ww-api',
          $process_person_profile: false,
          $geoip_disable: true,
        },
      }),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.warn('analytics: capture rejected', response.status)
    }
  } catch (e) {
    console.warn('analytics: capture failed', e instanceof Error ? e.name : 'unknown')
  }
}
