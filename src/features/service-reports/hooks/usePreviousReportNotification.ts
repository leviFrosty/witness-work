import moment from 'moment'
import { noteUserAction } from '@/lib/userAction'
import { Send as SendIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import useDueReportMonth from '@/features/service-reports/hooks/useDueReportMonth'

export default function usePreviousReportNotification(
  now: number
): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()
  const markReportSubmitted = usePreferences((s) => s.markReportSubmitted)
  const { month, year, isPreviousMonth } = useDueReportMonth(now)
  if (!isPreviousMonth) return null

  const previousMonth = moment({ year, month })
  const monthKey = previousMonth.format('YYYY-MM')
  return {
    id: `previous_report:${monthKey}`,
    kind: 'previous_report',
    icon: SendIcon,
    title: i18n.t('submitMonthsReport', {
      month: previousMonth.format('MMMM'),
    }),
    actions: [
      {
        id: 'submit',
        label: i18n.t('submit'),
        onPress: () =>
          navigation.navigate('ServiceReportView', {
            month: previousMonth.month(),
            year: previousMonth.year(),
          }),
      },
      {
        id: 'already_submitted',
        label: i18n.t('notifications_alreadySubmitted'),
        inPlace: true,
        onPress: () => {
          noteUserAction('report')
          markReportSubmitted(monthKey)
        },
      },
    ],
  }
}
