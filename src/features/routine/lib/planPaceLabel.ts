import moment from 'moment'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import { PACE_EXTRA_MAX, type PlanPace } from '@/features/routine/lib/planPace'

export const planDateLabel = (day: string): string =>
  formatDate(moment(day, 'YYYY-MM-DD'), { style: 'medium' })

export function paceLabel(pace: PlanPace | null): string | null {
  if (!pace) return null
  if (pace.kind === 'estimate')
    return i18n.t('routine.screen.paceEstimate', {
      date: planDateLabel(pace.finishOn),
    })
  if (pace.kind === 'faster')
    return pace.extra <= PACE_EXTRA_MAX
      ? i18n.t('routine.screen.paceExtra', { count: pace.extra })
      : i18n.t('routine.screen.paceFaster', { count: pace.perDay })
  return i18n.t(
    pace.kind === 'onPace'
      ? 'routine.screen.paceOn'
      : 'routine.screen.pacePassed'
  )
}
