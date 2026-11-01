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

export type ReportExportSource = 'report_screen' | 'context_menu'

export const reportMonthKey = (month: number, year: number) =>
  moment().month(month).year(year).format('YYYY-MM')

const reportMonthAge = ({ month, year }: { month: number; year: number }) => {
  const sent = moment({ year, month })
  const thisMonth = moment().startOf('month')
  if (sent.isSame(thisMonth, 'month')) return 'current'
  if (sent.isSame(thisMonth.clone().subtract(1, 'month'), 'month'))
    return 'previous'
  return 'other'
}

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

export const availableExportMethods = (
  data: Pick<MonthReportData, 'isLastMonth'>
): ReportExportMethod[] =>
  data.isLastMonth
    ? ['copy', 'share', 'hourglass', 'nwpublisher']
    : ['copy', 'share', 'hourglass']

let pendingHandOff: { settle: (sent: boolean) => void } | null = null

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

    return shared && Platform.OS !== 'android'
  }

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
