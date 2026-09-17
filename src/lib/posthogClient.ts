import Constants from 'expo-constants'
import PostHog from 'posthog-react-native'
import {
  errorTrackingEnabled,
  getErrorContext,
  shouldIgnoreExceptionProperties,
} from '@/lib/errorTrackingPolicy'

const extra = Constants.expoConfig?.extra as
  | { posthogProjectToken?: string; posthogHost?: string; appVariant?: string }
  | undefined
const projectToken = extra?.posthogProjectToken
const host = extra?.posthogHost

function createClient(): PostHog | null {
  if (!projectToken || !host) return null
  try {
    return new PostHog(projectToken, {
      host,
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
        const isException = event.event === '$exception'
        if (
          isException &&
          (!errorTrackingEnabled ||
            shouldIgnoreExceptionProperties(event.properties ?? {}))
        ) {
          return null
        }
        return {
          ...event,
          properties: {
            ...(isException ? getErrorContext() : {}),
            ...event.properties,
            app_variant: extra?.appVariant ?? 'unknown',
            development_mode: typeof __DEV__ !== 'undefined' && __DEV__,
          },
        }
      },
    })
  } catch {
    return null
  }
}

export const posthogClient = createClient()
