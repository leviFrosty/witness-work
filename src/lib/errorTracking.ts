import { posthogClient as client } from '@/lib/posthogClient'
import { analytics } from '@/lib/analytics'
import {
  diagnosticProperties,
  errorTrackingEnabled,
  isStorageFullError,
  mergeErrorContext,
  shouldIgnoreError,
} from '@/lib/errorTrackingPolicy'
import { toPurchasesError } from '@/lib/purchasesError'
import { toCodedError } from '@/lib/codedError'

type ErrorProperties = Record<string, unknown>

type Breadcrumb = {
  category?: string
  message?: string
  level?: string
  data?: ErrorProperties
}

function safely(send: () => unknown): void {
  try {
    const result = send()
    if (result instanceof Promise) void result.catch(() => {})
  } catch {
    // Reporting must never interrupt the action it is diagnosing.
  }
}

function report(original: unknown, properties?: ErrorProperties): void {
  if (!errorTrackingEnabled) return
  // Named for their code, so each kind of failure gets its own issue.
  const error = toCodedError(toPurchasesError(original))
  // A full device isn't a bug, but how often it happens is still worth knowing.
  if (isStorageFullError(error)) analytics.capture('device_storage_full')
  else if (!shouldIgnoreError(error))
    client?.captureException(error, exceptionProperties(properties))
}

function exceptionProperties(properties?: ErrorProperties) {
  const serialized = diagnosticProperties(properties)
  if (!serialized) return undefined
  const { level, ...rest } = serialized
  return typeof level === 'string'
    ? { ...rest, $exception_level: level }
    : serialized
}

/**
 * Provider-neutral diagnostics. Context is merged for subsequent JS errors;
 * per-error properties take precedence. Breadcrumbs are bounded in memory and
 * attached to errors (including native crashes), never sent as analytics
 * events. Keep diagnostic properties structural; don't include names, notes or
 * addresses.
 */
export const errorTracking = {
  captureException(error: unknown, properties?: ErrorProperties): void {
    safely(() => report(error, properties))
  },
  captureMessage(message: string, properties?: ErrorProperties): void {
    safely(() => report(new Error(message), properties))
  },
  addBreadcrumb({ category, message, level, data }: Breadcrumb): void {
    safely(() => {
      if (!errorTrackingEnabled) return
      client?.addExceptionStep(message ?? category ?? 'App action', {
        ...diagnosticProperties(data),
        ...(category === undefined ? {} : { category }),
        ...(level === undefined ? {} : { level }),
      })
    })
  },
  setContext(properties: ErrorProperties): void {
    safely(() => mergeErrorContext(properties))
  },
}
