import Constants from 'expo-constants'
import type PostHog from 'posthog-react-native'
import { AnonymousPostHog } from '@/lib/anonymousPostHog'
import { logger } from '@/lib/logger'
import {
  errorTrackingEnabled,
  getErrorContext,
  shouldIgnoreExceptionProperties,
} from '@/lib/errorTrackingPolicy'
import { scrubAnalyticsEventProperties } from '@/lib/shareLinkScrub'
import {
  analyticsEventAllowed,
  isAnalyticsEvent,
  setAnalyticsProduction,
} from '@/lib/analyticsPolicy'
import { allowAnalyticsFrequency } from '@/lib/analyticsFrequency'

const extra = Constants.expoConfig?.extra as
  | { posthogProjectToken?: string; posthogHost?: string; appVariant?: string }
  | undefined
const projectToken = extra?.posthogProjectToken
const host = extra?.posthogHost

function createClient(): PostHog | null {
  setAnalyticsProduction(
    extra?.appVariant === 'production' &&
      (typeof __DEV__ === 'undefined' || !__DEV__)
  )
  if (!projectToken || !host) {
    logger.debug('[Analytics] Disabled: missing configuration', {
      hasProjectToken: Boolean(projectToken),
      hasHost: Boolean(host),
    })
    return null
  }
  try {
    const client = new AnonymousPostHog(projectToken, {
      host,

      personProfiles: 'never',

      preloadFeatureFlags: false,
      captureAppLifecycleEvents: true,

      capturePushNotificationSubscriptions: false,
      capturePushNotificationOpened: false,
      errorTracking: {
        exceptionSteps: { enabled: errorTrackingEnabled, maxBytes: 32768 },
        autocapture: {
          uncaughtExceptions: errorTrackingEnabled,
          unhandledRejections: errorTrackingEnabled,

          console: false,
          nativeCrashes: errorTrackingEnabled,
        },
      },
      before_send: (event) => {
        if (!event) return event

        if (!analyticsEventAllowed(event.event, event.properties)) return null
        if (isAnalyticsEvent(event.event)) {
          if (!allowAnalyticsFrequency(event.event, event.properties))
            return null
        }
        const isException = event.event === '$exception'
        if (
          isException &&
          (!errorTrackingEnabled ||
            shouldIgnoreExceptionProperties(event.properties ?? {}))
        ) {
          logger.debug('[Analytics] Skipping $exception', {
            reason: errorTrackingEnabled
              ? 'ignored exception'
              : 'error tracking disabled in development',
          })
          return null
        }
        return {
          ...event,
          properties: scrubAnalyticsEventProperties(event.event, {
            ...(isException ? getErrorContext() : {}),
            ...event.properties,
            app_variant: extra?.appVariant ?? 'unknown',
            development_mode: typeof __DEV__ !== 'undefined' && __DEV__,
          }),
        }
      },
    })

    client.debug(logger.isEnabled())
    if (logger.isEnabled()) {
      logger.debug('[Analytics] Initializing PostHog', {
        host,
        appVariant: extra?.appVariant ?? 'unknown',
        errorTrackingEnabled,
      })
      void client
        .ready()
        .then(() => {
          logger.debug(
            client.optedOut
              ? '[Analytics] Disabled: SDK opted out'
              : '[Analytics] Enabled',
            {
              optedOut: client.optedOut,
            }
          )
        })
        .catch((error: unknown) => {
          logger.debug('[Analytics] Initialization failed', error)
        })
    }
    return client
  } catch (error) {
    logger.debug('[Analytics] Disabled: initialization failed', error)
    return null
  }
}

export const posthogClient = createClient()
