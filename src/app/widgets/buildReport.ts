import _ from 'lodash'
import moment from 'moment'
import {
  adjustedMinutesForSpecificMonth,
  getDaysLeftInCurrentMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import {
  plannedMinutesToCurrentDayForMonth,
  RecurringPlan,
} from '@/lib/recurrence'
import { goalProgress } from '@/lib/goalProgress'
import { formatMinutes } from '@/lib/minutes'
import i18n, { TranslationKey } from '@/lib/locales'
import { Publisher, PublisherHours } from '@/types/publisher'
import { getEntryMode } from '@/lib/publisherCapabilities'
import {
  DayPlan,
  MinuteDisplayFormat,
  TimeEntriesByYear,
} from '@/types/timeEntry'
import { Visit } from '@/types/visit'

export type ReportMode = 'hours' | 'checkbox'

/**
 * State machine for the publisher (`publisher === 'publisher'`) variant of the
 * report widget. Drives whether the widget shows the "Shared the Good News"
 * checkbox, a celebratory just-reported card, or a summary of this month's
 * conversations + studies.
 */
export type PublisherState =
  | 'unreported'
  | 'reportedToday'
  | 'reportedThisMonth'

export type ReportFields = {
  /** `'checkbox'` for `publisher === 'publisher'`, `'hours'` otherwise. */
  mode: ReportMode

  // Hours mode — month
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

  // Checkbox/publisher mode
  /** True when at least one service report exists for the current month. */
  hasReportedThisMonth: boolean
  /** Publisher state machine value. Only meaningful when `mode === 'checkbox'`. */
  publisherState: PublisherState
  /** Number of conversations recorded this calendar month. */
  monthConversationCount: number
  /** Number of distinct bible studies held this calendar month. */
  monthBibleStudyCount: number

  /**
   * Pre-picked encouragement phrase for the current `progress` bucket. Picked
   * randomly per snapshot write so the widget rotates messaging on each refresh
   * without needing Swift-side randomness or i18n.
   */
  encouragementPhrase: string
}

export type BuildReportArgs = {
  serviceReports: TimeEntriesByYear
  publisher: Publisher
  publisherHours: PublisherHours
  overrideCreditLimit: boolean
  customCreditLimitHours: number
  timeDisplayFormat: MinuteDisplayFormat
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  conversations: Visit[]
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
  const now = moment()
  const month = now.month()
  const year = now.year()

  const monthReports = getMonthsReports(args.serviceReports, month, year)
  const hasReportedThisMonth = monthReports.length > 0
  const hasReportedToday = monthReports.some((r) =>
    moment(r.date).isSame(now, 'day')
  )

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
  const goalMinutes = goalHours * 60
  const progress = goalProgress({
    minutes: adjusted.value,
    goalMinutes,
  }).fraction

  const formatted = formatMinutes(adjusted.value, args.timeDisplayFormat)
  const monthHoursFormatted =
    args.timeDisplayFormat === 'decimal'
      ? formatted.decimalHours.toString()
      : formatted.formatted

  const minutesRemaining = goalProgress({
    minutes: adjusted.value,
    goalMinutes,
  }).remaining
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

  // --- Publisher (checkbox) state machine + month conversation/study counts
  const publisherState: PublisherState = !hasReportedThisMonth
    ? 'unreported'
    : hasReportedToday
      ? 'reportedToday'
      : 'reportedThisMonth'

  const monthStart = now.clone().startOf('month')
  const monthEnd = now.clone().endOf('month')
  const conversationsThisMonth = args.conversations.filter((c) =>
    moment(c.date).isBetween(monthStart, monthEnd, undefined, '[]')
  )
  const monthConversationCount = conversationsThisMonth.length
  const monthBibleStudyCount = new Set(
    conversationsThisMonth
      .filter((c) => c.isBibleStudy)
      .map((c) => c.contact.id)
  ).size

  return {
    mode: getEntryMode(args.publisher),
    monthMinutes: adjusted.value,
    monthHoursFormatted,
    goalHours,
    progress,
    hoursPerDayNeeded,
    aheadBehindMinutes,
    hasReportedThisMonth,
    publisherState,
    monthConversationCount,
    monthBibleStudyCount,
    encouragementPhrase: pickEncouragementPhrase(progress),
  }
}
