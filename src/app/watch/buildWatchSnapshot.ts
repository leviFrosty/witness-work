import moment from 'moment'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatMinutesCompact } from '@/lib/minutes'
import {
  buildReport,
  BuildReportArgs,
  ReportFields,
} from '@/app/widgets/buildReport'
import { Category } from '@/types/category'
import type { DistanceUnit, Trip, Vehicle } from '@/types/mileage'
import { defaultVehicleId } from '@/lib/mileage/calc'
import watchStringKeys from '@/app/watch/watchStringKeys.json'

/**
 * Bumped when the shape changes in a way the watch's Swift decoder cares about.
 * Mirrors `WatchSnapshot.supportedVersion` in
 * `modules/watch-bridge/ios/WatchProtocol.swift`.
 */
export const WATCH_SNAPSHOT_VERSION = 1

/**
 * What the Apple Watch app and its complications show, and what Siri needs on
 * the watch and on this device. Mirrors `WatchSnapshot` in
 * `WatchProtocol.swift`. Strings are translated into the app's language and
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
  paceText: string | null
  categories: { id: string; name: string }[]
  /** What Siri needs to log a trip. */
  mileage: {
    /** Mileage Tracking isn't turned off. */
    enabled: boolean
    distanceUnit: DistanceUnit
    /** Cars that aren't archived, the one a new trip uses first. */
    vehicles: { id: string; name: string }[]
  }
  strings: Record<string, string>
}

export type BuildWatchSnapshotArgs = BuildReportArgs & {
  showsTimeEntry: boolean
  categories: Category[]
  mileageTrackingEnabled: boolean | undefined
  distanceUnit: DistanceUnit
  vehicles: Vehicle[]
  trips: Trip[]
}

function activeVehicles(vehicles: Vehicle[], trips: Trip[]) {
  const firstId = defaultVehicleId(trips, vehicles)
  return vehicles
    .filter((v) => !v.archived)
    .sort((a, b) => Number(b.id === firstId) - Number(a.id === firstId))
    .map(({ id, name }) => ({ id, name }))
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
    paceText: paceText(report),
    categories: args.categories.map(({ id, name }) => ({ id, name })),
    mileage: {
      enabled: args.mileageTrackingEnabled !== false,
      distanceUnit: args.distanceUnit,
      vehicles: activeVehicles(args.vehicles, args.trips),
    },
    strings: Object.fromEntries(
      watchStringKeys.strings.map((key) => [key, i18n.t(key as TranslationKey)])
    ),
  }
}
