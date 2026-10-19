import moment from 'moment'
import i18n from '@/lib/locales'
import { formatMonthDayCompact } from '@/lib/dates'
import { entryTimestampKey } from '@/lib/syncPreferencePolicy'

export type ReportSentState =
  | { sent: false }
  /** `sentAt` is unknown for months marked before per-month stamps. */
  | { sent: true; sentAt: number | null }

/**
 * Whether a month's report was sent (any export method or Already Submitted),
 * and when. The date is the month's per-entry sync stamp, written whenever the
 * month is marked; a stamp from before the month began can only be a stand-in
 * copied from the whole list's stamp, so it's dropped.
 */
export function reportSentState(
  prefs: {
    submittedReportMonths: readonly string[]
    preferenceUpdatedAt?: Record<string, number>
  },
  monthKey: string
): ReportSentState {
  if (!prefs.submittedReportMonths.includes(monthKey)) return { sent: false }
  const stamp =
    prefs.preferenceUpdatedAt?.[
      entryTimestampKey('submittedReportMonths', monthKey)
    ]
  const monthStart = moment(monthKey, 'YYYY-MM').valueOf()
  return {
    sent: true,
    sentAt: typeof stamp === 'number' && stamp >= monthStart ? stamp : null,
  }
}

/** "Sent Oct 3", or just "Sent" when the date isn't known. */
export function reportSentLabel(state: ReportSentState): string | null {
  if (!state.sent) return null
  return state.sentAt === null
    ? i18n.t('reportSent')
    : i18n.t('reportSentOn', {
        date: formatMonthDayCompact(moment(state.sentAt)),
      })
}
