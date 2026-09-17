import { posthogClient as client } from '@/lib/posthogClient'

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
