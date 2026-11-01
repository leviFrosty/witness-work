import moment from 'moment'
import type { Visit } from '@/types/visit'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'
import type { AssistantEvent, RecommendationShape } from '@/types/assistant'
import {
  localDayFromUtcCursor,
  momentStoredDate,
  normalizeDateForStorage,
} from '@/lib/normalizeDate'
import { getPlansIntersectingDay } from '@/lib/recurrence'

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

export const proposedPlanLocalDay = (p: ProposedDayPlan): Date =>
  localDayFromUtcCursor(moment.utc(p.date))

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

  meetingDaySoftMaxHoursPerDay: number

  meetingDayAbsoluteMaxHoursPerDay: number

  evenSpreadMinSessionHours: number
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
  evenSpreadMinSessionHours: 2,
}

export type EngineInput = {
  year: number
  month: number
  today: Date
  monthlyGoalHours: number

  standardGapMinutes: number
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  conversations: Visit[]

  offDays: number[]

  meetingDays?: number[]
  assistantHistory: AssistantEvent[]

  minutesLoggedInPriorDays?: number

  spreadEvenly?: boolean

  skipDayKeys?: ReadonlySet<string>
  params?: Partial<EngineParams>
}

type EligibleDay = {
  m: moment.Moment

  isMeetingDay: boolean
}

const eligibleDays = (
  year: number,
  month: number,
  today: Date,
  offDays: number[],
  meetingDays: number[],
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[],
  skipDayKeys: ReadonlySet<string>
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
    const isTaken = dayPlanKeys.has(key) || skipDayKeys.has(key)
    const hasRecurring =
      getPlansIntersectingDay(localDayFromUtcCursor(cursor), recurringPlans)
        .length > 0
    if (!isOffDay && !isTaken && !hasRecurring) {
      days.push({
        m: cursor.clone(),

        isMeetingDay: meetingDays.includes(weekday),
      })
    }
    cursor.add(1, 'day')
  }
  return days
}

type BuildContext = {
  gapMinutes: number

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

  const nonMeetingCapacity = nonMeetingPool.length * stretchCapMinutes
  const remainderForMeeting = Math.max(0, gapMinutes - nonMeetingCapacity)
  const meetingDaysNeeded = Math.ceil(
    remainderForMeeting / meetingSoftCapMinutes
  )
  const meetingDaysAvailable = meetingPool.length

  if (meetingDaysNeeded <= meetingDaysAvailable) {
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

const buildEvenSpread = (ctx: BuildContext): Recommendation | null => {
  const { gapMinutes, eligible, params } = ctx
  const pool = eligible.filter((d) => !d.isMeetingDay)
  if (pool.length * params.stretchMaxHoursPerDay * 60 < gapMinutes) {
    return buildDistributed(ctx)
  }
  const nSlots = Math.min(
    pool.length,
    Math.max(
      1,
      Math.floor(gapMinutes / (params.evenSpreadMinSessionHours * 60))
    )
  )
  const chosen = pickEvenlySpacedDays(pool, nSlots, true)

  const runningTotal = (i: number) =>
    i === nSlots ? gapMinutes : Math.round((gapMinutes * i) / nSlots / 60) * 60
  const plans: ProposedDayPlan[] = chosen.map((d, i) => ({
    date: d.m.toDate(),
    minutes: runningTotal(i + 1) - runningTotal(i),
  }))
  const hours = Math.max(1, Math.round(gapMinutes / nSlots / 60))
  return {
    shape: 'distributed',
    plans,
    headline: {
      code: 'shape.distributed',
      values: { hours, days: nSlots },
    },
    rationale: {
      code: 'spread_to_sustainable_pace',
      values: { hours, days: nSlots },
    },
  }
}

const buildRecurring = (ctx: BuildContext): Recommendation | null => {
  const { gapMinutes, eligible, params } = ctx
  const stretchCapMinutes = params.stretchMaxHoursPerDay * 60
  const absoluteCapMinutes = params.absoluteMaxHoursPerDay * 60
  if (eligible.length < params.recurringMinHorizonDays) return null
  if (gapMinutes > eligible.length * stretchCapMinutes) return null

  const spanDays =
    eligible[eligible.length - 1].m.diff(eligible[0].m, 'days') + 1
  const weeks = Math.max(1, Math.ceil(spanDays / 7))
  const weekdaysPerWeek = Math.min(
    7,
    Math.max(2, Math.ceil(gapMinutes / (stretchCapMinutes * weeks)))
  )

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

  const patternDays = eligible.filter((d) =>
    patternWeekdays.includes(d.m.day())
  )
  const perSessionHours = Math.ceil(gapMinutes / patternDays.length / 60)
  const perSessionMinutes = perSessionHours * 60
  if (perSessionMinutes > absoluteCapMinutes) return null

  const plans: ProposedDayPlan[] = patternDays.map((d) => ({
    date: d.m.toDate(),
    minutes: perSessionMinutes,
  }))

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

const RECURRING_MIN_REQUIRED_DAYS = 7

const decisionTreeShape = (
  gapMinutes: number,
  eligibleLen: number,
  params: EngineParams
): RecommendationShape => {
  const stretchCapMinutes = params.stretchMaxHoursPerDay * 60

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

  if (input.standardGapMinutes <= 0) return null

  const params = { ...DEFAULT_ENGINE_PARAMS, ...(input.params ?? {}) }
  const eligible = eligibleDays(
    input.year,
    input.month,
    input.today,
    input.offDays,
    input.meetingDays ?? [],
    input.dayPlans,
    input.recurringPlans,
    input.skipDayKeys ?? new Set()
  )
  if (eligible.length === 0) return null

  const ctx: BuildContext = {
    gapMinutes: input.standardGapMinutes,
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

  if (input.spreadEvenly) return buildEvenSpread(ctx)

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
      const d = momentStoredDate(normalizeDateForStorage(c.date))
      if (d.isSameOrAfter(todayDay, 'day')) keys.add(d.format('YYYY-MM-DD'))
    }
    const fu = c.followUp
    if (fu && fu.date && fu.dismissed !== true) {
      const d = momentStoredDate(normalizeDateForStorage(fu.date))
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

  const shift = biasEnd ? days.length - 1 - (n - 1) * step : 0
  const result: T[] = []
  for (let i = 0; i < n; i++) {
    result.push(days[Math.floor(i * step + shift)])
  }
  return result
}
