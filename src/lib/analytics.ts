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

const client = createClient()

// Feature code depends only on this provider-neutral contract. Keep event payloads
// structural: no names, notes, addresses, imported text, or raw error messages.
export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>

function safely(send: () => unknown): void {
  try {
    const result = send()
    if (result instanceof Promise) void result.catch(() => {})
  } catch {
    // Analytics must never interrupt a user's action.
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

export const analytics = {
  capture(event: string, properties?: AnalyticsProperties): void {
    safely(() => client?.capture(event, definedProperties(properties)))
  },
  screen(name: string, properties?: AnalyticsProperties): void {
    safely(() => client?.screen(name, definedProperties(properties)))
  },
  identify(id: string, properties?: AnalyticsProperties): void {
    safely(() => client?.identify(id, definedProperties(properties)))
  },
  reset(): void {
    safely(() => client?.reset())
  },
}
