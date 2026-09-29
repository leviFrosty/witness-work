import moment from 'moment'
import i18n from '@/lib/locales'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
  getTotalMinutesDetailedForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { getStudiesForGivenMonth } from '@/lib/contacts'
import { formatMinutesCompact } from '@/lib/minutes'
import type { HourglassReport } from '@/features/service-reports/lib/submitLinks'
import type { Publisher } from '@/types/publisher'
import type { TimeEntriesByYear } from '@/types/timeEntry'
import type { Category } from '@/types/category'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'

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
  /**
   * Hourglass submission fields. Preaching minutes and Credit Time remarks stay
   * separate; checkbox mode uses 1/0 for participation.
   */
  hourglassReport: Pick<HourglassReport, 'minutes' | 'studies' | 'remarks'>
  /**
   * Comments text for the report. The auto-generated credit breakdown, unless
   * the user saved a month-specific override (see `hasNotesOverride`).
   */
  notes: string
  /** The auto-generated comments, ignoring any user override. */
  defaultNotes: string
  /** True when `notes` comes from a user-saved month-specific override. */
  hasNotesOverride: boolean
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

export type MonthReportInputs = {
  month: number | undefined
  year: number | undefined
  /** The role that applied that month (Role History). */
  publisher: Publisher
  entryMode: 'checkbox' | 'hours'
  serviceReports: TimeEntriesByYear
  categories: Category[]
  contacts: Contact[]
  conversations: Visit[]
  overrideCreditLimit: boolean
  customCreditLimitHours: number
  reportCommentOverrides: Record<string, string>
}

/**
 * Everything the Service Report shows and exports for one month. Pure, so the
 * report screen (through `useMonthReportData`) and one-off exports from menus
 * (through `getMonthReportData`) build the exact same report.
 */
export const buildMonthReportData = ({
  month,
  year,
  publisher,
  entryMode,
  serviceReports,
  categories,
  contacts,
  conversations,
  overrideCreditLimit,
  customCreditLimitHours,
  reportCommentOverrides,
}: MonthReportInputs): MonthReportData => {
  const hasMonth = month !== undefined && year !== undefined
  const monthReports = getMonthsReports(serviceReports, month, year)

  const adjusted: AdjustedMinutes = hasMonth
    ? adjustedMinutesForSpecificMonth(monthReports, month, year, publisher, {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      })
    : { value: 0, creditOverage: 0, credit: 0, standard: 0 }

  const studies = hasMonth
    ? getStudiesForGivenMonth({
        contacts,
        conversations,
        month: moment().month(month).year(year).toDate(),
      })
    : null

  const isLastMonth = hasMonth
    ? moment()
        .subtract(1, 'month')
        .isSame(moment().month(month).year(year), 'month')
    : false

  const sharedInMinistry = monthReports.length > 0
  const hours = Math.floor(adjusted.standard / 60)
  const credit = Math.max(0, Math.floor(adjusted.value / 60) - hours)
  const creditOverageHours = Math.floor(adjusted.creditOverage / 60)
  const hourglassMinutes =
    entryMode === 'checkbox' ? (sharedInMinistry ? 1 : 0) : adjusted.standard

  const buildDefaultNotes = () => {
    if (!hasMonth) return ''

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
      const liveCategory = report.categoryId
        ? categories.find((c) => c.id === report.categoryId)
        : undefined
      const label = liveCategory?.name ?? report.tag
      creditLines.push(`${label}: ${formatMinutesCompact(report.minutes)}`)
    })

    if (!creditLines.length && adjusted.creditOverage <= 0) return ''

    const lines = [
      i18n.t('creditBreakdown'),
      ...creditLines,
      `${i18n.t('creditApplied')}: ${formatMinutesCompact(credit, { unit: 'hours' })}`,
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
  }
  const defaultNotes = buildDefaultNotes()

  const monthKey = hasMonth
    ? moment().month(month).year(year).format('YYYY-MM')
    : undefined
  const notesOverride =
    monthKey !== undefined ? reportCommentOverrides[monthKey] : undefined
  const hasNotesOverride = notesOverride !== undefined
  const notes = notesOverride ?? defaultNotes

  const reportAsString = () => {
    if (!hasMonth) return ''
    const hoursForPublisherOrPioneer =
      entryMode === 'checkbox'
        ? sharedInMinistry
          ? i18n.t('yes')
          : i18n.t('no')
        : hours

    return `${i18n.t('serviceReport')} - ${moment()
      .month(month)
      .format('MMM')} ${year}\n\n---\n\n${i18n.t(
      'hours'
    )}: ${hoursForPublisherOrPioneer}\n${i18n.t('credit')}: ${credit}\n${i18n.t(
      'studies'
    )}: ${studies}\n${i18n.t('notes')}:\n${notes ? `\n${notes}` : ''}`
  }

  return {
    sharedInMinistry,
    hours,
    credit,
    creditOverageHours,
    studies,
    hourglassReport: {
      minutes: hourglassMinutes,
      studies,
      remarks: notes || undefined,
    },
    notes,
    defaultNotes,
    hasNotesOverride,
    isLastMonth,
    showHours: entryMode !== 'checkbox',
    showCredit: true,
    reportAsString,
  }
}
