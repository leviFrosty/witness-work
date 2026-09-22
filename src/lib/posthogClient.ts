import Constants from 'expo-constants'
import type PostHog from 'posthog-react-native'
import { AnonymousPostHog } from '@/lib/anonymousPostHog'
import { logger } from '@/lib/logger'
import {
  errorTrackingEnabled,
  getErrorContext,
  shouldIgnoreExceptionProperties,
} from '@/lib/errorTrackingPolicy'
import { scrubShareLinkProperties } from '@/lib/shareLinkScrub'
import { analyticsEventsAllowed, isAnalyticsEvent } from '@/lib/analyticsPolicy'

const extra = Constants.expoConfig?.extra as
  | { posthogProjectToken?: string; posthogHost?: string; appVariant?: string }
  | undefined
const projectToken = extra?.posthogProjectToken
const host = extra?.posthogHost

function createClient(): PostHog | null {
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
      // Anonymous usage statistics only: never create person profiles, so
      // identify/alias/group are no-ops and events are not linked to a person.
      personProfiles: 'never',
      captureAppLifecycleEvents: true,
      // The native plugin supplies crash capture; push analytics stay opt-in.
      capturePushNotificationSubscriptions: false,
      capturePushNotificationOpened: false,
      errorTracking: {
        exceptionSteps: { enabled: errorTrackingEnabled, maxBytes: 32768 },
        autocapture: {
          uncaughtExceptions: errorTrackingEnabled,
          unhandledRejections: errorTrackingEnabled,
          // Handled failures are explicitly reported after logging. Capturing
          // console.error too would count those failures twice.
          console: false,
          nativeCrashes: errorTrackingEnabled,
        },
      },
      before_send: (event) => {
        if (!event) return event
        // Lifecycle capture has no per-event switch; nothing uses this one.
        if (event.event === 'Application Backgrounded') return null
        // The user's analytics switch. Crash reports and survey responses pass;
        // feature flag requests do not go through here and are unaffected.
        if (isAnalyticsEvent(event.event) && !analyticsEventsAllowed()) {
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
          // `Application Opened` records the launch URL, which for a share
          // link carries contact data or an invite secret.
          properties: scrubShareLinkProperties({
            ...(isException ? getErrorContext() : {}),
            ...event.properties,
            app_variant: extra?.appVariant ?? 'unknown',
            development_mode: typeof __DEV__ !== 'undefined' && __DEV__,
          }),
        }
      },
    })
    // SDK debug output includes automatic events, feature flags, flushes, and
    // transport errors as well as calls through the analytics adapter.
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
