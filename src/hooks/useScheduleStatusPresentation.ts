import {
  CalendarClock as CalendarClockIcon,
  CircleCheck as CircleCheckIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
} from 'lucide-react-native'

import type { AppIcon } from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import type { ScheduleStatus, ScheduleStatusState } from '@/lib/scheduleStatus'

const STATUS_TITLE_KEYS: Record<ScheduleStatusState, TranslationKey> = {
  ahead: 'scheduleStatus.ahead',
  behind: 'scheduleStatus.behind',
  onTrack: 'scheduleStatus.onTrack',
  noPlan: 'scheduleStatus.noPlan',
  notStarted: 'scheduleStatus.upcoming',
}

/** Shared display model for the Schedule pace card and its Home summary. */
const useScheduleStatusPresentation = (status: ScheduleStatus) => {
  const theme = useTheme()
  const difference = useFormattedMinutes(Math.abs(status.differenceMinutes))

  const title = i18n.t(STATUS_TITLE_KEYS[status.state])
  const meta = (() => {
    switch (status.state) {
      case 'ahead':
        return `+${difference.formatted}`
      case 'behind':
        return `-${difference.formatted}`
      case 'onTrack':
        return i18n.t('scheduleStatus.matched')
      case 'noPlan':
        return i18n.t('scheduleStatus.noPlannedTime')
      case 'notStarted':
        return i18n.t('scheduleStatus.notStarted')
    }
  })()
  const color = (() => {
    switch (status.state) {
      case 'ahead':
      case 'onTrack':
        return theme.colors.accent
      case 'behind':
        return theme.colors.warn
      default:
        return theme.colors.textAlt
    }
  })()
  const icon: AppIcon = (() => {
    switch (status.state) {
      case 'ahead':
        return TrendingUpIcon
      case 'behind':
        return TrendingDownIcon
      case 'onTrack':
        return CircleCheckIcon
      default:
        return CalendarClockIcon
    }
  })()
  const progress =
    status.plannedMinutes > 0
      ? Math.max(0, status.actualMinutes / status.plannedMinutes)
      : status.actualMinutes > 0
        ? 1
        : 0

  return { title, meta, color, icon, progress }
}

export default useScheduleStatusPresentation
