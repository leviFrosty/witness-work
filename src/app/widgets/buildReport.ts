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

export type PublisherState =
  | 'unreported'
  | 'reportedToday'
  | 'reportedThisMonth'

export type ReportFields = {
  mode: ReportMode

  monthMinutes: number

  monthHoursFormatted: string
  goalHours: number

  progress: number

  hoursPerDayNeeded: number | null

  aheadBehindMinutes: number | null

  hoursPerDayToGoalByDay: Record<string, string>

  hasReportedThisMonth: boolean

  publisherState: PublisherState

  monthConversationCount: number

  monthBibleStudyCount: number

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

function pickEncouragementPhrase(progress: number, now: moment.Moment): string {
  let pool: readonly TranslationKey[]
  if (progress >= 1) pool = PHRASES_DONE
  else if (progress >= 0.6) pool = PHRASES_CLOSE
  else pool = PHRASES_FAR

  const index =
    parseInt(contentHash(now.format('YYYY-MM-DD')), 36) % pool.length
  return i18n.t(pool[index])
}

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

  const publisherState: PublisherState = !hasReportedThisMonth
    ? 'unreported'
    : hasReportedToday
      ? 'reportedToday'
      : 'reportedThisMonth'

  const monthStart = now.clone().startOf('month').valueOf()
  const monthEnd = now.clone().endOf('month').valueOf()

  const monthConversationCount = args.conversations.filter((c) => {
    if (!isOwnVisit(c) || c.notAtHome) return false
    const time = new Date(c.date).getTime()
    return time >= monthStart && time <= monthEnd
  }).length

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
