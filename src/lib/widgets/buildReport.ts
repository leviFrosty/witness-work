import _ from 'lodash'
import moment from 'moment'
import {
  adjustedMinutesForSpecificMonth,
  calculateMinutesRemaining,
  calculateProgress,
  getDaysLeftInCurrentMonth,
  getMonthsReports,
  plannedMinutesToCurrentDayForMonth,
  RecurringPlan,
} from '../serviceReport'
import { formatMinutes } from '../minutes'
import i18n, { TranslationKey } from '../locales'
import { Publisher, PublisherHours } from '../../types/publisher'
import {
  DayPlan,
  MinuteDisplayFormat,
  ServiceReportsByYears,
} from '../../types/serviceReport'

export type ReportMode = 'hours' | 'checkbox'

export type ReportFields = {
  /** `'checkbox'` for `publisher === 'publisher'`, `'hours'` otherwise. */
  mode: ReportMode

  // Hours mode
  monthMinutes: number
  /** Pre-formatted display value matching the user's timeDisplayFormat. */
  monthHoursFormatted: string
  goalHours: number
  /** 0..1 */
  progress: number
  /**
   * Hours per remaining day to hit the goal. `null` when there's nothing left
   * to do or the value would be misleading (last day of month, already met).
   */
  hoursPerDayNeeded: number | null
  /**
   * Minutes ahead (+) or behind (-) of plan. `null` when no plan exists for
   * this month, in which case the widget falls back to `hoursPerDayNeeded`.
   */
  aheadBehindMinutes: number | null

  // Checkbox mode
  /** True when at least one service report exists for the current month. */
  hasReportedThisMonth: boolean

  /**
   * Pre-picked encouragement phrase for the current `progress` bucket. Picked
   * randomly per snapshot write so the widget rotates messaging on each refresh
   * without needing Swift-side randomness or i18n.
   */
  encouragementPhrase: string
}

export type BuildReportArgs = {
  serviceReports: ServiceReportsByYears
  publisher: Publisher
  publisherHours: PublisherHours
  overrideCreditLimit: boolean
  customCreditLimitHours: number
  timeDisplayFormat: MinuteDisplayFormat
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}

/**
 * I18n keys for encouragement phrases — kept in sync with the bucketing in
 * `HourEntryCard.tsx`. Duplicated by design (the widget pre-translates) so
 * touching this list doesn't risk regressing the in-app card.
 */
const PHRASES_FAR: readonly TranslationKey[] = [
  'phrasesFar.keepGoing',
  'phrasesFar.youCanDoThis',
  'phrasesFar.neverGiveUp',
  'phrasesFar.preachTheWord',
  'phrasesFar.stayFocused',
  'phrasesFar.haveFaith',
  'phrasesFar.stayStrong',
  'phrasesFar.everyStepCounts',
  'phrasesFar.youGotThis',
  'phrasesFar.timeToShine',
  'phrasesFar.makingProgress',
  'phrasesFar.greatStart',
  'phrasesFar.keepItUp',
  'phrasesFar.momentumBuilding',
  'phrasesFar.onYourWay',
  'phrasesFar.smallStepsBigResults',
]

const PHRASES_CLOSE: readonly TranslationKey[] = [
  'phrasesClose.oneStepCloser',
  'phrasesClose.almostThere',
  'phrasesClose.keepMovingForward',
  'phrasesClose.successOnTheHorizon',
  'phrasesClose.momentumIsYours',
  'phrasesClose.nearingAchievement',
  'phrasesClose.youreClosingIn',
  'phrasesClose.closerThanEver',
  'phrasesClose.homeStretch',
  'phrasesClose.finishStrong',
  'phrasesClose.soClose',
  'phrasesClose.finalPush',
  'phrasesClose.youreOnFire',
  'phrasesClose.pushThroughToday',
  'phrasesClose.goalInSight',
  'phrasesClose.crushingIt',
  'phrasesClose.unstoppable',
  'phrasesClose.powerThrough',
]

const PHRASES_DONE: readonly TranslationKey[] = [
  'phrasesDone.youDidIt',
  'phrasesDone.goalAchieved',
  'phrasesDone.youNailedIt',
  'phrasesDone.congratulations',
  'phrasesDone.takeYourShoesOff',
  'phrasesDone.hatsOffToYou',
  'phrasesDone.missionComplete',
  'phrasesDone.success',
  'phrasesDone.phenomenal',
  'phrasesDone.excellent',
  'phrasesDone.outstanding',
  'phrasesDone.incredible',
  'phrasesDone.amazingWork',
  'phrasesDone.goalCrushed',
  'phrasesDone.victorious',
  'phrasesDone.fantastic',
  'phrasesDone.wellDone',
  'phrasesDone.superb',
  'phrasesDone.keepGoingStrong',
  'phrasesDone.onARoll',
]

function pickEncouragementPhrase(progress: number): string {
  let pool: readonly TranslationKey[]
  if (progress >= 1) pool = PHRASES_DONE
  else if (progress >= 0.6) pool = PHRASES_CLOSE
  else pool = PHRASES_FAR

  const key = pool[Math.floor(Math.random() * pool.length)]
  return i18n.t(key)
}

export function buildReport(args: BuildReportArgs): ReportFields {
  const month = moment().month()
  const year = moment().year()

  const monthReports = getMonthsReports(args.serviceReports, month, year)
  const hasReportedThisMonth = monthReports.length > 0

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

  const minutesRemaining = calculateMinutesRemaining({
    minutes: adjusted.value,
    goalHours,
  })
  const daysLeftInMonth = getDaysLeftInCurrentMonth()

  // Mirrors HourEntryCard's hoursPerDayNeeded calc, but null when ≤ 0 so the
  // widget can hide the badge entirely instead of rendering "0 hrs/day".
  let hoursPerDayNeeded: number | null
  if (minutesRemaining <= 0) {
    hoursPerDayNeeded = null
  } else if (daysLeftInMonth === 0) {
    hoursPerDayNeeded = minutesRemaining / 60
  } else {
    hoursPerDayNeeded = _.round(minutesRemaining / 60 / daysLeftInMonth, 1)
  }

  const plannedMinutesToCurrentDay = plannedMinutesToCurrentDayForMonth(
    month,
    year,
    args.dayPlans,
    args.recurringPlans
  )
  const aheadBehindMinutes =
    plannedMinutesToCurrentDay > 0
      ? adjusted.value - plannedMinutesToCurrentDay
      : null

  return {
    mode: args.publisher === 'publisher' ? 'checkbox' : 'hours',
    monthMinutes: adjusted.value,
    monthHoursFormatted,
    goalHours,
    progress,
    hoursPerDayNeeded,
    aheadBehindMinutes,
    hasReportedThisMonth,
    encouragementPhrase: pickEncouragementPhrase(progress),
  }
}
