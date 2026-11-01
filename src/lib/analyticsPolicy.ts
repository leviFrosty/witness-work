import { isRetainedAnalyticsEvent } from '@/lib/analyticsEvents'

export function isAnalyticsEvent(event: string): boolean {
  return event !== '$exception' && !event.startsWith('survey ')
}

let allowed = false
let production = false

export function setAnalyticsEventsAllowed(value: boolean): void {
  allowed = value
}

export function setAnalyticsProduction(value: boolean): void {
  production = value
}

export function analyticsEventsAllowed(): boolean {
  return allowed
}

export function analyticsEventAllowed(
  event: string,
  properties?: unknown
): boolean {
  return (
    !isAnalyticsEvent(event) ||
    (allowed && production && isRetainedAnalyticsEvent(event, properties))
  )
}
