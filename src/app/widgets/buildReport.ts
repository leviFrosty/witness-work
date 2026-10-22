import moment from 'moment'
import { localDayKey, storedDayKey } from '@/lib/normalizeDate'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  isCountableEntry,
} from '@/lib/serviceReport'
import { RecurringPlan } from '@/lib/recurrence'
import { getScheduleStatusForMonth } from '@/lib/scheduleStatus'
import { goalProgress } from '@/lib/goalProgress'
import { formatMinutes } from '@/lib/minutes'
import { dailyPace } from '@/features/progress/lib/progressCardStats'
import { formatNeededMinutes } from '@/features/progress/components/cards/displayMinutes'
import { contentHash } from '@/lib/contentHash'
import { isOwnVisit } from '@/lib/conversations'
import { getStudiesForGivenMonth } from '@/lib/contacts'
import i18n, { TranslationKey } from '@/lib/locales'
import { Publisher, PublisherHours } from '@/types/publisher'
import { getEntryMode } from '@/lib/publisherCapabilities'
import {
  DayPlan,
  MinuteDisplayFormat,
  TimeEntriesByYear,
} from '@/types/timeEntry'
import { Visit } from '@/types/visit'
import { Contact } from '@/types/contact'
import {
  resolveMonthlyGoalHours,
  type MonthlyGoalOverrides,
} from '@/lib/monthlyGoals'

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
   * Hours per day to the goal as the Daily Pace card counts them as of `now`,
   * rounded up to a tenth, for the watch's pace line (which counts the same way
   * after midnight). `null` once the goal needs nothing more.
   */
  hoursPerDayNeeded: number | null
  /**
   * Minutes ahead (+) or behind (-) of plan. `null` when no plan exists for
   * this month, in which case the widget falls back to
   * `hoursPerDayToGoalByDay`.
   */
  aheadBehindMinutes: number | null
  /**
   * The pace badge's "4.8 Hrs per day to goal!" for each day from `now` to the
   * end of its month, keyed `YYYY-MM-DD`, as the Daily Pace card counts and
   * formats it. The widget reads the entry for its own day, so it neither
   * counts days nor formats time. A day is missing once the goal needs nothing
   * more.
   */
  hoursPerDayToGoalByDay: Record<string, string>

  // Checkbox/publisher mode
  /** True when at least one service report exists for the current month. */
  hasReportedThisMonth: boolean
  /** Publisher state machine value. Only meaningful when `mode === 'checkbox'`. */
  publisherState: PublisherState
  /**
   * Number of the User's own conversations recorded this calendar month: Visits
   * where someone was home (not Not at Home), and not ones that came with a
   * shared Contact.
   */
  monthConversationCount: number
  /**
   * Number of distinct bible studies the User held this calendar month, counted
   * as the Service Report counts them (`getStudiesForGivenMonth`).
   */
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
  monthlyGoalOverrides: MonthlyGoalOverrides
  overrideCreditLimit: boolean
  customCreditLimitHours: number
  timeDisplayFormat: MinuteDisplayFormat
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  contacts: Contact[]
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

/**
 * One phrase a day per pool, so an unchanged snapshot hashes the same and isn't
 * rewritten (and the widget reloaded) just for a new phrase.
 */
function pickEncouragementPhrase(progress: number, now: moment.Moment): string {
  let pool: readonly TranslationKey[]
  if (progress >= 1) pool = PHRASES_DONE
  else if (progress >= 0.6) pool = PHRASES_CLOSE
  else pool = PHRASES_FAR

  const index =
    parseInt(contentHash(now.format('YYYY-MM-DD')), 36) % pool.length
  return i18n.t(pool[index])
}

/**
 * The report as of `now`; the widget snapshot also builds next month's first
 * day.
 */
export function buildReport(
  args: BuildReportArgs,
  now: moment.Moment = moment()
): ReportFields {
  const month = now.month()
  const year = now.year()

  const monthReports = getMonthsReports(args.serviceReports, month, year)
  const sharedReports = monthReports.filter(isCountableEntry)
  const hasReportedThisMonth = sharedReports.length > 0
  const todayKey = localDayKey(now)
  const hasReportedToday = sharedReports.some(
    (r) => storedDayKey(r.date) === todayKey
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

  const goalHours = resolveMonthlyGoalHours(
    args.publisherHours[args.publisher],
    args.monthlyGoalOverrides,
    { month, year }
  )
  const goalMinutes = goalHours * 60
  // No goal (Regular Publisher, or a 0-hour custom goal) means nothing to make
  // progress toward — report 0 rather than the helper's "done" clamp so the
  // encouragement phrase doesn't read "Goal achieved!" every refresh.
  const progress =
    goalMinutes > 0
      ? goalProgress({
          minutes: adjusted.value,
          goalMinutes,
        }).fraction
      : 0

  const formatted = formatMinutes(adjusted.value, args.timeDisplayFormat)
  const monthHoursFormatted =
    args.timeDisplayFormat === 'decimal'
      ? formatted.decimalHours.toString()
      : formatted.formatted

  // The Daily Pace card's time per day as of `now`, rounded up to a tenth of
  // an hour as `formatNeededMinutes` does, so keeping to it is enough.
  const todaysPace = dailyPace({
    loggedMinutes: adjusted.value,
    goalMinutes,
    month,
    year,
    today: now,
  })
  const hoursPerDayNeeded =
    todaysPace?.state === 'current'
      ? Math.ceil(todaysPace.perDayMinutes / 6) / 10
      : null

  const hoursPerDayToGoalByDay: Record<string, string> = {}
  for (
    const day = now.clone().startOf('day');
    day.month() === month;
    day.add(1, 'day')
  ) {
    const pace = dailyPace({
      loggedMinutes: adjusted.value,
      goalMinutes,
      month,
      year,
      today: day,
    })
    if (pace?.state !== 'current') break
    hoursPerDayToGoalByDay[day.format('YYYY-MM-DD')] = i18n.t(
      'hoursPerDayToGoalValue',
      {
        value: formatNeededMinutes(pace.perDayMinutes, args.timeDisplayFormat),
      }
    )
  }

  // Same Schedule Status as the app's pace cards: time logged through today
  // against Plans through today.
  const scheduleStatus = getScheduleStatusForMonth({
    month,
    year,
    today: now.toDate(),
    serviceReports: args.serviceReports,
    dayPlans: args.dayPlans,
    recurringPlans: args.recurringPlans,
    publisher: args.publisher,
    creditLimit: {
      enabled: args.overrideCreditLimit,
      customLimitHours: args.customCreditLimitHours,
    },
  })
  const aheadBehindMinutes =
    scheduleStatus.plannedMinutes > 0 ? scheduleStatus.differenceMinutes : null

  // --- Publisher (checkbox) state machine + month conversation/study counts
  const publisherState: PublisherState = !hasReportedThisMonth
    ? 'unreported'
    : hasReportedToday
      ? 'reportedToday'
      : 'reportedThisMonth'

  const monthStart = now.clone().startOf('month').valueOf()
  const monthEnd = now.clone().endOf('month').valueOf()
  // A Not at Home is an attempt, not a conversation (CONTEXT.md), as Progress
  // and Badges count it. Compared as instants: parsing every visit with moment
  // was most of a snapshot's cost on an account with years of visits.
  const monthConversationCount = args.conversations.filter((c) => {
    if (!isOwnVisit(c) || c.notAtHome) return false
    const time = new Date(c.date).getTime()
    return time >= monthStart && time <= monthEnd
  }).length
  // The same figure Home's Studies card and the Service Report show.
  const monthBibleStudyCount = getStudiesForGivenMonth({
    contacts: args.contacts,
    conversations: args.conversations,
    month: now.toDate(),
  })

  return {
    mode: getEntryMode(args.publisher),
    monthMinutes: adjusted.value,
    monthHoursFormatted,
    goalHours,
    progress,
    hoursPerDayNeeded,
    aheadBehindMinutes,
    hoursPerDayToGoalByDay,
    hasReportedThisMonth,
    publisherState,
    monthConversationCount,
    monthBibleStudyCount,
    encouragementPhrase: pickEncouragementPhrase(progress, now),
  }
}
