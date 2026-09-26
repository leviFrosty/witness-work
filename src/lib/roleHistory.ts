import { publishers } from '@/constants/publisher'
import {
  derivePublisherCapabilities,
  effectiveHasAnnualGoal,
  type PublisherCapabilities,
} from '@/lib/publisherCapabilities'
import { monthlyGoalKey, type CalendarMonth } from '@/lib/monthlyGoals'
import type { Publisher, PublisherHours } from '@/types/publisher'

/**
 * Glossary: **Role History** — which Publisher role applied to each calendar
 * month. Stored as a timeline rather than a per-month map so a standing role
 * (e.g. "regular pioneer since Sep 2025") is one entry, and a one-off month
 * (e.g. auxiliary pioneering in March) is two: the change and the return.
 *
 * - `initial` is the role in effect before the first change.
 * - `changes` maps `YYYY-MM` → the role in effect from that month onward.
 *
 * A `null` history means every month uses the User's current `role`, which
 * keeps installs that never recorded a history behaving exactly as before. The
 * whole timeline is one Preferences value so iCloud's per-key last-writer-wins
 * merge treats it as a single piece of user intent (same stance as
 * `monthlyGoalOverrides`).
 */
export type RoleHistory = Readonly<{
  initial: Publisher
  changes: Readonly<Record<string, Publisher>>
}>

const ROLE_HISTORY_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

const isPublisher = (value: unknown): value is Publisher =>
  typeof value === 'string' && (publishers as readonly string[]).includes(value)

/** Adds `count` calendar months (negative to go back). */
export const addCalendarMonths = (
  { year, month }: CalendarMonth,
  count: number
): CalendarMonth => {
  const index = year * 12 + month + count
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 }
}

/** The calendar month containing `date` (local time). */
export const calendarMonthOf = (date: Date = new Date()): CalendarMonth => ({
  year: date.getFullYear(),
  month: date.getMonth(),
})

/** The twelve calendar months of a Service Year, September through August. */
export const serviceYearMonths = (serviceYear: number): CalendarMonth[] =>
  Array.from({ length: 12 }, (_, i) =>
    addCalendarMonths({ year: serviceYear, month: 8 }, i)
  )

/**
 * Drops redundant changes (a change to the role already in effect) and
 * collapses an empty timeline to `null`.
 */
const compact = (history: RoleHistory): RoleHistory | null => {
  const changes: Record<string, Publisher> = {}
  let previous = history.initial
  for (const key of Object.keys(history.changes).sort()) {
    const role = history.changes[key]
    if (role === previous) continue
    changes[key] = role
    previous = role
  }
  return Object.keys(changes).length === 0
    ? null
    : { initial: history.initial, changes }
}

/** Filters imported/persisted/synced values down to a canonical timeline. */
export const normalizeRoleHistory = (value: unknown): RoleHistory | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { initial, changes } = value as { initial?: unknown; changes?: unknown }
  if (!isPublisher(initial)) return null
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return null
  }

  const valid: Record<string, Publisher> = {}
  for (const [key, role] of Object.entries(changes)) {
    if (ROLE_HISTORY_KEY_PATTERN.test(key) && isPublisher(role)) {
      valid[key] = role
    }
  }
  return compact({ initial, changes: valid })
}

/**
 * The Publisher role that applied to `target`. Falls back to `currentRole` when
 * no history has been recorded.
 */
export const roleForMonth = (
  history: RoleHistory | null | undefined,
  currentRole: Publisher,
  target: CalendarMonth
): Publisher => {
  if (!history) return currentRole
  const targetKey = monthlyGoalKey(target)
  let role = history.initial
  for (const key of Object.keys(history.changes).sort()) {
    if (key > targetKey) break
    role = history.changes[key]
  }
  return role
}

/**
 * The role the timeline ends on — what the User's `role` preference holds. A
 * one-off month schedules its own return, so this can differ from the role for
 * the current month (e.g. auxiliary pioneering this month only).
 */
export const standingRole = (
  history: RoleHistory | null | undefined,
  currentRole: Publisher
): Publisher => {
  if (!history) return currentRole
  const keys = Object.keys(history.changes).sort()
  return keys.length === 0
    ? history.initial
    : history.changes[keys[keys.length - 1]]
}

/**
 * Sets `role` for every month from `start` through `end` (inclusive). With `end
 * === null` the role applies from `start` onward, replacing any later changes —
 * a standing change such as a new pioneer appointment. With an `end`, the
 * months after it keep whatever role they already had.
 */
export const setRoleForPeriod = (
  history: RoleHistory | null | undefined,
  currentRole: Publisher,
  start: CalendarMonth,
  end: CalendarMonth | null,
  role: Publisher
): RoleHistory | null => {
  const base: RoleHistory = history ?? { initial: currentRole, changes: {} }
  const startKey = monthlyGoalKey(start)
  const endKey = end ? monthlyGoalKey(end) : null
  if (endKey !== null && endKey < startKey) {
    throw new RangeError('Role period must end on or after its start')
  }

  const afterEnd = end ? addCalendarMonths(end, 1) : null
  const roleAfterEnd = afterEnd
    ? roleForMonth(base, currentRole, afterEnd)
    : null

  const changes: Record<string, Publisher> = {}
  for (const [key, value] of Object.entries(base.changes)) {
    const inPeriod = key >= startKey && (endKey === null || key <= endKey)
    if (!inPeriod) changes[key] = value
  }
  changes[startKey] = role
  if (afterEnd && roleAfterEnd) changes[monthlyGoalKey(afterEnd)] = roleAfterEnd

  return compact({ initial: base.initial, changes })
}

export type AnnualGoalInput = {
  history: RoleHistory | null | undefined
  currentRole: Publisher
  publisherHours: PublisherHours
  userSpecifiedHasAnnualGoal: boolean | 'default'
  serviceYear: number
}

/**
 * The Annual Goal for a Service Year. Without a history it is the role's
 * monthly goal × 12, exactly as before. With one, each month contributes its
 * own role's monthly goal when that role carries an Annual Goal — so a pioneer
 * appointed mid-year gets a prorated goal and earlier publisher months don't
 * count against it. Monthly Goal overrides are personal targets and stay out of
 * the Annual Goal, as before.
 */
export const annualGoalHoursForServiceYear = ({
  history,
  currentRole,
  publisherHours,
  userSpecifiedHasAnnualGoal,
  serviceYear,
}: AnnualGoalInput): number => {
  const months = serviceYearMonths(serviceYear)
  const roles = months.map((m) => roleForMonth(history, currentRole, m))
  if (roles.every((r) => r === roles[0])) return publisherHours[roles[0]] * 12

  return roles.reduce(
    (total, role) =>
      effectiveHasAnnualGoal(role, userSpecifiedHasAnnualGoal)
        ? total + publisherHours[role]
        : total,
    0
  )
}

/** The Service Year (start year) a calendar month belongs to. */
export const serviceYearOfMonth = ({ year, month }: CalendarMonth): number =>
  month < 8 ? year - 1 : year

/**
 * The month whose role speaks for a whole Service Year on year-level surfaces
 * (Year tab, milestones): this month while the Service Year is running,
 * otherwise its final month (August) — the role the year ended in.
 */
export const serviceYearFocusMonth = (
  serviceYear: number,
  now: Date = new Date()
): CalendarMonth => {
  const current = calendarMonthOf(now)
  return serviceYearOfMonth(current) === serviceYear
    ? current
    : { year: serviceYear + 1, month: 7 }
}

/** The Preferences fields month-aware capability resolution reads. */
export type RolePreferences = {
  role: Publisher
  roleHistory: RoleHistory | null
  publisherHours: PublisherHours
  userSpecifiedHasAnnualGoal: boolean | 'default'
  milestoneOverrides: number[] | null
  overrideCreditLimit: boolean
  customCreditLimitHours: number
  logsHours: boolean
}

/**
 * `PublisherCapabilities` for one calendar month: the role that applied that
 * month (per the Role History) and the Annual Goal of its Service Year. Pure
 * counterpart of `usePublisher(target)` for non-React callers.
 */
export const publisherCapabilitiesForMonth = (
  prefs: RolePreferences,
  target: CalendarMonth
): PublisherCapabilities =>
  derivePublisherCapabilities({
    publisher: roleForMonth(prefs.roleHistory, prefs.role, target),
    publisherHours: prefs.publisherHours,
    userSpecifiedHasAnnualGoal: prefs.userSpecifiedHasAnnualGoal,
    milestoneOverrides: prefs.milestoneOverrides,
    overrideCreditLimit: prefs.overrideCreditLimit,
    customCreditLimitHours: prefs.customCreditLimitHours,
    logsHours: prefs.logsHours,
    annualGoalHours: annualGoalHoursForServiceYear({
      history: prefs.roleHistory,
      currentRole: prefs.role,
      publisherHours: prefs.publisherHours,
      userSpecifiedHasAnnualGoal: prefs.userSpecifiedHasAnnualGoal,
      serviceYear: serviceYearOfMonth(target),
    }),
  })
