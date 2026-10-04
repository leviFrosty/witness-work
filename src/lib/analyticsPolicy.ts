// Store-free on purpose: the provider client is imported by low-level modules
// (storage, error tracking) that the preferences store itself depends on, so
// reading the store here would create an import cycle. The preferences store
// pushes its value in through `setAnalyticsEventsAllowed` (see
// `src/lib/analyticsConsent.ts`).
import { isRetainedAnalyticsEvent } from '@/lib/analyticsEvents'

// Events the provider sends that are not usage analytics and therefore stay on
// regardless of the user's analytics choice: crash reports, the answers a
// user deliberately submits or dismisses in an in-app survey, and diagnostics
// they opt to attach to a response (`survey attachment`).
export function isAnalyticsEvent(event: string): boolean {
  return event !== '$exception' && !event.startsWith('survey ')
}

// False until the persisted choice is known, so an event captured before then
// (for example the SDK's own app-opened event) is dropped rather than sent
// against the user's wishes.
let allowed = false
let production = false

export function setAnalyticsEventsAllowed(value: boolean): void {
  allowed = value
}

export function setAnalyticsProduction(value: boolean): void {
  production = value
}

/** Whether usage analytics events may be sent right now. */
export function analyticsEventsAllowed(): boolean {
  return allowed
}

/** Applied at capture and every queue/retry boundary; diagnostics stay separate. */
export function analyticsEventAllowed(
  event: string,
  properties?: unknown
): boolean {
  return (
    !isAnalyticsEvent(event) ||
    (allowed && production && isRetainedAnalyticsEvent(event, properties))
  )
}
