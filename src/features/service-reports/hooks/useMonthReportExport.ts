import { useToastController } from '@tamagui/toast'
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
} from '@/features/service-reports/lib/monthReportExport'

/**
 * Copy / share / submit a month's Service Report from outside the report screen
 * (context menus on month cards and rows). Same report text, export links, and
 * `service_report_export*` analytics as the report screen's Submit button, and
 * a sent report counts as submitted there too.
 */
const useMonthReportExport = () => {
  const toast = useToastController()
  const defaultExportMethod = usePreferences((s) => s.defaultExportMethod)

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
    usePreferences.getState().markReportSubmitted(reportMonthKey(month, year))
    Haptics.success()
    if (method === 'copy') {
      toast.show(i18n.t('copied'), { message: '', native: true })
    }
  }

  /**
   * "Send report" menu items: the user's default submission method first, named
   * for what it does ("Submit to Hourglass", "Copy Report"), then the other
   * methods under "Send Another Way". Matches the report screen's Submit
   * button, whose tap uses the same default.
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
    ]
  }

  return {
    reportMenuItems,
    submitReport,
  }
}

export default useMonthReportExport
