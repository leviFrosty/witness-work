import moment from 'moment'
import type { Conversation } from '@/types/conversation'
import type { DayPlan, RecurringPlan } from '@/types/serviceReport'
import { momentStoredDate, normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  getEffectiveMinutesForRecurringPlan,
  getPlansIntersectingDay,
} from '@/lib/serviceReport'

export type RecommendationShape = 'concentrated' | 'distributed' | 'recurring'

export type ReasonCode =
  | 'small_gap_one_focused_plan'
  | 'spread_to_sustainable_pace'
  | 'pattern_fits_over_horizon'
  | 'stretched_for_short_horizon'
  | 'rest_recommended_then_resume'
  | 'layered_on_conversation_days'
  | 'best_effort_unreachable_goal'

export type AssistantAction = 'accepted' | 'dismissed'

export type AssistantEvent = {
  shape: RecommendationShape
  action: AssistantAction
  at: number
}

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
}

export type EngineInput = {
  year: number
  month: number
  today: Date
  monthlyGoalHours: number
  loggedAdjustedMinutes: number
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  conversations: Conversation[]
  excludedWeekdays: number[]
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

const eligibleDays = (
  year: number,
  month: number,
  today: Date,
  excludedWeekdays: number[],
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): moment.Moment[] => {
  const start = moment.utc({ year, month, day: 1 })
  const end = start.clone().endOf('month')
  const todayDay = momentStoredDate(normalizeDateForStorage(today))
  const cursor = (todayDay.isAfter(start, 'day') ? todayDay : start).clone()

  const dayPlanKeys = new Set(
    dayPlans.map((p) => momentStoredDate(p.date).format('YYYY-MM-DD'))
  )

  const days: moment.Moment[] = []
  while (cursor.isSameOrBefore(end, 'day')) {
    const isExcluded = excludedWeekdays.includes(cursor.day())
    const key = cursor.format('YYYY-MM-DD')
    const hasDayPlan = dayPlanKeys.has(key)
    const hasRecurring =
      getPlansIntersectingDay(cursor.toDate(), recurringPlans).length > 0
    if (!isExcluded && !hasDayPlan && !hasRecurring) {
      days.push(cursor.clone())
    }
    cursor.add(1, 'day')
  }
  return days
}

type BuildContext = {
  gapMinutes: number
  eligible: moment.Moment[]
  params: EngineParams
  conversationDayKeys: Set<string>
  tirednessTriggered: boolean
}

const buildConcentrated = (ctx: BuildContext): Recommendation | null => {
  const { gapMinutes, eligible, params, tirednessTriggered } = ctx
  const absoluteCapMinutes = params.absoluteMaxHoursPerDay * 60
  if (gapMinutes > absoluteCapMinutes) return null
  const pool = tirednessTriggered ? eligible.slice(1) : eligible
  if (pool.length === 0) return null
  const day = pool[0]
  const hours = Math.ceil(gapMinutes / 60)
  return {
    shape: 'concentrated',
    plans: [{ date: day.toDate(), minutes: gapMinutes }],
    headline: {
      code: 'shape.concentrated',
      values: { hours, day: day.format('YYYY-MM-DD') },
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
  const softCapMinutes = params.softMaxHoursPerDay * 60
  const stretchCapMinutes = params.stretchMaxHoursPerDay * 60
  const fitsAtSoftCap = gapMinutes <= eligible.length * softCapMinutes

  const slotMinutes = fitsAtSoftCap ? softCapMinutes : stretchCapMinutes
  const hoursPerSlot = fitsAtSoftCap
    ? params.softMaxHoursPerDay
    : params.stretchMaxHoursPerDay
  const nSlots = fitsAtSoftCap
    ? Math.ceil(gapMinutes / slotMinutes)
    : eligible.length

  const conversationDays = eligible.filter((d) =>
    conversationDayKeys.has(d.format('YYYY-MM-DD'))
  )
  const nonConversationDays = eligible.filter(
    (d) => !conversationDayKeys.has(d.format('YYYY-MM-DD'))
  )

  const layered =
    fitsAtSoftCap &&
    conversationDays.length > 0 &&
    conversationDays.length < nSlots
      ? [
          ...conversationDays.slice(0, nSlots),
          ...pickEvenlySpacedDays(
            nonConversationDays,
            nSlots - Math.min(conversationDays.length, nSlots)
          ),
        ]
      : fitsAtSoftCap && conversationDays.length >= nSlots
        ? conversationDays.slice(0, nSlots)
        : pickEvenlySpacedDays(eligible, nSlots)
  const chosen = layered.slice().sort((a, b) => (a.isBefore(b) ? -1 : 1))

  const layeredOnConversation =
    fitsAtSoftCap &&
    chosen.some((d) => conversationDayKeys.has(d.format('YYYY-MM-DD')))

  const plans = chosen.map((d, i) => ({
    date: d.toDate(),
    minutes:
      !fitsAtSoftCap || i < nSlots - 1
        ? slotMinutes
        : Math.max(slotMinutes, gapMinutes - slotMinutes * (nSlots - 1)),
  }))

  const rationaleCode: ReasonCode = !fitsAtSoftCap
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

  const seenWeekday = new Set<number>()
  const patternWeekdays: number[] = []
  for (const d of eligible) {
    const wd = d.day()
    if (seenWeekday.has(wd)) continue
    seenWeekday.add(wd)
    patternWeekdays.push(wd)
    if (patternWeekdays.length >= weekdaysPerWeek) break
  }

  const plans: ProposedDayPlan[] = eligible
    .filter((d) => patternWeekdays.includes(d.day()))
    .map((d) => ({ date: d.toDate(), minutes: perSessionMinutes }))

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

const decisionTreeShape = (
  gapMinutes: number,
  eligibleLen: number,
  params: EngineParams
): RecommendationShape => {
  const softCapMinutes = params.softMaxHoursPerDay * 60
  const stretchCapMinutes = params.stretchMaxHoursPerDay * 60
  if (gapMinutes <= softCapMinutes * 2) return 'concentrated'
  if (gapMinutes <= eligibleLen * softCapMinutes) return 'distributed'
  if (
    gapMinutes <= eligibleLen * stretchCapMinutes &&
    eligibleLen >= params.recurringMinHorizonDays
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
    input.excludedWeekdays,
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
  conversations: Conversation[],
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

const pickEvenlySpacedDays = (
  days: moment.Moment[],
  n: number
): moment.Moment[] => {
  if (n >= days.length) return days.slice(0, n)
  const step = days.length / n
  const result: moment.Moment[] = []
  for (let i = 0; i < n; i++) {
    result.push(days[Math.floor(i * step)])
  }
  return result
}
