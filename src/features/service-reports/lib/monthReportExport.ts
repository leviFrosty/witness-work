import { Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import moment from 'moment'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { openURL } from '@/lib/links'
import { publisherCapabilitiesForMonth } from '@/lib/roleHistory'
import { usePreferences, type ReportExportMethod } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import useConversations from '@/stores/conversationStore'
import useContacts from '@/stores/contactsStore'
import {
  buildMonthReportData,
  type MonthReportData,
} from '@/features/service-reports/lib/monthReportData'
import {
  buildHourglassLink,
  buildNwPublisherLink,
} from '@/features/service-reports/lib/submitLinks'

/** Where a report export started, for analytics. */
export type ReportExportSource = 'report_screen' | 'context_menu'

/** `YYYY-MM`, the key `submittedReportMonths` and comment overrides use. */
export const reportMonthKey = (month: number, year: number) =>
  moment().month(month).year(year).format('YYYY-MM')

/**
 * A month's report built from the stores' current state — for exports started
 * outside the report screen (menus), so a list of months doesn't build every
 * report up front.
 */
export const getMonthReportData = (
  month: number,
  year: number
): MonthReportData => {
  const prefs = usePreferences.getState()
  const { type: publisher, entryMode } = publisherCapabilitiesForMonth(prefs, {
    month,
    year,
  })
  return buildMonthReportData({
    month,
    year,
    publisher,
    entryMode,
    serviceReports: useServiceReport.getState().serviceReports,
    categories: useCategories.getState().categories,
    contacts: useContacts.getState().contacts,
    conversations: useConversations.getState().conversations,
    overrideCreditLimit: prefs.overrideCreditLimit,
    customCreditLimitHours: prefs.customCreditLimitHours,
    reportCommentOverrides: prefs.reportCommentOverrides,
  })
}

/**
 * Export methods that can send this month's report. NW Publisher only accepts
 * the previous month's report.
 */
export const availableExportMethods = (
  data: Pick<MonthReportData, 'isLastMonth'>
): ReportExportMethod[] =>
  data.isLastMonth
    ? ['copy', 'share', 'hourglass', 'nwpublisher']
    : ['copy', 'share', 'hourglass']

/**
 * Sends a month's report by `method` and records the export. Resolves `true`
 * when the report was handed off, so the caller can mark it submitted; `false`
 * when the share sheet was dismissed or the method isn't available.
 */
export const exportMonthReport = async (
  method: ReportExportMethod,
  data: MonthReportData,
  { month, year }: { month: number; year: number },
  source: ReportExportSource
): Promise<boolean> => {
  if (method === 'copy') {
    await Clipboard.setStringAsync(data.reportAsString())
    analytics.capture('service_report_exported', { method: 'copy', source })
    return true
  }
  if (method === 'share') {
    const result = await Share.share({ message: data.reportAsString() })
    const shared = result.action === Share.sharedAction
    analytics.capture(
      shared ? 'service_report_exported' : 'service_report_export_dismissed',
      { method: 'share', source }
    )
    return shared
  }

  // NW Publisher has a separate credit field, so its default remark only
  // needs the overage. Hourglass carries the credit breakdown in remarks.
  const remarks = data.hasNotesOverride
    ? data.notes || undefined
    : data.creditOverageHours > 0
      ? i18n.t('creditOverageInTheAmountOf', {
          count: data.creditOverageHours,
        })
      : undefined

  if (method === 'hourglass') {
    analytics.capture('service_report_export_requested', {
      method: 'hourglass',
      source,
    })
    await openURL(
      buildHourglassLink({
        month: month + 1,
        year,
        ...data.hourglassReport,
      })
    )
    return true
  }
  if (method === 'nwpublisher' && data.isLastMonth) {
    analytics.capture('service_report_export_requested', {
      method: 'nwpublisher',
      source,
    })
    await openURL(
      buildNwPublisherLink({
        sharedInMinistry: data.sharedInMinistry,
        hours: data.showHours ? data.hours : undefined,
        credit: data.credit,
        bibleStudies: data.studies,
        remarks,
      })
    )
    return true
  }
  return false
}
