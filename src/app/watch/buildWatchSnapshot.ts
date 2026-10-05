import moment from 'moment'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatMinutesCompact } from '@/lib/minutes'
import { plannedMinutesThroughEachDayOfMonth } from '@/lib/recurrence'
import { resolveMonthlyGoalHours } from '@/lib/monthlyGoals'
import {
  buildReport,
  BuildReportArgs,
  ReportFields,
} from '@/app/widgets/buildReport'
import { buildUpNext, WatchUpNextItem } from '@/app/watch/buildUpNext'
import { Category } from '@/types/category'
import { Contact } from '@/types/contact'
import { Publisher } from '@/types/publisher'
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
 * durations formatted here, so the watch never formats measured time, except
 * the compact total it adds watch entries to before the iPhone saves them.
 */
export type WatchSnapshot = {
  version: number
  /** Epoch ms. */
  generatedAt: number
  /** `YYYY-MM` of the month the progress describes. */
  monthKey: string
  /** Localized name of that month, e.g. `October`. */
  monthName: string
  /** Add Time and the timer are available (hours role or Log my hours). */
  showsTimeEntry: boolean
  entryMode: ReportFields['mode']
  monthFormatted: string
  monthCompact: string
  /** Credit-capped minutes this month. */
  monthMinutes: number
  goalHours: number
  progress: number
  /**
   * Planned minutes through each day of the month (index 0 is the 1st), for the
   * pace mark and ahead/behind; `null` when the month has no plans.
   */
  plannedThroughDay: number[] | null
  publisherState: ReportFields['publisherState']
  paceText: string | null
  /** Next month, so the watch can start it at zero before the iPhone syncs. */
  nextMonth: {
    monthKey: string
    monthName: string
    goalHours: number
    showsTimeEntry: boolean
  }
  /**
   * Watch entries this snapshot already counts although the iPhone hasn't
   * reported them resolved yet, so the watch doesn't count them twice.
   */
  reflectedEntryIds: string[]
  upNext: WatchUpNextItem[]
  categories: { id: string; name: string; isCredit: boolean }[]
  strings: Record<string, string>
}

export type BuildWatchSnapshotArgs = BuildReportArgs & {
  showsTimeEntry: boolean
  categories: Category[]
  contacts: Contact[]
  nextMonth: { publisher: Publisher; showsTimeEntry: boolean }
  reflectedEntryIds?: string[]
}

/** Same pace line as the Report widget's badge. */
function paceText(report: ReportFields): string | null {
  if (report.goalHours <= 0) return null
  if (report.aheadBehindMinutes != null) {
    return i18n.t(
      report.aheadBehindMinutes >= 0 ? 'aheadOfSchedule' : 'behindSchedule'
    )
  }
  if (report.hoursPerDayNeeded != null) {
    const perDay = formatMinutesCompact(
      Math.round(report.hoursPerDayNeeded * 60)
    )
    return `${perDay} ${i18n.t('hoursPerDayToGoal')}`
  }
  return null
}

const monthKeyOf = (m: moment.Moment) =>
  `${m.year()}-${String(m.month() + 1).padStart(2, '0')}`

export function buildWatchSnapshot(
  args: BuildWatchSnapshotArgs
): WatchSnapshot {
  const report = buildReport(args)
  const now = moment()
  const next = now.clone().add(1, 'month').startOf('month')

  const plannedThroughDay = plannedMinutesThroughEachDayOfMonth(
    now.month(),
    now.year(),
    args.dayPlans,
    args.recurringPlans
  )

  return {
    version: WATCH_SNAPSHOT_VERSION,
    generatedAt: Date.now(),
    monthKey: monthKeyOf(now),
    monthName: now.format('MMMM'),
    showsTimeEntry: args.showsTimeEntry,
    entryMode: report.mode,
    monthFormatted: report.monthHoursFormatted,
    monthCompact:
      report.monthMinutes > 0
        ? formatMinutesCompact(report.monthMinutes)
        : formatMinutesCompact(0, { unit: 'hours' }),
    monthMinutes: report.monthMinutes,
    goalHours: report.goalHours,
    progress: report.progress,
    plannedThroughDay: plannedThroughDay.at(-1) ? plannedThroughDay : null,
    publisherState: report.publisherState,
    paceText: paceText(report),
    nextMonth: {
      monthKey: monthKeyOf(next),
      monthName: next.format('MMMM'),
      goalHours: resolveMonthlyGoalHours(
        args.publisherHours[args.nextMonth.publisher],
        args.monthlyGoalOverrides,
        { year: next.year(), month: next.month() }
      ),
      showsTimeEntry: args.nextMonth.showsTimeEntry,
    },
    reflectedEntryIds: args.reflectedEntryIds ?? [],
    upNext: buildUpNext({
      contacts: args.contacts,
      conversations: args.conversations,
      dayPlans: args.dayPlans,
      recurringPlans: args.recurringPlans,
      categories: args.categories,
      includePlans: args.showsTimeEntry,
    }),
    categories: args.categories.map(({ id, name, isCredit }) => ({
      id,
      name,
      isCredit,
    })),
    strings: Object.fromEntries(
      watchStringKeys.strings.map((key) => [key, i18n.t(key as TranslationKey)])
    ),
  }
}
