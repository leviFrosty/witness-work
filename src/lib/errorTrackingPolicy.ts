import { isOfflineError } from '@/lib/offlineError'
import { isExpectedLocationError } from '@/lib/locationError'
import { PurchasesError } from '@/lib/purchasesError'

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

/**
 * RevenueCat `PURCHASES_ERROR_CODE`s that describe the device's store, not a
 * bug: no Play billing or purchases restricted (PURCHASE_NOT_ALLOWED), the
 * store failing (STORE_PROBLEM), or a product this store doesn't offer
 * (PRODUCT_NOT_AVAILABLE_FOR_PURCHASE).
 */
const STORE_STATE_CODES = new Set(['2', '3', '5'])

/**
 * A store state from a RevenueCat read the user didn't start. The read runs
 * again on its own, so nothing is lost. A purchase or restore the user started
 * still reports them as `storeErrorOutcome` decides.
 */
export function isBackgroundStoreStateError(error: unknown): boolean {
  return (
    error instanceof PurchasesError &&
    error.background &&
    STORE_STATE_CODES.has(error.code)
  )
}

export function shouldIgnoreError(error: unknown): boolean {
  return (
    isOfflineError(error) ||
    isExpectedLocationError(error) ||
    isStorageFullError(error) ||
    isBackgroundStoreStateError(error)
  )
}

/**
 * An automatically captured exception keeps only its type and message. An
 * `HttpError`'s message starts with its kind (`timeout`, `offline: …`), which
 * is what decides whether a reported one would have been sent.
 */
function errorFromException(exception: {
  type?: unknown
  value?: unknown
}): unknown {
  const { type, value } = exception
  if (type !== 'HttpError' || typeof value !== 'string') return value
  return { message: value, kind: value.split(':', 1)[0] }
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
        shouldIgnoreError(errorFromException(exception))
    )
  )
}
