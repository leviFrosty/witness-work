import moment from 'moment'
import { Publisher, PublisherHours } from '../../types/publisher'
import {
  MinuteDisplayFormat,
  ServiceReportsByYears,
} from '../../types/serviceReport'
import {
  adjustedMinutesForSpecificMonth,
  calculateProgress,
  getMonthsReports,
} from '../serviceReport'
import { formatMinutes } from '../minutes'
import i18n from '../locales'

/**
 * Bumped whenever the snapshot shape changes in a way the Swift decoder cares
 * about. Swift can compare and refuse to render stale shapes.
 */
export const SNAPSHOT_VERSION = 1

export type WidgetSnapshot = {
  version: number
  /** Epoch ms when the snapshot was produced. */
  updatedAt: number
  /** App locale at write time, e.g. 'en-us'. */
  locale: string
  /**
   * Pre-translated display strings. The widget never calls i18n; the JS side
   * resolves every label and writes the result so SwiftUI can render the user's
   * chosen locale without duplicating translation infrastructure.
   */
  strings: {
    monthHoursLabel: string
    goalLabel: string
  }
  /** Current month hours for the hours widget. */
  hours: {
    monthMinutes: number
    /** Pre-formatted display value matching the user's timeDisplayFormat. */
    monthHoursFormatted: string
    goalHours: number
    /** 0..1 */
    progress: number
  }
  // Future: contacts, publisher checkbox, etc.
}

export type BuildSnapshotArgs = {
  serviceReports: ServiceReportsByYears
  publisher: Publisher
  publisherHours: PublisherHours
  overrideCreditLimit: boolean
  customCreditLimitHours: number
  timeDisplayFormat: MinuteDisplayFormat
  locale: string
}

export function buildWidgetSnapshot(args: BuildSnapshotArgs): WidgetSnapshot {
  const month = moment().month()
  const year = moment().year()

  const monthReports = getMonthsReports(args.serviceReports, month, year)

  const adjusted = adjustedMinutesForSpecificMonth(
    monthReports,
    month,
    year,
    args.publisher,
    {
      enabled: args.overrideCreditLimit,
      customLimitHours: args.customCreditLimitHours,
    }
  )

  const goalHours = args.publisherHours[args.publisher]
  const progress = calculateProgress({
    minutes: adjusted.value,
    goalHours,
  })

  const formatted = formatMinutes(adjusted.value, args.timeDisplayFormat)
  const monthHoursFormatted =
    args.timeDisplayFormat === 'decimal'
      ? formatted.decimalHours.toString()
      : formatted.formatted

  return {
    version: SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    locale: args.locale,
    strings: {
      monthHoursLabel: i18n.t('hours'),
      goalLabel: i18n.t('goal'),
    },
    hours: {
      monthMinutes: adjusted.value,
      monthHoursFormatted,
      goalHours,
      progress,
    },
  }
}
