import i18n from '@/lib/locales'
import { MAX_DAILY_ROUTES } from '@/features/route-planning/lib/routeLimits'
import type { RoutePlanningError } from '@/features/route-planning/lib/routePlanningClient'

export type RoutePlannerError =
  | Exclude<RoutePlanningError, 'cancelled'>
  | 'location'
  | 'location_denied'

export type RoutePlannerFailure = {
  code: RoutePlannerError

  retryAfterMs?: number
}

const rateLimitedFor = (retryAfterMs: number): string => {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return seconds < 60
    ? i18n.t('routePlan_error_rateLimitedSeconds', { count: seconds })
    : i18n.t('routePlan_error_rateLimitedMinutes', {
        count: Math.ceil(seconds / 60),
      })
}

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
    case 'suspended':
      return i18n.t('routePlan_error_suspended')
    case 'device_unverified':
      return i18n.t('routePlan_error_unverified')
    case 'verify_later':
      return i18n.t('account_verifyLaterBody')
    case 'unavailable':
      return i18n.t('routePlan_error_unavailable')
    case 'supporter_check_failed':
    case 'failed':
      return i18n.t('routePlan_error_failed')
  }
}
