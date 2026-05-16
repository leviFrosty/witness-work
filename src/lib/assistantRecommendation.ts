import moment from 'moment'
import type { Visit } from '@/types/visit'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'
import type { AssistantEvent, RecommendationShape } from '@/types/assistant'
import { momentStoredDate, normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  getEffectiveMinutesForRecurringPlan,
  getPlansIntersectingDay,
} from '@/lib/serviceReport'

export type {
  AssistantAction,
  AssistantEvent,
  RecommendationShape,
} from '@/types/assistant'

export type ReasonCode =
  | 'small_gap_one_focused_plan'
  | 'spread_to_sustainable_pace'
  | 'pattern_fits_over_horizon'
  | 'stretched_for_short_horizon'
  | 'rest_recommended_then_resume'
  | 'layered_on_conversation_days'
  | 'best_effort_unreachable_goal'

export type ProposedDayPlan = {
  date: Date
  minutes: number
}

export type Recommendation = {
  shape: RecommendationShape
  plans: ProposedDayPlan[]
  headline: {
    code: `shape.${RecommendationShape}`
    values: {
      hours?: number
      days?: number
      day?: string
      weekdayList?: string
      weeks?: number
    }
  }
  rationale: {
    code: ReasonCode
    values: Record<string, number | string>
  }
}

export type EngineParams = {
  softMaxHoursPerDay: number
  stretchMaxHoursPerDay: number
  absoluteMaxHoursPerDay: number
  maxConsecutiveStretchDays: number
  minRestDayCadence: number
  minChunkHours: number
  tirednessLookbackDays: number
  tirednessThresholdHours: number
  recurringMinHorizonDays: number
  /**
   * Soft per-day cap for days the user marked as meeting days (Kingdom Hall
   * meetings). Used when a meeting day is unavoidable but still preferable to
   * keep light.
   */
  meetingDaySoftMaxHoursPerDay: number
  /**
   * Absolute per-day cap for meeting days. Even in best-effort/unreachable
   * paths the engine will not propose more than this on a meeting day.
   */
  meetingDayAbsoluteMaxHoursPerDay: number
}

export const DEFAULT_ENGINE_PARAMS: EngineParams = {
  softMaxHoursPerDay: 4,
  stretchMaxHoursPerDay: 6,
  absoluteMaxHoursPerDay: 8,
  maxConsecutiveStretchDays: 3,
  minRestDayCadence: 1,
  minChunkHours: 1,
  tirednessLookbackDays: 3,
  tirednessThresholdHours: 12,
  recurringMinHorizonDays: 14,
  meetingDaySoftMaxHoursPerDay: 2,
  meetingDayAbsoluteMaxHoursPerDay: 3,
}

export type EngineInput = {
  year: number
  month: number
  today: Date
  monthlyGoalHours: number
  loggedAdjustedMinutes: number
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  conversations: Visit[]
  /**
   * Off Days the user wants the engine to treat as a hard exclusion when
   * generating a recommendation. Today stored as weekday numbers (0–6); the
   * concept covers any day.
   */
  offDays: number[]
  /**
   * Meeting Days — days the user attends a Kingdom Hall meeting. The engine
   * prefers non-meeting days, and when it has to use a meeting day it caps the
   * proposed session at the meeting-day cap. A day present in both `offDays`
   * and `meetingDays` is treated as an Off Day (stricter wins). Today stored as
   * weekday numbers (0–6).
   */
  meetingDays?: number[]
  assistantHistory: AssistantEvent[]
  /**
   * Total minutes logged within `tirednessLookbackDays` of `today` (not
   * including `today`). When this meets or exceeds the tiredness threshold the
   * engine pushes the first proposed day back by one eligible day and emits the
   * `rest_recommended_then_resume` rationale.
   */
  minutesLoggedInPriorDays?: number
  params?: Partial<EngineParams>
}

const futurePlannedMinutes = (
  year: number,
  month: number,
  today: Date,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): number => {
  const start = moment.utc({ year, month, day: 1 })
  const end = start.clone().endOf('month')
  const todayDay = momentStoredDate(normalizeDateForStorage(today))
  const cursor = (todayDay.isAfter(start, 'day') ? todayDay : start).clone()

  const dayPlanByKey = new Map(
    dayPlans.map((p) => [momentStoredDate(p.date).format('YYYY-MM-DD'), p])
  )

  let sum = 0
  while (cursor.isSameOrBefore(end, 'day')) {
    const key = cursor.format('YYYY-MM-DD')
    const dp = dayPlanByKey.get(key)
    if (dp) {
      sum += dp.minutes
    } else {
      const recurringForDay = getPlansIntersectingDay(
        cursor.toDate(),
        recurringPlans
      )
      const highest = recurringForDay.reduce(
        (max, plan) =>
          Math.max(
            max,
            getEffectiveMinutesForRecurringPlan(plan, cursor.toDate())
          ),
        0
      )
      sum += highest
    }
    cursor.add(1, 'day')
  }
  return sum
}

type EligibleDay = {
  m: moment.Moment
  /**
   * True when the user marked this weekday as a Kingdom Hall meeting day. Such
   * days are still eligible but are de-prioritised by the builders and capped
   * lower when used.
   */
  isMeetingDay: boolean
}

const eligibleDays = (
  year: number,
  month: number,
  today: Date,
  offDays: number[],
  meetingDays: number[],
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): EligibleDay[] => {
  const start = moment.utc({ year, month, day: 1 })
  const end = start.clone().endOf('month')
  const todayDay = momentStoredDate(normalizeDateForStorage(today))
  const cursor = (todayDay.isAfter(start, 'day') ? todayDay : start).clone()

  const dayPlanKeys = new Set(
    dayPlans.map((p) => momentStoredDate(p.date).format('YYYY-MM-DD'))
  )

  const days: EligibleDay[] = []
  while (cursor.isSameOrBefore(end, 'day')) {
    const weekday = cursor.day()
    const isOffDay = offDays.includes(weekday)
    const key = cursor.format('YYYY-MM-DD')
    const hasDayPlan = dayPlanKeys.has(key)
    const hasRecurring =
      getPlansIntersectingDay(cursor.toDate(), recurringPlans).length > 0
    if (!isOffDay && !hasDayPlan && !hasRecurring) {
      days.push({
        m: cursor.clone(),
        // Off Days already filtered out — meeting flag only matters for the
        // days that survived. This is also why `meetingDays ∩ offDays` never
        // reaches the engine: Off Day wins by virtue of filtering first.
        isMeetingDay: meetingDays.includes(weekday),
      })
    }
    cursor.add(1, 'day')
  }
  return days
}

type BuildContext = {
  gapMinutes: number
  /**
   * All eligible days from today through end-of-month (no DayPlan, no
   * recurring, not excluded). The horizon always extends to month-end —
   * proposed days can sit before or after the user's other commitments. Meeting
   * days remain in the pool but carry `isMeetingDay = true` so builders can
   * prefer non-meeting days and cap meeting-day sessions lower.
   */
  eligible: EligibleDay[]
  params: EngineParams
  conversationDayKeys: Set<string>
  tirednessTriggered: boolean
}

const buildConcentrated = (ctx: BuildContext): Recommendation | null => {
  const { gapMinutes, eligible, params, tirednessTriggered } = ctx
  const absoluteCapMinutes = params.absoluteMaxHoursPerDay * 60
  const meetingAbsoluteCapMinutes = params.meetingDayAbsoluteMaxHoursPerDay * 60
  if (gapMinutes > absoluteCapMinutes) return null
  if (eligible.length === 0) return null
  // Prefer the last non-meeting day so the user gets breathing room without
  // doubling-up on a Kingdom Hall day. Fall back to the last meeting day only
  // when the gap fits under the meeting-day cap.
  const lastNonMeeting = [...eligible].reverse().find((d) => !d.isMeetingDay)
  let day: EligibleDay
  if (lastNonMeeting) {
    day = lastNonMeeting
  } else {
    if (gapMinutes > meetingAbsoluteCapMinutes) return null
    day = eligible[eligible.length - 1]
  }
  const hours = Math.ceil(gapMinutes / 60)
  return {
    shape: 'concentrated',
    plans: [{ date: day.m.toDate(), minutes: gapMinutes }],
    headline: {
      code: 'shape.concentrated',
      values: { hours, day: day.m.format('YYYY-MM-DD') },
    },
    rationale: {
      code: tirednessTriggered
        ? 'rest_recommended_then_resume'
        : 'small_gap_one_focused_plan',
      values: { hours },
    },
  }
}

const buildDistributed = (ctx: BuildContext): Recommendation | null => {
  const { gapMinutes, eligible, params, conversationDayKeys } = ctx
  const stretchCapMinutes = params.stretchMaxHoursPerDay * 60
  const meetingSoftCapMinutes = params.meetingDaySoftMaxHoursPerDay * 60
  const meetingAbsoluteCapMinutes = params.meetingDayAbsoluteMaxHoursPerDay * 60
  if (eligible.length === 0) return null

  const nonMeetingPool = eligible.filter((d) => !d.isMeetingDay)
  const meetingPool = eligible.filter((d) => d.isMeetingDay)

  // Step 1: prefer non-meeting days. If the gap fits at stretchCap using only
  // non-meeting days, run the standard distributed algorithm against that
  // pool — meeting days are simply not proposed.
  const minDaysAtStretch = Math.max(
    2,
    Math.ceil(gapMinutes / stretchCapMinutes)
  )
  if (nonMeetingPool.length >= minDaysAtStretch) {
    return distributeAcrossNonMeetingPool(
      nonMeetingPool,
      gapMinutes,
      stretchCapMinutes,
      conversationDayKeys
    )
  }

  // Step 2: non-meeting capacity alone is insufficient. Mix in meeting days at
  // the meeting soft-cap. Each non-meeting day still carries stretchCap; each
  // meeting day carries meetingSoftCap (best-effort fallback uses
  // meetingAbsoluteCap).
  const nonMeetingCapacity = nonMeetingPool.length * stretchCapMinutes
  const remainderForMeeting = Math.max(0, gapMinutes - nonMeetingCapacity)
  const meetingDaysNeeded = Math.ceil(
    remainderForMeeting / meetingSoftCapMinutes
  )
  const meetingDaysAvailable = meetingPool.length

  if (meetingDaysNeeded <= meetingDaysAvailable) {
    // Hybrid path that *does* close the gap: non-meeting at stretchCap,
    // meeting days at meetingSoftCap (last meeting day absorbs the remainder).
    const chosenNonMeeting = pickEvenlySpacedDays(
      nonMeetingPool,
      nonMeetingPool.length,
      true
    )
    const chosenMeeting = pickEvenlySpacedDays(
      meetingPool,
      meetingDaysNeeded,
      true
    )
    const chosen = [...chosenNonMeeting, ...chosenMeeting].sort((a, b) =>
      a.m.isBefore(b.m) ? -1 : 1
    )
    const nSlots = chosen.length
    const totalNonMeeting = chosenNonMeeting.length * stretchCapMinutes
    const remainderOnMeeting = Math.max(0, gapMinutes - totalNonMeeting)
    const baseMeetingMinutes =
      meetingDaysNeeded > 0
        ? Math.min(
            meetingAbsoluteCapMinutes,
            Math.ceil(remainderOnMeeting / meetingDaysNeeded / 60) * 60
          )
        : 0
    const lastMeetingIdx = chosen.reduce(
      (acc, d, i) => (d.isMeetingDay ? i : acc),
      -1
    )
    const plans: ProposedDayPlan[] = chosen.map((d, i) => {
      if (!d.isMeetingDay) {
        return { date: d.m.toDate(), minutes: stretchCapMinutes }
      }
      if (i === lastMeetingIdx) {
        // Last meeting day absorbs any remainder so the total closes exactly,
        // bounded by the meeting absolute cap.
        const meetingTotalAllocatedSoFar =
          (meetingDaysNeeded - 1) * baseMeetingMinutes
        const remaining = Math.max(
          0,
          gapMinutes - totalNonMeeting - meetingTotalAllocatedSoFar
        )
        return {
          date: d.m.toDate(),
          minutes: Math.min(meetingAbsoluteCapMinutes, Math.max(60, remaining)),
        }
      }
      return { date: d.m.toDate(), minutes: baseMeetingMinutes }
    })
    const hoursAvg = Math.round(gapMinutes / nSlots / 60)
    return {
      shape: 'distributed',
      plans,
      headline: {
        code: 'shape.distributed',
        values: { hours: Math.max(1, hoursAvg), days: nSlots },
      },
      rationale: {
        code: 'spread_to_sustainable_pace',
        values: { hours: Math.max(1, hoursAvg), days: nSlots },
      },
    }
  }

  // Step 3: even with meeting days at softCap we can't close the gap. Fall
  // through to the original best-effort algorithm using every eligible day at
  // its per-day max (stretchCap for non-meeting, meetingAbsoluteCap for
  // meeting). Mirrors the previous unreachable-goal behaviour.
  const nSlots = eligible.length
  const chosen = eligible.slice().sort((a, b) => (a.m.isBefore(b.m) ? -1 : 1))
  const plans: ProposedDayPlan[] = chosen.map((d) => ({
    date: d.m.toDate(),
    minutes: d.isMeetingDay ? meetingAbsoluteCapMinutes : stretchCapMinutes,
  }))
  const hoursPerSlot = Math.round(
    plans.reduce((s, p) => s + p.minutes, 0) / nSlots / 60
  )
  return {
    shape: 'distributed',
    plans,
    headline: {
      code: 'shape.distributed',
      values: { hours: Math.max(1, hoursPerSlot), days: nSlots },
    },
    rationale: {
      code: 'best_effort_unreachable_goal',
      values: { hours: Math.max(1, hoursPerSlot), days: nSlots },
    },
  }
}

const distributeAcrossNonMeetingPool = (
  pool: EligibleDay[],
  gapMinutes: number,
  stretchCapMinutes: number,
  conversationDayKeys: Set<string>
): Recommendation | null => {
  if (pool.length === 0) return null

  const minDaysAtStretch = Math.max(
    2,
    Math.ceil(gapMinutes / stretchCapMinutes)
  )
  const fitsAtStretch = minDaysAtStretch <= pool.length
  const nSlots = fitsAtStretch ? minDaysAtStretch : pool.length

  const baseSlotMinutes = fitsAtStretch
    ? Math.ceil(gapMinutes / nSlots / 60) * 60
    : stretchCapMinutes
  const hoursPerSlot = baseSlotMinutes / 60

  const conversationDays = pool.filter((d) =>
    conversationDayKeys.has(d.m.format('YYYY-MM-DD'))
  )
  const nonConversationDays = pool.filter(
    (d) => !conversationDayKeys.has(d.m.format('YYYY-MM-DD'))
  )

  const layered =
    fitsAtStretch &&
    conversationDays.length > 0 &&
    conversationDays.length < nSlots
      ? [
          ...conversationDays.slice(0, nSlots),
          ...pickEvenlySpacedDays(
            nonConversationDays,
            nSlots - Math.min(conversationDays.length, nSlots),
            true
          ),
        ]
      : fitsAtStretch && conversationDays.length >= nSlots
        ? conversationDays.slice(-nSlots)
        : pickEvenlySpacedDays(pool, nSlots, true)
  const chosen = layered.slice().sort((a, b) => (a.m.isBefore(b.m) ? -1 : 1))

  const layeredOnConversation =
    fitsAtStretch &&
    chosen.some((d) => conversationDayKeys.has(d.m.format('YYYY-MM-DD')))

  const plans = chosen.map((d, i) => {
    if (!fitsAtStretch)
      return { date: d.m.toDate(), minutes: stretchCapMinutes }
    if (i < nSlots - 1) return { date: d.m.toDate(), minutes: baseSlotMinutes }
    const remainder = gapMinutes - baseSlotMinutes * (nSlots - 1)
    return { date: d.m.toDate(), minutes: Math.max(60, remainder) }
  })

  const rationaleCode: ReasonCode = !fitsAtStretch
    ? 'best_effort_unreachable_goal'
    : layeredOnConversation
      ? 'layered_on_conversation_days'
      : 'spread_to_sustainable_pace'

  return {
    shape: 'distributed',
    plans,
    headline: {
      code: 'shape.distributed',
      values: { hours: hoursPerSlot, days: nSlots },
    },
    rationale: {
      code: rationaleCode,
      values: { hours: hoursPerSlot, days: nSlots },
    },
  }
}

const buildRecurring = (ctx: BuildContext): Recommendation | null => {
  const { gapMinutes, eligible, params } = ctx
  const stretchCapMinutes = params.stretchMaxHoursPerDay * 60
  const absoluteCapMinutes = params.absoluteMaxHoursPerDay * 60
  if (eligible.length < params.recurringMinHorizonDays) return null
  if (gapMinutes > eligible.length * stretchCapMinutes) return null

  const weeks = Math.max(1, Math.ceil(eligible.length / 7))
  const weekdaysPerWeek = Math.min(
    7,
    Math.max(2, Math.ceil(gapMinutes / (stretchCapMinutes * weeks)))
  )
  const perSessionHours = Math.ceil(gapMinutes / (weekdaysPerWeek * weeks) / 60)
  const perSessionMinutes = perSessionHours * 60
  if (perSessionMinutes > absoluteCapMinutes) return null

  // Recurring asks the user to commit to the same weekdays week after week,
  // so meeting weekdays are unsuitable — pulling the pattern from the
  // non-meeting subset only. If the gap requires more distinct weekdays than
  // non-meeting days provide, recurring isn't a good fit and we fall back to
  // the other shapes.
  const nonMeetingEligible = eligible.filter((d) => !d.isMeetingDay)
  const seenWeekday = new Set<number>()
  const patternWeekdays: number[] = []
  for (const d of nonMeetingEligible) {
    const wd = d.m.day()
    if (seenWeekday.has(wd)) continue
    seenWeekday.add(wd)
    patternWeekdays.push(wd)
    if (patternWeekdays.length >= weekdaysPerWeek) break
  }
  if (patternWeekdays.length < weekdaysPerWeek) return null

  const plans: ProposedDayPlan[] = eligible
    .filter((d) => patternWeekdays.includes(d.m.day()))
    .map((d) => ({ date: d.m.toDate(), minutes: perSessionMinutes }))

  const weekdayList = patternWeekdays
    .slice()
    .sort((a, b) => a - b)
    .map((wd) => WEEKDAY_NAMES[wd])
    .join(', ')

  return {
    shape: 'recurring',
    plans,
    headline: {
      code: 'shape.recurring',
      values: { hours: perSessionHours, weekdayList, weeks },
    },
    rationale: {
      code: 'pattern_fits_over_horizon',
      values: { hours: perSessionHours, weekdayList, weeks },
    },
  }
}

const HISTORY_LOOKBACK = 10
const MIN_EVENTS_TO_TRUST = 3

const hasNegativeHistory = (
  history: AssistantEvent[],
  shape: RecommendationShape
): boolean => {
  const events = history
    .filter((e) => e.shape === shape)
    .slice(-HISTORY_LOOKBACK)
  if (events.length < MIN_EVENTS_TO_TRUST) return false
  const accepted = events.filter((e) => e.action === 'accepted').length
  const dismissed = events.filter((e) => e.action === 'dismissed').length
  return dismissed > accepted
}

/**
 * Distributed is preferred until the gap is large enough that the user is
 * effectively committing to almost every other day — at that point a weekly
 * rhythm ("every Mon/Wed/Fri") is easier to internalise than "pick 8 random
 * days across the month."
 */
const RECURRING_MIN_REQUIRED_DAYS = 7

const decisionTreeShape = (
  gapMinutes: number,
  eligibleLen: number,
  params: EngineParams
): RecommendationShape => {
  const stretchCapMinutes = params.stretchMaxHoursPerDay * 60
  // Concentrated only fires when the gap fits in a single comfortable day
  // (≤ stretchCap). Beyond that, splitting into a couple of medium days is
  // mentally lighter than asking for one heroic 8-hour push.
  if (gapMinutes <= stretchCapMinutes) return 'concentrated'
  const minDaysAtStretch = Math.max(
    2,
    Math.ceil(gapMinutes / stretchCapMinutes)
  )
  if (
    minDaysAtStretch >= RECURRING_MIN_REQUIRED_DAYS &&
    eligibleLen >= params.recurringMinHorizonDays &&
    gapMinutes <= eligibleLen * stretchCapMinutes
  )
    return 'recurring'
  return 'distributed'
}

export const generateRecommendation = (
  input: EngineInput
): Recommendation | null => {
  const goalMinutes = input.monthlyGoalHours * 60
  if (goalMinutes <= 0) return null

  const logged = input.loggedAdjustedMinutes
  if (logged >= goalMinutes) return null

  const planned = futurePlannedMinutes(
    input.year,
    input.month,
    input.today,
    input.dayPlans,
    input.recurringPlans
  )
  const projected = logged + planned
  if (projected >= goalMinutes) return null

  const params = { ...DEFAULT_ENGINE_PARAMS, ...(input.params ?? {}) }
  const eligible = eligibleDays(
    input.year,
    input.month,
    input.today,
    input.offDays,
    input.meetingDays ?? [],
    input.dayPlans,
    input.recurringPlans
  )
  if (eligible.length === 0) return null

  const ctx: BuildContext = {
    gapMinutes: goalMinutes - projected,
    eligible,
    params,
    conversationDayKeys: collectConversationDayKeys(
      input.conversations,
      input.today
    ),
    tirednessTriggered:
      (input.minutesLoggedInPriorDays ?? 0) >=
      params.tirednessThresholdHours * 60,
  }

  const builders: Record<
    RecommendationShape,
    (c: BuildContext) => Recommendation | null
  > = {
    concentrated: buildConcentrated,
    distributed: buildDistributed,
    recurring: buildRecurring,
  }

  const primary = decisionTreeShape(ctx.gapMinutes, eligible.length, params)
  const primaryRec = builders[primary](ctx)

  const fallbacks: Recommendation[] = (
    ['concentrated', 'distributed', 'recurring'] as RecommendationShape[]
  )
    .filter((s) => s !== primary)
    .map((s) => builders[s](ctx))
    .filter((r): r is Recommendation => r !== null)

  if (
    primaryRec &&
    fallbacks.length > 0 &&
    hasNegativeHistory(input.assistantHistory, primary)
  ) {
    return fallbacks[0]
  }

  return primaryRec ?? fallbacks[0] ?? null
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const collectConversationDayKeys = (
  conversations: Visit[],
  today: Date
): Set<string> => {
  const todayDay = momentStoredDate(normalizeDateForStorage(today))
  const keys = new Set<string>()
  for (const c of conversations) {
    if (c.date) {
      const d = momentStoredDate(c.date)
      if (d.isSameOrAfter(todayDay, 'day')) keys.add(d.format('YYYY-MM-DD'))
    }
    const fu = c.followUp
    if (fu && fu.date && fu.dismissed !== true) {
      const d = momentStoredDate(fu.date)
      if (d.isSameOrAfter(todayDay, 'day')) keys.add(d.format('YYYY-MM-DD'))
    }
  }
  return keys
}

const pickEvenlySpacedDays = <T>(
  days: T[],
  n: number,
  biasEnd: boolean = false
): T[] => {
  if (n >= days.length) return days.slice(0, n)
  const step = days.length / n
  // When biasEnd is true, anchor the last pick at the final day and walk
  // backward at the same step. This pushes the entire selection toward the
  // end of the window while preserving the gap between picks.
  const shift = biasEnd ? days.length - 1 - (n - 1) * step : 0
  const result: T[] = []
  for (let i = 0; i < n; i++) {
    result.push(days[Math.floor(i * step + shift)])
  }
  return result
}
