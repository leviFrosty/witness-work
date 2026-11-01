import moment from 'moment'
import i18n from '@/lib/locales'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
  getTotalMinutesDetailedForSpecificMonth,
  getMonthsReports,
  isCountableEntry,
} from '@/lib/serviceReport'
import { getStudiesForGivenMonth } from '@/lib/contacts'
import { formatMinutesCompact } from '@/lib/minutes'
import type { HourglassReport } from '@/features/service-reports/lib/submitLinks'
import type { Publisher } from '@/types/publisher'
import type { TimeEntriesByYear } from '@/types/timeEntry'
import type { Category } from '@/types/category'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import { formatDisplay } from '@/lib/dates'

export type MonthReportData = {
  sharedInMinistry: boolean

  hours: number

  credit: number

  creditOverageHours: number
  studies: number | null

  hourglassReport: Pick<HourglassReport, 'minutes' | 'studies' | 'remarks'>

  notes: string

  defaultNotes: string

  hasNotesOverride: boolean

  isLastMonth: boolean

  showHours: boolean

  showCredit: boolean

  reportAsString: () => string
}

export type MonthReportInputs = {
  month: number | undefined
  year: number | undefined

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

  const sharedInMinistry = monthReports.some(isCountableEntry)
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
        i18n.t('ldcLine', { value: formatMinutesCompact(detailed.ldc) })
      )
    }

    detailed.other.reports.forEach((report) => {
      if (!report.credit || report.minutes <= 0) return
      const liveCategory = report.categoryId
        ? categories.find((c) => c.id === report.categoryId)
        : undefined
      const label = liveCategory?.name ?? report.tag
      creditLines.push(
        i18n.t('creditCategoryLine', {
          label,
          value: formatMinutesCompact(report.minutes),
        })
      )
    })

    if (!creditLines.length && adjusted.creditOverage <= 0) return ''

    const lines = [
      i18n.t('creditBreakdown'),
      ...creditLines,
      i18n.t('creditAppliedLine', {
        value: formatMinutesCompact(credit, { unit: 'hours' }),
      }),
    ]

    if (adjusted.creditOverage > 0) {
      lines.push(
        i18n.t('creditNotAppliedLine', {
          value: formatMinutesCompact(adjusted.creditOverage),
        })
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

    const lines = [
      i18n.t('reportShareTitle', {
        month: formatDisplay(moment().month(month).year(year), 'MMM YYYY'),
      }),
      '',
      '---',
      '',
      i18n.t('reportShareHoursLine', { value: hoursForPublisherOrPioneer }),
      i18n.t('reportShareCreditLine', { value: credit }),
      i18n.t('reportShareStudiesLine', { value: studies ?? 0 }),
      i18n.t('reportShareNotesHeading'),
    ]
    return `${lines.join('\n')}\n${notes ? `\n${notes}` : ''}`
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
