import { useCallback, useMemo } from 'react'
import moment from 'moment'
import i18n from '../lib/locales'
import { usePreferences } from '../stores/preferences'
import useServiceReport from '../stores/serviceReport'
import useConversations from '../stores/conversationStore'
import useContacts from '../stores/contactsStore'
import usePublisher from './usePublisher'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
  getTotalMinutesDetailedForSpecificMonth,
  getMonthsReports,
} from '../lib/serviceReport'
import { getStudiesForGivenMonth } from '../lib/contacts'
import { formatHoursCompact, formatMinutesCompact } from '../lib/minutes'

export type MonthReportData = {
  /** Whether the publisher has any reports logged for this month. */
  sharedInMinistry: boolean
  /** Whole-hour standard time (excludes credit). */
  hours: number
  /** Whole-hour credit time within the cap. */
  credit: number
  /** Whole-hour credit time over the cap (rendered into notes). */
  creditOverageHours: number
  studies: number | null
  /** Notes string with the raw credit breakdown and credit overage. */
  notes: string
  /** Last-month-only flag (kept for nwpublisher submission gating). */
  isLastMonth: boolean
  /** Hide the hours row for checkbox-mode publishers. */
  showHours: boolean
  /** Always true today — credit row shows zero rather than hiding. */
  showCredit: boolean
  /**
   * Same string the share/copy actions produce — preserves credit-in-notes
   * formatting.
   */
  reportAsString: () => string
}

const useMonthReportData = (
  month: number | undefined,
  year: number | undefined
): MonthReportData => {
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences()
  const { type: publisher, entryMode } = usePublisher()
  const { serviceReports } = useServiceReport()
  const { conversations } = useConversations()
  const { contacts } = useContacts()

  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const adjusted: AdjustedMinutes = useMemo(
    () =>
      month !== undefined && year !== undefined
        ? adjustedMinutesForSpecificMonth(
            monthReports,
            month,
            year,
            publisher,
            {
              enabled: overrideCreditLimit,
              customLimitHours: customCreditLimitHours,
            }
          )
        : { value: 0, creditOverage: 0, credit: 0, standard: 0 },
    [
      month,
      monthReports,
      year,
      publisher,
      overrideCreditLimit,
      customCreditLimitHours,
    ]
  )

  const studies = useMemo(
    () =>
      month !== undefined && year !== undefined
        ? getStudiesForGivenMonth({
            contacts,
            conversations,
            month: moment().month(month).year(year).toDate(),
          })
        : null,
    [contacts, conversations, month, year]
  )

  const isLastMonth = useMemo(() => {
    if (month === undefined || year === undefined) return false
    const provided = moment().month(month).year(year)
    return moment().subtract(1, 'month').isSame(provided, 'month')
  }, [month, year])

  const sharedInMinistry = monthReports.length > 0
  const hours = Math.floor(adjusted.standard / 60)
  const credit = Math.max(0, Math.floor(adjusted.value / 60) - hours)
  const creditOverageHours = Math.floor(adjusted.creditOverage / 60)

  const notes = useMemo(() => {
    if (month === undefined || year === undefined) return ''

    const detailed = getTotalMinutesDetailedForSpecificMonth(
      monthReports,
      month,
      year
    )
    const creditLines: string[] = []

    if (detailed.ldc > 0) {
      creditLines.push(
        `${i18n.t('ldc')}: ${formatMinutesCompact(detailed.ldc)}`
      )
    }

    detailed.other.reports.forEach((report) => {
      if (!report.credit || report.minutes <= 0) return
      creditLines.push(`${report.tag}: ${formatMinutesCompact(report.minutes)}`)
    })

    if (!creditLines.length && adjusted.creditOverage <= 0) return ''

    const lines = [
      i18n.t('creditBreakdown'),
      ...creditLines,
      `${i18n.t('creditApplied')}: ${formatHoursCompact(credit)}`,
    ]

    if (adjusted.creditOverage > 0) {
      lines.push(
        `${i18n.t('creditNotApplied')}: ${formatMinutesCompact(
          adjusted.creditOverage
        )} ${i18n.t('creditOverCap')}`
      )
      lines.push(
        credit === 0
          ? i18n.t('creditOverCapReasonNoneApplied')
          : i18n.t('creditOverCapReasonPartialApplied')
      )
    }

    return lines.join('\n')
  }, [adjusted.creditOverage, credit, month, monthReports, year])

  const reportAsString = useCallback(() => {
    if (month === undefined || year === undefined) return ''
    const hoursForPublisherOrPioneer = () => {
      if (entryMode === 'checkbox') {
        return sharedInMinistry ? i18n.t('yes') : i18n.t('no')
      }
      return hours
    }

    return `${i18n.t('serviceReport')} - ${moment()
      .month(month)
      .format('MMM')} ${year}\n\n---\n\n${i18n.t(
      'hours'
    )}: ${hoursForPublisherOrPioneer()}\n${i18n.t('credit')}: ${credit}\n${i18n.t(
      'studies'
    )}: ${studies}\n${i18n.t('notes')}:\n${notes ? `\n${notes}` : ''}`
  }, [month, year, entryMode, sharedInMinistry, hours, credit, studies, notes])

  return {
    sharedInMinistry,
    hours,
    credit,
    creditOverageHours,
    studies,
    notes,
    isLastMonth,
    showHours: entryMode !== 'checkbox',
    showCredit: true,
    reportAsString,
  }
}

export default useMonthReportData
