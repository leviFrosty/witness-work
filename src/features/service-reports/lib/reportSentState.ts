import moment from 'moment'
import i18n from '@/lib/locales'
import { formatMonthDayCompact } from '@/lib/dates'
import { entryTimestampKey } from '@/lib/syncPreferencePolicy'

export type ReportSentState =
  | { sent: false }
  | { sent: true; sentAt: number | null }

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

export function reportSentLabel(state: ReportSentState): string | null {
  if (!state.sent) return null
  return state.sentAt === null
    ? i18n.t('reportSent')
    : i18n.t('reportSentOn', {
        date: formatMonthDayCompact(moment(state.sentAt)),
      })
}
