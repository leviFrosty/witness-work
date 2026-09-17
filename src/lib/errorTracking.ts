import { posthogClient as client } from '@/lib/posthogClient'
import {
  diagnosticProperties,
  errorTrackingEnabled,
  mergeErrorContext,
  shouldIgnoreError,
} from '@/lib/errorTrackingPolicy'

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
    safely(() => {
      if (errorTrackingEnabled && !shouldIgnoreError(error)) {
        client?.captureException(error, exceptionProperties(properties))
      }
    })
  },
  captureMessage(message: string, properties?: ErrorProperties): void {
    safely(() => {
      if (errorTrackingEnabled && !shouldIgnoreError(message)) {
        client?.captureException(
          new Error(message),
          exceptionProperties(properties)
        )
      }
    })
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
