import moment from 'moment'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'
import { computeProjectedTotal } from '@/lib/projectedTotal'
import { creditCapMinutesFor } from '@/lib/publisherCapabilities'
import {
  getLoggedDayKeys,
  getMonthsReports,
  getTotalMinutesDetailedForSpecificMonth,
} from '@/lib/serviceReport'
import {
  buildReport,
  BuildReportArgs,
  ReportFields,
} from '@/app/widgets/buildReport'
import { Category } from '@/types/category'
import watchStringKeys from '@/app/watch/watchStringKeys.json'

/**
 * Bumped when the shape changes in a way the watch's Swift decoder cares about.
 * Mirrors `WatchSnapshot.supportedVersion` in
 * `modules/watch-bridge/ios/WatchProtocol.swift`.
 */
export const WATCH_SNAPSHOT_VERSION = 1

/**
 * What the Apple Watch app and its complications show. Mirrors `WatchSnapshot`
 * in `WatchProtocol.swift`. Strings are translated into the app's language and
 * durations formatted here, so the watch never formats measured time.
 */
export type WatchSnapshot = {
  version: number
  /** Epoch ms. */
  generatedAt: number
  /** `YYYY-MM` of the month the progress describes. */
  monthKey: string
  /** Add Time and the timer are available (hours role or Log my hours). */
  showsTimeEntry: boolean
  entryMode: ReportFields['mode']
  monthFormatted: string
  monthCompact: string
  goalHours: number
  progress: number
  publisherState: ReportFields['publisherState']
  /** `Projected 52.5 Hrs`; `null` when no Plans are left this month. */
  projectedText: string | null
  categories: { id: string; name: string }[]
  strings: Record<string, string>
}

export type BuildWatchSnapshotArgs = BuildReportArgs & {
  showsTimeEntry: boolean
  categories: Category[]
}

/**
 * This month's Projected Total — logged time plus the remaining Plans after the
 * Credit Time cap, the same figure as the Progress tab. Without Plans left it
 * would just repeat the logged total, so there's nothing to show.
 */
function projectedText(
  args: BuildWatchSnapshotArgs,
  goalHours: number,
  now: moment.Moment
): string | null {
  const year = now.year()
  const month = now.month()
  const reports = getMonthsReports(args.serviceReports, month, year)
  const { standard, credit } = getTotalMinutesDetailedForSpecificMonth(
    reports,
    month,
    year
  )
  const projection = computeProjectedTotal({
    scope: { kind: 'month', year, month },
    today: now.toDate(),
    goalMinutes: goalHours * 60,
    loggedMonths: [{ year, month, standard, credit }],
    loggedDayKeys: getLoggedDayKeys(reports),
    dayPlans: args.dayPlans,
    recurringPlans: args.recurringPlans,
    categories: args.categories,
    creditCapMinutes: creditCapMinutesFor(args.publisher, {
      enabled: args.overrideCreditLimit,
      customLimitHours: args.customCreditLimitHours,
    }),
  })
  if (projection.plannedMinutes <= 0) return null
  // Formatted like the iPhone's Projected Total card.
  return i18n.t('watchProjected', {
    value: formatMinutes(projection.projectedMinutes, args.timeDisplayFormat)
      .formatted,
  })
}

export function buildWatchSnapshot(
  args: BuildWatchSnapshotArgs
): WatchSnapshot {
  const report = buildReport(args)
  const now = moment()

  return {
    version: WATCH_SNAPSHOT_VERSION,
    generatedAt: Date.now(),
    monthKey: `${now.year()}-${String(now.month() + 1).padStart(2, '0')}`,
    showsTimeEntry: args.showsTimeEntry,
    entryMode: report.mode,
    monthFormatted: report.monthHoursFormatted,
    monthCompact:
      report.monthMinutes > 0
        ? formatMinutesCompact(report.monthMinutes)
        : formatMinutesCompact(0, { unit: 'hours' }),
    goalHours: report.goalHours,
    progress: report.progress,
    publisherState: report.publisherState,
    projectedText: projectedText(args, report.goalHours, now),
    categories: args.categories.map(({ id, name }) => ({ id, name })),
    strings: Object.fromEntries(
      watchStringKeys.strings.map((key) => [key, i18n.t(key as TranslationKey)])
    ),
  }
}
