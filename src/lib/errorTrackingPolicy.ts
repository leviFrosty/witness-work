import { isOfflineError } from '@/lib/offlineError'
import { isLocationTemporarilyUnavailableError } from '@/lib/locationError'

// Internal policy shared by the public module and the provider's automatic
// capture hook. Keeping it independent of the client avoids an import cycle.
export const errorTrackingEnabled = typeof __DEV__ === 'undefined' || !__DEV__

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [key: string]: JsonValue
    }

// The provider accepts JSON. Drop unsupported values and detach mutable caller
// objects; invalid/circular diagnostics must not prevent the error being sent.
export function diagnosticProperties(
  properties?: Record<string, unknown>
): Record<string, JsonValue> | undefined {
  if (!properties) return undefined
  try {
    return JSON.parse(JSON.stringify(properties))
  } catch {
    return undefined
  }
}

let context: Record<string, JsonValue> = {}

export function mergeErrorContext(properties: Record<string, unknown>): void {
  context = { ...context, ...diagnosticProperties(properties) }
}

export function getErrorContext(): Record<string, unknown> {
  return { ...context }
}

export function shouldIgnoreError(error: unknown): boolean {
  return isOfflineError(error) || isLocationTemporarilyUnavailableError(error)
}

export function shouldIgnoreExceptionProperties(
  properties: Record<string, unknown>
): boolean {
  const exceptions = properties.$exception_list
  return (
    Array.isArray(exceptions) &&
    exceptions.some(
      (exception: unknown) =>
        exception !== null &&
        typeof exception === 'object' &&
        shouldIgnoreError((exception as { value?: unknown }).value)
    )
  )
}
