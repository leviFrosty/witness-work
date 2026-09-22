// Store-free on purpose: the provider client is imported by low-level modules
// (storage, error tracking) that the preferences store itself depends on, so
// reading the store here would create an import cycle. The preferences store
// pushes its value in through `setAnalyticsEventsAllowed` (see
// `src/lib/analyticsConsent.ts`).

// Events the provider sends that are not usage analytics and therefore stay on
// regardless of the user's analytics choice: crash reports and the answers a
// user deliberately submits or dismisses in an in-app survey.
export function isAnalyticsEvent(event: string): boolean {
  return event !== '$exception' && !event.startsWith('survey ')
}

// False until the persisted choice is known, so an event captured before then
// (for example the SDK's own app-opened event) is dropped rather than sent
// against the user's wishes.
let allowed = false

export function setAnalyticsEventsAllowed(value: boolean): void {
  allowed = value
}

/** Whether usage analytics events may be sent right now. */
export function analyticsEventsAllowed(): boolean {
  return allowed
}
