import { publishers } from '@/constants/publisher'
import {
  derivePublisherCapabilities,
  effectiveHasAnnualGoal,
  type PublisherCapabilities,
} from '@/lib/publisherCapabilities'
import { monthlyGoalKey, type CalendarMonth } from '@/lib/monthlyGoals'
import { serviceYearOf } from '@/lib/serviceYear'
import type { Publisher, PublisherHours } from '@/types/publisher'

export type RoleHistory = Readonly<{
  initial: Publisher
  changes: Readonly<Record<string, Publisher>>
}>

const ROLE_HISTORY_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

const isPublisher = (value: unknown): value is Publisher =>
  typeof value === 'string' && (publishers as readonly string[]).includes(value)

export const addCalendarMonths = (
  { year, month }: CalendarMonth,
  count: number
): CalendarMonth => {
  const index = year * 12 + month + count
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 }
}

export const calendarMonthOf = (date: Date = new Date()): CalendarMonth => ({
  year: date.getFullYear(),
  month: date.getMonth(),
})

export const serviceYearMonths = (serviceYear: number): CalendarMonth[] =>
  Array.from({ length: 12 }, (_, i) =>
    addCalendarMonths({ year: serviceYear, month: 8 }, i)
  )

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

export const annualGoalHoursForServiceYear = (input: AnnualGoalInput): number =>
  annualGoalHoursByMonth(input).reduce((total, hours) => total + hours, 0)

export const annualGoalHoursByMonth = ({
  history,
  currentRole,
  publisherHours,
  userSpecifiedHasAnnualGoal,
  serviceYear,
}: AnnualGoalInput): number[] => {
  const months = serviceYearMonths(serviceYear)
  const roles = months.map((m) => roleForMonth(history, currentRole, m))
  if (roles.every((r) => r === roles[0])) {
    return roles.map((role) => publisherHours[role])
  }

  return roles.map((role) =>
    effectiveHasAnnualGoal(role, userSpecifiedHasAnnualGoal)
      ? publisherHours[role]
      : 0
  )
}

export const serviceYearFocusMonth = (
  serviceYear: number,
  now: Date = new Date()
): CalendarMonth => {
  const current = calendarMonthOf(now)
  return serviceYearOf(current) === serviceYear
    ? current
    : { year: serviceYear + 1, month: 7 }
}

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
      serviceYear: serviceYearOf(target),
    }),
  })
