import moment from 'moment'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  getStartTimeInMinutes,
  storedDayKey,
} from '@/lib/normalizeDate'
import {
  getEffectiveStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
  resolvePlannedContributionsForDay,
  type PlannedDayContribution,
  type RecurringPlan,
} from '@/lib/recurrence'
import type { DayPlan } from '@/types/timeEntry'
import type { BuddyCardDay, ShareDetails } from '@/features/buddies/lib/schemas'
import {
  JOIN_REQUEST_LEAD_MS,
  MAX_OPEN_JOIN_REQUESTS,
  type BuddiesState,
  type IncomingJoinRequest,
  type OutgoingJoinRequest,
} from '@/features/buddies/lib/state'

type CardPlan = BuddyCardDay['p'][number]

/** When a buddy's Plan starts, as the app reads it: no start time is noon. */
export function joinRequestExpiry(d: string, s: number | undefined): number {
  return moment(d, 'YYYY-MM-DD')
    .startOf('day')
    .add(s ?? DEFAULT_START_TIME_IN_MINUTES, 'minutes')
    .valueOf()
}

/**
 * What this User can do about a buddy's Plan: ask to join it, take back a
 * request (`asked`, `unsent` until it reaches the buddy), or nothing: once the
 * buddy has invited them that day, the Plan is too close to start, or they
 * already have `MAX_OPEN_JOIN_REQUESTS` waiting with that buddy.
 */
export type JoinRequestStatus =
  | { kind: 'canAsk'; expiresAt: number }
  | { kind: 'asked'; request: OutgoingJoinRequest; unsent: boolean }
  | { kind: 'none' }

/**
 * Whether the latest ask or withdrawal hasn't reached the buddy yet; it's sent
 * again on every sync. A withdrawal of a request that never reached the relay
 * has nothing to send, though it counts as unsent until delivery next runs.
 */
export function joinRequestUnsent(
  request: Pick<OutgoingJoinRequest, 'rev' | 'sentRev'>
): boolean {
  return request.sentRev !== request.rev
}

export function joinRequestStatus(
  state: Pick<BuddiesState, 'askedToJoin' | 'incomingShares'>,
  to: string,
  d: string,
  plan: CardPlan,
  now: number
): JoinRequestStatus {
  const invited = Object.values(state.incomingShares).some(
    (share) =>
      share.from === to &&
      share.type === 'plan' &&
      share.details.d === d &&
      share.status !== 'cancelled'
  )
  if (invited) return { kind: 'none' }
  // Lapsed requests wait for the next cleanup; they no longer count.
  const live = Object.values(state.askedToJoin).filter(
    (candidate) => !candidate.withdrawn && candidate.expiresAt > now
  )
  const request = live.find(
    (candidate) =>
      candidate.to === to && candidate.d === d && candidate.s === plan.s
  )
  if (request)
    return { kind: 'asked', request, unsent: joinRequestUnsent(request) }
  const expiresAt = joinRequestExpiry(d, plan.s)
  if (expiresAt - now < JOIN_REQUEST_LEAD_MS) return { kind: 'none' }
  const open = live.filter((candidate) => candidate.to === to)
  if (open.length >= MAX_OPEN_JOIN_REQUESTS) return { kind: 'none' }
  return { kind: 'canAsk', expiresAt }
}

/**
 * The owner's Plan a request is about: what counts that day at the requested
 * start, else the day's only Plan. Plans that follow someone else's invitation
 * count too, since they're on the Buddy Card the buddy saw.
 */
export function findJoinRequestPlan(
  request: Pick<IncomingJoinRequest, 'd' | 's'>,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): PlannedDayContribution | undefined {
  const day = moment(request.d, 'YYYY-MM-DD').toDate()
  const contributions = plansOnDay(request.d, dayPlans, recurringPlans)
  return (
    contributions.find(
      (contribution) => contributionStart(contribution, day) === request.s
    ) ?? (contributions.length === 1 ? contributions[0] : undefined)
  )
}

/**
 * Buddies' requests to join one of this User's Plans on `dayKey` that still
 * wait on an answer: not passed on, withdrawn, lapsed, or already invited.
 */
export function openJoinRequestsForPlan(
  plan: (DayPlan | RecurringPlan) & { buddies?: string[] },
  dayKey: string,
  requests: IncomingJoinRequest[],
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[],
  now: number
): IncomingJoinRequest[] {
  return requests.filter(
    (request) =>
      !request.dismissed &&
      !request.withdrawn &&
      request.expiresAt > now &&
      request.d === dayKey &&
      !plan.buddies?.includes(request.from) &&
      findJoinRequestPlan(request, dayPlans, recurringPlans)?.plan.id ===
        plan.id
  )
}

/** Every Plan on `dayKey`: its one-time Plans and recurring instances. */
function plansOnDay(
  dayKey: string,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): PlannedDayContribution[] {
  return resolvePlannedContributionsForDay(
    moment(dayKey, 'YYYY-MM-DD').toDate(),
    dayPlans.filter((plan) => storedDayKey(plan.date) === dayKey),
    recurringPlans
  )
}

function contributionAnytime(
  contribution: PlannedDayContribution,
  day: Date
): boolean {
  return contribution.source === 'day'
    ? !!contribution.plan.anytime
    : isRecurringPlanAnytimeOnDate(contribution.plan, day)
}

/** Undefined for an anytime Plan, which shares no start time. */
function contributionStart(
  contribution: PlannedDayContribution,
  day: Date
): number | undefined {
  if (contributionAnytime(contribution, day)) return undefined
  return contribution.source === 'day'
    ? contribution.plan.startTimeInMinutes
    : getEffectiveStartTimeInMinutesForRecurringPlan(contribution.plan, day)
}

/**
 * What Invite does for a request: add the buddy to the owner's one-time Plan at
 * that time, or add a one-time Plan with them, seeded from the recurring
 * instance there and skipping that instance (`skipRecurringPlanId`) so the day
 * isn't counted twice. Nothing when the Plan follows someone else's invitation
 * (only its organizer can invite), or when the owner's Plans that day changed
 * and none match: a new Plan beside them would count twice.
 */
export type JoinRequestInvite =
  | { kind: 'invite'; update: Pick<DayPlan, 'id' | 'buddies'> }
  | {
      kind: 'invite'
      add: Omit<DayPlan, 'id' | 'notifyMe'>
      /** The recurring Plan whose instance on that day the new Plan replaces. */
      skipRecurringPlanId?: string
    }
  | { kind: 'linked'; organizer: string }
  | { kind: 'changed' }

export function joinRequestInvite(
  request: Pick<IncomingJoinRequest, 'from' | 'd' | 's' | 'm'>,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): JoinRequestInvite {
  const match = findJoinRequestPlan(request, dayPlans, recurringPlans)
  if (match?.source === 'day' && match.plan.buddyShare)
    return { kind: 'linked', organizer: match.plan.buddyShare.from }
  if (match?.source === 'day') {
    const buddies = match.plan.buddies ?? []
    return {
      kind: 'invite',
      update: {
        id: match.plan.id,
        buddies: buddies.includes(request.from)
          ? buddies
          : [...buddies, request.from],
      },
    }
  }
  if (!match && plansOnDay(request.d, dayPlans, recurringPlans).length > 0)
    return { kind: 'changed' }
  const day = moment(request.d, 'YYYY-MM-DD')
  // A request with no start time is for an anytime Plan.
  const anytime = match
    ? contributionAnytime(match, day.toDate())
    : request.s === undefined
  return {
    kind: 'invite',
    ...(match ? { skipRecurringPlanId: match.plan.id } : {}),
    add: {
      date: day.toDate(),
      startTimeInMinutes: anytime
        ? DEFAULT_START_TIME_IN_MINUTES
        : match
          ? contributionStart(match, day.toDate())
          : request.s,
      ...(anytime ? { anytime } : {}),
      minutes: match?.minutes ?? request.m ?? 60,
      title: match?.plan.title,
      location: match?.plan.location,
      categoryId: match?.plan.categoryId,
      buddies: [request.from],
      notifications: [],
    },
  }
}

/**
 * This User's own Plans that overlap a buddy's invitation in time, which
 * "Going" would count twice: one-time Plans and recurring instances that day.
 * One-time Plans that invite buddies themselves or follow another invitation
 * are left alone. An anytime Plan, or an invitation with no start time,
 * overlaps anything that day.
 */
export function overlappingOwnPlans(
  details: Pick<ShareDetails, 'd' | 's' | 'm'>,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): PlannedDayContribution[] {
  const start = details.s
  const end = (start ?? 0) + (details.m ?? 60)
  const day = moment(details.d, 'YYYY-MM-DD').toDate()
  return plansOnDay(details.d, dayPlans, recurringPlans).filter(
    (contribution) => {
      if (
        contribution.source === 'day' &&
        (contribution.plan.buddyShare || contribution.plan.buddies?.length)
      )
        return false
      if (start === undefined || contributionAnytime(contribution, day))
        return true
      const planStart =
        contribution.source === 'day'
          ? getStartTimeInMinutes(contribution.plan)
          : getEffectiveStartTimeInMinutesForRecurringPlan(
              contribution.plan,
              day
            )
      return planStart < end && planStart + contribution.minutes > start
    }
  )
}
