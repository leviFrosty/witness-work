import moment from 'moment'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import type { Buddy, ReceivedCard } from '@/features/buddies/lib/state'
import {
  calendarMonthOf,
  publisherCapabilitiesForMonth,
  type RolePreferences,
} from '@/lib/roleHistory'
import {
  resolveMonthlyGoalHours,
  type MonthlyGoalOverrides,
} from '@/lib/monthlyGoals'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  getTotalMinutesDetailedForSpecificMonth,
} from '@/lib/serviceReport'
import {
  getEffectiveStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
  resolvePlannedContributionsForDay,
} from '@/lib/recurrence'
import { dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
import { DEFAULT_START_TIME_IN_MINUTES } from '@/lib/normalizeDate'
import { getStudiesForGivenMonth } from '@/lib/contacts'
import {
  resolveStartOfWeek,
  resolveTimeFormat,
  type TimeFormat,
} from '@/lib/dates'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { Category } from '@/types/category'
import type {
  DayPlan,
  RecurringPlan,
  TimeEntriesByYear,
  TimeEntry,
} from '@/types/timeEntry'
import type { ScribeContextWire } from '@/features/scribe/lib/wire'
import {
  RefRegistry,
  STANDARD_CATEGORY_REF,
} from '@/features/scribe/runtime/refs'

/** The Preferences fields Scribe AI reads. */
export interface ScribePreferences extends RolePreferences {
  monthlyGoalOverrides: MonthlyGoalOverrides
  dataProtectionMode: boolean
  startOfWeek: number | undefined
  timeFormat: TimeFormat | undefined
  formatRegion: string | undefined
  planAlwaysNotify: boolean
  planNotificationOffset: {
    amount?: number
    unit?: moment.unitOfTime.DurationConstructor
  } | null
  returnVisitAlwaysNotify: boolean
  returnVisitNotificationOffset: {
    amount?: number
    unit?: moment.unitOfTime.DurationConstructor
  } | null
  onboardingComplete: boolean
}

/**
 * A read-only snapshot of every store a tool may read. Tools never call a store
 * setter; only the apply saga writes.
 */
export interface ScribeStores {
  contacts: readonly Contact[]
  visits: readonly Visit[]
  serviceReports: TimeEntriesByYear
  dayPlans: readonly DayPlan[]
  recurringPlans: readonly RecurringPlan[]
  categories: readonly Category[]
  buddies: readonly Buddy[]
  buddyCards: Readonly<Record<string, ReceivedCard>>
  preferences: ScribePreferences
}

/** The live stores, now. */
export function readScribeStores(): ScribeStores {
  const prefs = usePreferences.getState()
  const reports = useServiceReport.getState()
  const buddies = useBuddies.getState()
  return {
    contacts: useContacts.getState().contacts,
    visits: useConversations.getState().conversations,
    serviceReports: reports.serviceReports,
    dayPlans: reports.dayPlans,
    recurringPlans: reports.recurringPlans,
    categories: useCategories.getState().categories,
    buddies: buddies.buddies,
    buddyCards: buddies.cards,
    preferences: {
      role: prefs.role,
      roleHistory: prefs.roleHistory,
      publisherHours: prefs.publisherHours,
      userSpecifiedHasAnnualGoal: prefs.userSpecifiedHasAnnualGoal,
      milestoneOverrides: prefs.milestoneOverrides,
      overrideCreditLimit: prefs.overrideCreditLimit,
      customCreditLimitHours: prefs.customCreditLimitHours,
      logsHours: prefs.logsHours,
      monthlyGoalOverrides: prefs.monthlyGoalOverrides,
      dataProtectionMode: prefs.dataProtectionMode,
      startOfWeek: prefs.startOfWeek,
      timeFormat: prefs.timeFormat,
      formatRegion: prefs.formatRegion,
      planAlwaysNotify: prefs.planAlwaysNotify,
      planNotificationOffset: prefs.planNotificationOffset,
      returnVisitAlwaysNotify: prefs.returnVisitAlwaysNotify,
      returnVisitNotificationOffset: prefs.returnVisitNotificationOffset,
      onboardingComplete: prefs.onboardingComplete,
    },
  }
}

// ---------------------------------------------------------------- shared reads

/** Every Time Entry, in store order. */
export function allTimeEntries(reports: TimeEntriesByYear): TimeEntry[] {
  const entries: TimeEntry[] = []
  for (const year of Object.keys(reports).sort()) {
    const months = reports[year]
    for (const month of Object.keys(months).sort((a, b) => +a - +b))
      entries.push(...months[month])
  }
  return entries
}

/** Local `YYYY-MM-DD` of an instant (Visits, Follow-ups). */
export const localDayKey = (date: Date | string | number): string =>
  moment(date).format('YYYY-MM-DD')

/** `09:00`, the machine form the model reads. */
export const clockText = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

const ENGLISH_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const englishWeekday = (day: moment.Moment): string =>
  ENGLISH_WEEKDAYS[day.day()]

/** The User's nickname for a buddy, else the buddy's own name. */
export const buddyName = (buddy: Pick<Buddy, 'name' | 'nickname'>): string =>
  buddy.nickname || buddy.name

/** Truncated to `max` characters, trimmed. */
export const clip = (value: string, max: number): string => {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() : trimmed
}

/** A Category's Ref: `k0` for Standard, a missing or deleted Category. */
export function categoryRef(
  refs: RefRegistry,
  categories: readonly Category[],
  categoryId: string | undefined | null
): string {
  if (!categoryId) return STANDARD_CATEGORY_REF
  if (!categories.some((category) => category.id === categoryId))
    return STANDARD_CATEGORY_REF
  return refs.issue('k', categoryId)
}

/** When each Contact was last visited (epoch ms), from every Visit. */
export function lastVisitByContact(
  visits: readonly Visit[]
): Map<string, number> {
  const last = new Map<string, number>()
  for (const visit of visits) {
    const at = new Date(visit.date).getTime()
    if (!Number.isFinite(at)) continue
    const previous = last.get(visit.contact.id)
    if (previous === undefined || at > previous) last.set(visit.contact.id, at)
  }
  return last
}

/** Contacts most recently visited or created first; ties by id. */
export function contactsByRecency(stores: ScribeStores): Contact[] {
  const last = lastVisitByContact(stores.visits)
  const created = (contact: Contact) =>
    new Date(contact.createdAt).getTime() || 0
  const recency = (contact: Contact) => last.get(contact.id) ?? created(contact)
  return [...stores.contacts].sort(
    (a, b) =>
      recency(b) - recency(a) ||
      created(b) - created(a) ||
      a.id.localeCompare(b.id)
  )
}

/** Categories by name, then id, so Refs and the context are deterministic. */
export function sortedCategories(stores: ScribeStores): Category[] {
  return [...stores.categories].sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id)
  )
}

/** One Plan on one local day, Day Plans and Recurring instances alike. */
interface PlanOnDayFields {
  ref: string
  date: string
  minutes: number
  startMinutes: number | null
  anytime: boolean
  categoryId: string | undefined
  title: string | undefined
}

export type PlanOnDay = PlanOnDayFields &
  ({ type: 'day'; plan: DayPlan } | { type: 'recurring'; plan: RecurringPlan })

/**
 * The Plans on `day` (local), Day Plans first, each by start time. Issues `p`
 * and `r` Refs.
 */
export function plansOnDay(
  stores: ScribeStores,
  refs: RefRegistry,
  day: moment.Moment
): PlanOnDay[] {
  const date = day.clone().startOf('day').toDate()
  const key = day.format('YYYY-MM-DD')
  const dayPlans = [...dayPlansOnLocalDay([...stores.dayPlans], date)].sort(
    (a, b) =>
      (a.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES) -
        (b.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES) ||
      a.id.localeCompare(b.id)
  )
  const result: PlanOnDay[] = []
  for (const contribution of resolvePlannedContributionsForDay(date, dayPlans, [
    ...stores.recurringPlans,
  ])) {
    if (contribution.minutes <= 0) continue
    if (contribution.source === 'day') {
      const plan = contribution.plan
      result.push({
        type: 'day',
        ref: refs.issue('p', plan.id),
        date: key,
        minutes: Math.round(contribution.minutes),
        startMinutes: plan.anytime
          ? null
          : (plan.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES),
        anytime: !!plan.anytime,
        categoryId: plan.categoryId,
        title: plan.title,
        plan,
      })
    } else {
      const plan = contribution.plan
      const anytime = isRecurringPlanAnytimeOnDate(plan, date)
      result.push({
        type: 'recurring',
        ref: refs.issue('r', plan.id, key),
        date: key,
        minutes: Math.round(contribution.minutes),
        startMinutes: anytime
          ? null
          : getEffectiveStartTimeInMinutesForRecurringPlan(plan, date),
        anytime,
        categoryId: plan.categoryId,
        title: plan.title,
        plan,
      })
    }
  }
  return result
}

/**
 * Refs of the confirmed buddies going along on a Plan: those the User invited,
 * and the one whose invitation it follows. Recurring Plans carry no
 * invitations.
 */
export function planBuddyRefs(
  stores: ScribeStores,
  refs: RefRegistry,
  plan: PlanOnDay
): string[] {
  if (plan.type !== 'day') return []
  const active = new Set(
    stores.buddies
      .filter((buddy) => buddy.status === 'active')
      .map((buddy) => buddy.inboxId)
  )
  const ids = [...(plan.plan.buddies ?? [])]
  if (plan.plan.buddyShare) ids.push(plan.plan.buddyShare.from)
  return [...new Set(ids)]
    .filter((id) => active.has(id))
    .map((id) => refs.issue('b', id))
}

/**
 * A Plan as one line, the way the context lists them: `p1 2026-10-22 120m 09:00
 * k0 "Title" with b1,b2`.
 */
export function planLine(
  stores: ScribeStores,
  refs: RefRegistry,
  plan: PlanOnDay,
  titleMax: number
): string {
  const time =
    plan.startMinutes === null ? 'anytime' : clockText(plan.startMinutes)
  const title = plan.title
    ? ` ${JSON.stringify(clip(plan.title, titleMax))}`
    : ''
  const going = planBuddyRefs(stores, refs, plan)
  const withBuddies = going.length ? ` with ${going.join(',')}` : ''
  return `${plan.ref} ${plan.date} ${plan.minutes}m ${time} ${categoryRef(refs, stores.categories, plan.categoryId)}${title}${withBuddies}`
}

// ---------------------------------------------------------------- context

export const CONTEXT_DAYS_BEFORE = 7
export const CONTEXT_DAYS_AFTER = 14
export const CONTEXT_PLAN_DAYS = 14
export const CONTEXT_MAX_PLANS = 40
export const CONTEXT_MAX_CONTACTS = 150
export const CONTEXT_MAX_BUDDIES = 5
const CONTEXT_NAME_MAX = 40
const CONTEXT_TITLE_MAX = 40

export interface ScribeContextEnv {
  now: Date
  /** The app Language, BCP-47. */
  locale: string
  /** IANA time zone. */
  tz: string
}

const weekStartOf = (value: number): ScribeContextWire['weekStart'] =>
  (Number.isInteger(value) && value >= 0 && value <= 6
    ? value
    : 0) as ScribeContextWire['weekStart']

/**
 * The pinned context for a conversation (protocol: Context). Deterministic:
 * identical stores, Refs and env produce byte-identical JSON. Issues the Refs
 * it names into `refs`.
 */
export function buildScribeContext(
  stores: ScribeStores,
  refs: RefRegistry,
  env: ScribeContextEnv
): ScribeContextWire {
  const prefs = stores.preferences
  const today = moment(env.now).startOf('day')
  const target = calendarMonthOf(env.now)
  const capabilities = publisherCapabilitiesForMonth(prefs, target)
  const goalHours = resolveMonthlyGoalHours(
    capabilities.monthlyGoalHours,
    prefs.monthlyGoalOverrides,
    target
  )

  const monthEntries = getMonthsReports(
    stores.serviceReports,
    target.month,
    target.year
  )
  const creditOverride = {
    enabled: prefs.overrideCreditLimit,
    customLimitHours: prefs.customCreditLimitHours,
  }
  const adjusted = adjustedMinutesForSpecificMonth(
    monthEntries,
    target.month,
    target.year,
    capabilities.type,
    creditOverride
  )
  const detailed = getTotalMinutesDetailedForSpecificMonth(
    monthEntries,
    target.month,
    target.year
  )

  const days: string[] = []
  for (
    let offset = -CONTEXT_DAYS_BEFORE;
    offset <= CONTEXT_DAYS_AFTER;
    offset++
  ) {
    const day = today.clone().add(offset, 'days')
    days.push(`${englishWeekday(day)} ${day.format('YYYY-MM-DD')}`)
  }

  const categories = [
    `${STANDARD_CATEGORY_REF} Standard`,
    ...sortedCategories(stores).map(
      (category) =>
        `${refs.issue('k', category.id)} ${clip(category.name, CONTEXT_NAME_MAX)}${category.isCredit ? ' credit' : ''}`
    ),
  ]

  // Before the Plans, so buddies keep their Refs in pairing order.
  const buddies = [...stores.buddies]
    .filter((buddy) => buddy.status === 'active')
    .sort(
      (a, b) => a.pairedAt - b.pairedAt || a.inboxId.localeCompare(b.inboxId)
    )
    .slice(0, CONTEXT_MAX_BUDDIES)
    .map(
      (buddy) =>
        `${refs.issue('b', buddy.inboxId)} ${clip(buddyName(buddy), CONTEXT_NAME_MAX)}`
    )

  const plans: string[] = []
  let plannedRemainingMinutes = 0
  const monthEnd = today.clone().endOf('month')
  for (
    let day = today.clone();
    day.isSameOrBefore(monthEnd, 'day') ||
    day.diff(today, 'days') < CONTEXT_PLAN_DAYS;
    day.add(1, 'day')
  ) {
    const onDay = plansOnDay(stores, refs, day)
    if (day.isSameOrBefore(monthEnd, 'day'))
      plannedRemainingMinutes += onDay.reduce(
        (sum, plan) => sum + plan.minutes,
        0
      )
    if (day.diff(today, 'days') >= CONTEXT_PLAN_DAYS) continue
    for (const plan of onDay) {
      if (plans.length >= CONTEXT_MAX_PLANS) break
      plans.push(planLine(stores, refs, plan, CONTEXT_TITLE_MAX))
    }
  }

  const dataProtection = prefs.dataProtectionMode
  const ordered = dataProtection ? [] : contactsByRecency(stores)
  const contacts = ordered
    .slice(0, CONTEXT_MAX_CONTACTS)
    .map(
      (contact) =>
        `${refs.issue('c', contact.id)} ${clip(contact.name || '?', CONTEXT_NAME_MAX)}`
    )

  return {
    v: 1,
    now: moment(env.now).format(),
    tz: env.tz,
    locale: env.locale,
    weekStart: weekStartOf(
      resolveStartOfWeek({
        override: prefs.startOfWeek,
        region: prefs.formatRegion,
      })
    ),
    clock:
      resolveTimeFormat({
        override: prefs.timeFormat,
        region: prefs.formatRegion,
      }) === '24'
        ? '24h'
        : '12h',
    days,
    // Setup asks the role only after Pick up where you left off, which can
    // open Scribe AI: until then, time is logged as said, not as "shared".
    publisher: prefs.onboardingComplete
      ? {
          role: capabilities.type,
          entryMode: capabilities.entryMode,
          showsTimeEntry: capabilities.showsTimeEntry,
          monthlyGoalMinutes: goalHours > 0 ? Math.round(goalHours * 60) : null,
          creditCapMinutes: capabilities.creditCapMinutes,
        }
      : {
          role: 'not_chosen',
          entryMode: 'hours',
          showsTimeEntry: true,
          monthlyGoalMinutes: null,
          creditCapMinutes: null,
        },
    month: {
      month: today.format('YYYY-MM'),
      loggedMinutes: Math.round(adjusted.value),
      creditMinutes: Math.round(detailed.credit),
      plannedRemainingMinutes,
      studies: getStudiesForGivenMonth({
        contacts: [...stores.contacts],
        conversations: [...stores.visits],
        month: env.now,
      }),
    },
    categories,
    plans,
    contacts,
    contactsTruncated: ordered.length > contacts.length,
    buddies,
    dataProtection,
  }
}
