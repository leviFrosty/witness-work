import { isOfflineError } from '@/lib/offlineError'
import { isExpectedLocationError } from '@/lib/locationError'

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

const STORAGE_FULL_PATTERNS = [
  /out of space/i,
  /no space left on device/i,
  /NSCocoaErrorDomain\s+Code=640\b/i,
  /\bENOSPC\b/,
]

/**
 * The OS says the device has no room left to write: iOS (NSCocoaErrorDomain
 * 640, "out of space") or POSIX ENOSPC. Nothing the app can fix; counted with
 * the `device_storage_full` event instead of reported. MMKV's `Failed to set`
 * isn't here: it covers any failed write (a file locked before first unlock, a
 * damaged file), so it's still reported.
 */
export function isStorageFullError(error: unknown): boolean {
  if (error == null) return false
  const e = error as { message?: unknown; code?: unknown }
  if (e.code === 'ENOSPC') return true
  const message =
    typeof error === 'string'
      ? error
      : typeof e.message === 'string'
        ? e.message
        : ''
  return STORAGE_FULL_PATTERNS.some((pattern) => pattern.test(message))
}

export function shouldIgnoreError(error: unknown): boolean {
  return (
    isOfflineError(error) ||
    isExpectedLocationError(error) ||
    isStorageFullError(error)
  )
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
