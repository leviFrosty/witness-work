import { isOfflineError } from '@/lib/offlineError'
import { isExpectedLocationError } from '@/lib/locationError'
import { PurchasesError } from '@/lib/purchasesError'

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

const STORE_STATE_CODES = new Set(['2', '3', '5'])

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
