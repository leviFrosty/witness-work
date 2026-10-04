import moment from 'moment'
import { CalendarPlus as CalendarPlusIcon } from 'lucide-react-native'
import usePublisher from '@/hooks/usePublisher'

import i18n from '@/lib/locales'
import type { NotificationItem } from '@/types/notifications'
import useAuxiliaryMonths from '@/features/service-reports/hooks/useAuxiliaryMonths'
import { openAuxiliaryMonthSheet } from '@/features/service-reports/stores/auxiliaryMonthSheet'

/**
 * Asks a Kingdom Publisher once a month whether they're auxiliary pioneering.
 * Gone once this month or next is set, and replaced by next month's question
 * when the month ends.
 */
export default function useAuxiliaryMonthNotification(
  now: number
): NotificationItem | null {
  const { entryMode } = usePublisher('standing')
  const { months } = useAuxiliaryMonths()
  if (entryMode !== 'checkbox' || months.some((month) => month.isAuxiliary))
    return null

  return {
    id: `auxiliary_month:${moment(now).format('YYYY-MM')}`,
    kind: 'auxiliary_month',
    icon: CalendarPlusIcon,
    title: i18n.t('auxiliaryMonth.prompt'),
    description: i18n.t('auxiliaryMonth.notificationDescription'),
    actions: [
      {
        id: 'set_up',
        label: i18n.t('auxiliaryMonth.setUp'),
        onPress: () => {
          openAuxiliaryMonthSheet()
        },
      },
    ],
  }
}
