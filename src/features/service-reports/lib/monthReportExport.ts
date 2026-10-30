import { Alert, Platform, Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import moment from 'moment'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { openURL } from '@/lib/links'
import { addForegroundListener } from '@/lib/appLifecycle'
import { isKnownOffline } from '@/lib/http/online'
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
 * Which month an export sends, relative to today, for analytics: `current` is a
 * report sent before its month is over.
 */
const reportMonthAge = ({ month, year }: { month: number; year: number }) => {
  const sent = moment({ year, month })
  const thisMonth = moment().startOf('month')
  if (sent.isSame(thisMonth, 'month')) return 'current'
  if (sent.isSame(thisMonth.clone().subtract(1, 'month'), 'month'))
    return 'previous'
  return 'other'
}

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

/** The hand-off waiting for the user to say whether it sent, if any. */
let pendingHandOff: { settle: (sent: boolean) => void } | null = null

/**
 * Hourglass and NW Publisher take the report over the internet, so one opened
 * while the device is offline may never have received it. Asks the user once
 * they're back in the app, and resolves whether they say it sent. A newer
 * hand-off replaces one still waiting, which counts as not sent.
 */
const confirmOfflineHandOff = (
  method: 'hourglass' | 'nwpublisher',
  properties: { source: ReportExportSource; report_month: string }
): Promise<boolean> =>
  new Promise((resolve) => {
    pendingHandOff?.settle(false)
    const app = i18n.t(method === 'hourglass' ? 'hourglass' : 'nwPublisher')
    const handOff = {
      settle: (sent: boolean) => {
        returned.remove()
        if (pendingHandOff === handOff) pendingHandOff = null
        resolve(sent)
      },
    }
    pendingHandOff = handOff
    const answer = (sent: boolean) => () => {
      analytics.capture('service_report_handoff_confirmed', {
        method,
        ...properties,
        sent,
      })
      handOff.settle(sent)
    }
    const returned = addForegroundListener(() => {
      returned.remove()
      Alert.alert(
        i18n.t('reportHandOffOffline_title', { app }),
        i18n.t('reportHandOffOffline_description', { app }),
        [
          {
            text: i18n.t('reportNotSent'),
            style: 'cancel',
            onPress: answer(false),
          },
          { text: i18n.t('markAsSent'), onPress: answer(true) },
        ],
        { cancelable: false }
      )
    })
  })

/**
 * Opens Hourglass or NW Publisher with the report. Resolves `true` once it
 * opened online; offline, only after the user says it sent.
 */
const handOffReport = async (
  method: 'hourglass' | 'nwpublisher',
  url: string,
  properties: { source: ReportExportSource; report_month: string }
): Promise<boolean> => {
  analytics.capture('service_report_export_requested', {
    method,
    ...properties,
  })
  const offline = isKnownOffline()
  if (!(await openURL(url))) return false
  return offline ? confirmOfflineHandOff(method, properties) : true
}

/**
 * Sends a month's report by `method` and records the export. Resolves `true`
 * when the report was handed off, so the caller can mark it submitted; `false`
 * when the share sheet was dismissed, the app or site didn't open, the method
 * isn't available, (Android Share) there's no telling whether it was sent, or
 * the user says a hand-off opened offline didn't send.
 */
export const exportMonthReport = async (
  method: ReportExportMethod,
  data: MonthReportData,
  { month, year }: { month: number; year: number },
  source: ReportExportSource
): Promise<boolean> => {
  const report_month = reportMonthAge({ month, year })
  if (method === 'copy') {
    await Clipboard.setStringAsync(data.reportAsString())
    analytics.capture('service_report_exported', {
      method: 'copy',
      source,
      report_month,
    })
    return true
  }
  if (method === 'share') {
    const result = await Share.share({ message: data.reportAsString() })
    const shared = result.action === Share.sharedAction
    analytics.capture(
      shared ? 'service_report_exported' : 'service_report_export_dismissed',
      { method: 'share', source, report_month }
    )
    // Android resolves `sharedAction` even when the sheet is dismissed, so a
    // share there leaves the month unmarked; Mark as Sent records it. A
    // browser's share sheet rejects when dismissed, as iOS's reports it.
    return Platform.select({ android: false, default: shared })
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
    return handOffReport(
      'hourglass',
      buildHourglassLink({
        month: month + 1,
        year,
        ...data.hourglassReport,
      }),
      { source, report_month }
    )
  }
  if (method === 'nwpublisher' && data.isLastMonth) {
    return handOffReport(
      'nwpublisher',
      buildNwPublisherLink({
        sharedInMinistry: data.sharedInMinistry,
        hours: data.showHours ? data.hours : undefined,
        credit: data.credit,
        bibleStudies: data.studies,
        remarks,
      }),
      { source, report_month }
    )
  }
  return false
}
