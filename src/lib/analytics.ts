import { posthogClient as client } from '@/lib/posthogClient'
import { logger } from '@/lib/logger'
import type { AnalyticsEventName } from '@/lib/analyticsEvents'
import { analyticsEventsAllowed } from '@/lib/analyticsPolicy'
import { resetAnalyticsFrequency } from '@/lib/analyticsFrequency'

export const surveyClient = client

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

let screenSessionId: string | undefined
const screensSentThisSession = new Set<string>()

export const analytics = {
  capture(event: AnalyticsEventName, properties?: AnalyticsProperties): void {
    safely(`capture "${event}"`, () =>
      client?.capture(event, definedProperties(properties))
    )
  },
  screen(name: string, properties?: AnalyticsProperties): void {
    safely(`screen "${name}"`, () => {
      if (!analyticsEventsAllowed()) return
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

  async flush(timeoutMs = 1500): Promise<void> {
    if (!client) return
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        client.flush(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs)
        }),
      ])
    } catch (error) {
      logger.debug('[Analytics] flush failed', error)
    } finally {
      clearTimeout(timer)
    }
  },

  reset(): void {
    safely('reset', () => {
      screenSessionId = undefined
      screensSentThisSession.clear()
      resetAnalyticsFrequency()
      logger.debug('[Analytics] Resetting identity')
      return client?.reset()
    })
  },
}
