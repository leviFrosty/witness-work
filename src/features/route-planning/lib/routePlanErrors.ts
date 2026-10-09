import i18n from '@/lib/locales'
import type { RoutePlannerFailure } from '@/features/route-planning/hooks/useRoutePlanner'
import { MAX_DAILY_ROUTES } from '@/features/route-planning/lib/routeLimits'

/** The rate-limit message with the server's Retry-After, in seconds or minutes. */
const rateLimitedFor = (retryAfterMs: number): string => {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return seconds < 60
    ? i18n.t('routePlan_error_rateLimitedSeconds', { count: seconds })
    : i18n.t('routePlan_error_rateLimitedMinutes', {
        count: Math.ceil(seconds / 60),
      })
}

/** What went wrong and what to do next, for the route screen. */
export const routePlanErrorMessage = ({
  code,
  retryAfterMs,
}: RoutePlannerFailure): string => {
  switch (code) {
    case 'location':
      return i18n.t('routePlan_error_location')
    case 'location_denied':
      return i18n.t('routePlan_error_locationDenied')
    case 'offline':
      return i18n.t('routePlan_error_offline')
    case 'timeout':
      return i18n.t('routePlan_error_timeout')
    case 'no_route':
      return i18n.t('routePlan_error_noRoute')
    case 'daily_limit':
      return i18n.t('routePlan_error_dailyLimit', { max: MAX_DAILY_ROUTES })
    case 'rate_limited':
      return retryAfterMs !== undefined
        ? rateLimitedFor(retryAfterMs)
        : i18n.t('routePlan_error_rateLimited')
    case 'supporter_required':
      return i18n.t('routePlan_error_supporter')
    case 'unavailable':
      return i18n.t('routePlan_error_unavailable')
    case 'supporter_check_failed':
    case 'failed':
      return i18n.t('routePlan_error_failed')
  }
}
