import Constants from 'expo-constants'
import PostHog from 'posthog-react-native'

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
      before_send: (event) => {
        if (!event) return event
        // Lifecycle autocapture includes deep links, which may contain shared
        // contact tokens or local import filenames. Keep only structural data.
        const properties = { ...event.properties }
        delete properties.url
        delete properties.$current_url
        return {
          ...event,
          properties: {
            ...properties,
            app_variant: extra?.appVariant ?? 'unknown',
            development_mode: typeof __DEV__ !== 'undefined' && __DEV__,
          },
        }
      },
      // Sentry owns crash diagnostics. Analytics records explicit, safe outcomes.
    })
  } catch {
    return null
  }
}

export const posthogClient = createClient()
