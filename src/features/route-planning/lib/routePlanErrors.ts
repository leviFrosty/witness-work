import i18n from '@/lib/locales'
import type { RoutePlannerError } from '@/features/route-planning/hooks/useRoutePlanner'
import { MAX_DAILY_ROUTES } from '@/features/route-planning/lib/routeLimits'

/** What went wrong and what to do next, for the route screen. */
export const routePlanErrorMessage = (error: RoutePlannerError): string => {
  switch (error) {
    case 'location':
      return i18n.t('routePlan_error_location')
    case 'offline':
      return i18n.t('routePlan_error_offline')
    case 'no_route':
      return i18n.t('routePlan_error_noRoute')
    case 'daily_limit':
      return i18n.t('routePlan_error_dailyLimit', { max: MAX_DAILY_ROUTES })
    case 'rate_limited':
      return i18n.t('routePlan_error_rateLimited')
    case 'supporter_required':
      return i18n.t('routePlan_error_supporter')
    case 'unavailable':
      return i18n.t('routePlan_error_unavailable')
    case 'supporter_check_failed':
    case 'failed':
      return i18n.t('routePlan_error_failed')
  }
}
