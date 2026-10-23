import { toast } from '@/stores/toasts'
import { analytics } from '@/lib/analytics'
import { noteUserAction } from '@/lib/userAction'
import moment from 'moment'
import type { ContextMenuItem } from '@/components/ui/ContextMenu'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { usePreferences, type ReportExportMethod } from '@/stores/preferences'
import {
  exportMethodMenuTitle,
  exportMethodSymbols,
} from '@/features/service-reports/lib/submissionMethod'
import {
  availableExportMethods,
  exportMonthReport,
  getMonthReportData,
  reportMonthKey,
  type ReportExportSource,
} from '@/features/service-reports/lib/monthReportExport'

/**
 * Mark as Sent: for a report sent another way, or shared from Android, where
 * the share sheet can't tell whether it was sent. Same as Already Submitted.
 */
export function markReportSent(
  month: number,
  year: number,
  source: ReportExportSource
) {
  const monthKey = reportMonthKey(month, year)
  const prefs = usePreferences.getState()
  if (prefs.submittedReportMonths.includes(monthKey)) return
  noteUserAction('report')
  prefs.markReportSubmitted(monthKey)
  analytics.capture('service_report_marked_sent', {
    source,
    months_ago: monthsAgo(monthKey),
  })
}

/**
 * Mark as Not Sent: undoes a month marked sent by an export or Already
 * Submitted, so last month's reminder comes back.
 */
export function markReportNotSent(
  month: number,
  year: number,
  source: ReportExportSource
) {
  const monthKey = reportMonthKey(month, year)
  const prefs = usePreferences.getState()
  if (!prefs.submittedReportMonths.includes(monthKey)) return
  prefs.unmarkReportSubmitted(monthKey)
  analytics.capture('service_report_marked_not_sent', {
    source,
    months_ago: monthsAgo(monthKey),
  })
}

const monthsAgo = (monthKey: string) =>
  Math.max(
    0,
    moment().startOf('month').diff(moment(monthKey, 'YYYY-MM'), 'months')
  )

/**
 * Copy / share / submit a month's Service Report from outside the report screen
 * (context menus on month cards and rows). Same report text, export links, and
 * `service_report_export*` analytics as the report screen's Submit button, and
 * a sent report counts as submitted there too.
 */
const useMonthReportExport = () => {
  const defaultExportMethod = usePreferences((s) => s.defaultExportMethod)
  // Subscribed so menus built from `reportMenuItems` switch between Mark as
  // Sent and Mark as Not Sent as soon as a month's mark changes.
  const submittedReportMonths = usePreferences((s) => s.submittedReportMonths)

  const submitReport = async (
    method: ReportExportMethod,
    month: number,
    year: number
  ) => {
    const data = getMonthReportData(month, year)
    const sent = await exportMonthReport(
      method,
      data,
      { month, year },
      'context_menu'
    )
    if (!sent) return
    noteUserAction('report')
    usePreferences.getState().markReportSubmitted(reportMonthKey(month, year))
    Haptics.success()
    if (method === 'copy') {
      toast.success(i18n.t('copied'))
    }
  }

  /**
   * "Send report" menu items: the user's default submission method first, named
   * for what it does ("Submit to Hourglass", "Copy Report"), then the other
   * methods under "Send Another Way", then Mark as Sent or Mark as Not Sent.
   * Matches the report screen's Submit button, whose tap uses the same
   * default.
   */
  const reportMenuItems = (month: number, year: number): ContextMenuItem[] => {
    const lastMonth = moment().subtract(1, 'month')
    const methods = availableExportMethods({
      isLastMonth: lastMonth.month() === month && lastMonth.year() === year,
    })
    // NW Publisher only takes last month's report; fall back to copying.
    const primary = methods.includes(defaultExportMethod)
      ? defaultExportMethod
      : 'copy'
    const item = (method: ReportExportMethod) => ({
      id: method,
      title: exportMethodMenuTitle(method),
      systemImage: exportMethodSymbols[method],
      onPress: () => void submitReport(method, month, year),
    })
    return [
      { ...item(primary), id: 'send_report' },
      {
        id: 'send_another_way',
        title: i18n.t('sendAnotherWay'),
        systemImage: 'ellipsis.circle',
        actions: methods.filter((method) => method !== primary).map(item),
      },
      submittedReportMonths.includes(reportMonthKey(month, year))
        ? {
            id: 'mark_not_sent',
            title: i18n.t('markAsNotSent'),
            systemImage: 'arrow.uturn.backward',
            onPress: () => markReportNotSent(month, year, 'context_menu'),
          }
        : {
            id: 'mark_sent',
            title: i18n.t('markAsSent'),
            systemImage: 'checkmark.circle',
            onPress: () => markReportSent(month, year, 'context_menu'),
          },
    ]
  }

  return {
    reportMenuItems,
    submitReport,
  }
}

export default useMonthReportExport
