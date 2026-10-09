import moment from 'moment'
import { noteUserAction } from '@/lib/userAction'
import { Send as SendIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import { getMonthsReports, isCountableEntry } from '@/lib/serviceReport'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import { shouldShowPreviousReportReminder } from '@/features/service-reports/lib/previousReportReminder'
import { useShallow } from 'zustand/react/shallow'

/**
 * Tray reminder to submit last month's Service Report. Clears once it's sent
 * onward from the report screen, or marked as already submitted for Users who
 * report some other way.
 */
export default function usePreviousReportNotification(
  now: number
): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()
  const { submittedReportMonths, installedOn, markReportSubmitted } =
    usePreferences(
      useShallow((s) => ({
        submittedReportMonths: s.submittedReportMonths,
        installedOn: s.installedOn,
        markReportSubmitted: s.markReportSubmitted,
      }))
    )
  const serviceReports = useServiceReport((state) => state.serviceReports)

  const previousMonth = moment(now).subtract(1, 'month')
  const previousMonthHasEntries = getMonthsReports(
    serviceReports,
    previousMonth.month(),
    previousMonth.year()
  ).some(isCountableEntry)
  if (
    !shouldShowPreviousReportReminder({
      installedOn,
      now: new Date(now),
      previousMonthHasEntries,
      submittedReportMonths,
    })
  ) {
    return null
  }

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
