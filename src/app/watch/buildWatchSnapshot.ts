import moment from 'moment'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'
import { plannedMinutesThroughEachDayOfMonth } from '@/lib/recurrence'
import { resolveMonthlyGoalHours } from '@/lib/monthlyGoals'
import { categoryLabel } from '@/lib/planTypeLabel'
import { loggedMinutesThroughEachDayOfMonth } from '@/lib/scheduleStatus'
import {
  buildReport,
  BuildReportArgs,
  ReportFields,
} from '@/app/widgets/buildReport'
import { buildUpNext, WatchUpNextItem } from '@/app/watch/buildUpNext'
import { Category } from '@/types/category'
import type { DistanceUnit, Trip, Vehicle } from '@/types/mileage'
import { defaultVehicleId } from '@/lib/mileage/calc'
import { Contact } from '@/types/contact'
import { Publisher } from '@/types/publisher'
import watchStringKeys from '@/app/watch/watchStringKeys.json'
import type { NativeLocale } from '@/lib/nativeLocale'

export const WATCH_SNAPSHOT_VERSION = 1

export type WatchSnapshot = {
  version: number

  generatedAt: number

  monthKey: string

  monthName: string

  showsTimeEntry: boolean
  entryMode: ReportFields['mode']

  monthFormatted: string
  monthCompact: string

  monthMinutes: number
  goalHours: number
  progress: number

  plannedThroughDay: number[] | null

  loggedThroughDay: number[] | null
  publisherState: ReportFields['publisherState']
  paceText: string | null

  nextMonth: {
    monthKey: string
    monthName: string
    goalHours: number
    showsTimeEntry: boolean
  }

  reflectedEntryIds: string[]
  upNext: WatchUpNextItem[]
  categories: { id: string; name: string; isCredit: boolean }[]

  mileage: {
    enabled: boolean
    distanceUnit: DistanceUnit

    vehicles: { id: string; name: string }[]
  }
  strings: Record<string, string>

  rtl: NativeLocale['rtl']

  numberLocale: NativeLocale['numberLocale']
}

export type BuildWatchSnapshotArgs = BuildReportArgs & {
  platform: 'ios' | 'android'
  showsTimeEntry: boolean
  categories: Category[]
  contacts: Contact[]
  nextMonth: { publisher: Publisher; showsTimeEntry: boolean }
  reflectedEntryIds?: string[]
  mileageTrackingEnabled: boolean | undefined
  distanceUnit: DistanceUnit
  vehicles: Vehicle[]
  trips: Trip[]

  nativeLocale: NativeLocale
}

function activeVehicles(vehicles: Vehicle[], trips: Trip[]) {
  const firstId = defaultVehicleId(trips, vehicles)
  return vehicles
    .filter((v) => !v.archived)
    .sort((a, b) => Number(b.id === firstId) - Number(a.id === firstId))
    .map(({ id, name }) => ({ id, name }))
}

function watchStrings(platform: BuildWatchSnapshotArgs['platform']) {
  const keys =
    platform === 'android'
      ? [...watchStringKeys.strings, ...watchStringKeys.wearStrings]
      : watchStringKeys.strings
  const androidVariants = new Set(
    platform === 'android' ? watchStringKeys.androidVariants : []
  )
  return Object.fromEntries(
    keys.map((key) => [
      key,
      i18n.t(
        (androidVariants.has(key) ? `${key}Android` : key) as TranslationKey
      ),
    ])
  )
}

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
    return i18n.t('hoursPerDayToGoalValue', { value: perDay })
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
  const hasPlans = !!plannedThroughDay.at(-1)

  return {
    version: WATCH_SNAPSHOT_VERSION,
    generatedAt: Date.now(),
    monthKey: monthKeyOf(now),
    monthName: now.format('MMMM'),
    showsTimeEntry: args.showsTimeEntry,
    entryMode: report.mode,

    monthFormatted: formatMinutes(report.monthMinutes, args.timeDisplayFormat)
      .formatted,
    monthCompact:
      report.monthMinutes > 0
        ? formatMinutesCompact(report.monthMinutes)
        : formatMinutesCompact(0, { unit: 'hours' }),
    monthMinutes: report.monthMinutes,
    goalHours: report.goalHours,
    progress: report.progress,
    plannedThroughDay: hasPlans ? plannedThroughDay : null,
    loggedThroughDay: hasPlans
      ? loggedMinutesThroughEachDayOfMonth({
          month: now.month(),
          year: now.year(),
          serviceReports: args.serviceReports,
          publisher: args.publisher,
          creditLimit: {
            enabled: args.overrideCreditLimit,
            customLimitHours: args.customCreditLimitHours,
          },
        })
      : null,
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

    categories: args.categories.map((category) => ({
      id: category.id,
      name: categoryLabel(category),
      isCredit: category.isCredit,
    })),
    mileage: {
      enabled: args.mileageTrackingEnabled !== false,
      distanceUnit: args.distanceUnit,
      vehicles: activeVehicles(args.vehicles, args.trips),
    },
    strings: watchStrings(args.platform),
    rtl: args.nativeLocale.rtl,
    numberLocale: args.nativeLocale.numberLocale,
  }
}
