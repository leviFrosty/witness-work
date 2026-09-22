import { posthogClient as client } from '@/lib/posthogClient'
import { logger } from '@/lib/logger'

// Surveys use the SDK's renderer and response contract, separate from ordinary
// structural analytics. Reuse this instance so responses have the same identity.
export const surveyClient = client

// Feature code depends only on this provider-neutral contract. Keep event payloads
// structural: no names, notes, addresses, imported text, or raw error messages.
// Events are anonymous: the provider never creates person profiles and the app
// never identifies a user. The user can turn usage events off in Settings
// (`analyticsEnabled`, per device); the provider's before_send hook enforces it
// for every event, including the SDK's own lifecycle events. Crash reports,
// feature flags, and surveys keep working with analytics off.
export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>

function safely(operation: string, send: () => unknown): void {
  try {
    if (!client) {
      logger.debug(`[Analytics] Skipping ${operation}: client unavailable`)
      return
    }
    const result = send()
    if (result instanceof Promise) {
      void result.catch((error: unknown) => {
        logger.debug(`[Analytics] ${operation} failed`, error)
      })
    }
  } catch (error) {
    // Analytics must never interrupt a user's action.
    logger.debug(`[Analytics] ${operation} failed`, error)
  }
}

function definedProperties(properties?: AnalyticsProperties) {
  if (!properties) return undefined
  const result: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) result[key] = value
  }
  return result
}

// Screen views are the largest event by volume, mostly tab switches. Send each
// route once per session: screen reach, DAU and retention stay exact, but
// repeat visits within a session are not counted.
let screenSessionId: string | undefined
const screensSentThisSession = new Set<string>()

export const analytics = {
  capture(event: string, properties?: AnalyticsProperties): void {
    safely(`capture "${event}"`, () =>
      client?.capture(event, definedProperties(properties))
    )
  },
  screen(name: string, properties?: AnalyticsProperties): void {
    safely(`screen "${name}"`, () => {
      const sessionId = client?.getSessionId()
      if (sessionId !== screenSessionId) {
        screenSessionId = sessionId
        screensSentThisSession.clear()
      }
      if (screensSentThisSession.has(name)) return
      screensSentThisSession.add(name)
      return client?.screen(name, definedProperties(properties))
    })
  },
  /**
   * Clears the provider's random on-device identifier. Only the analytics
   * identity is affected; the RevenueCat customer and the account ID are
   * separate and untouched. Discards pending usage events and preserves survey
   * history and the SDK's normal retained properties.
   */
  reset(): void {
    safely('reset', () => {
      logger.debug('[Analytics] Resetting identity')
      return client?.reset()
    })
  },
}
