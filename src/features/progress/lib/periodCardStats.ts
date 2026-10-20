import moment from 'moment'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { addCalendarMonths, serviceYearMonths } from '@/lib/roleHistory'
import {
  applyMonthCreditCap,
  getMonthsReports,
  getServiceYearMonthlyBreakdowns,
  isCountableEntry,
} from '@/lib/serviceReport'
import { getServiceYearReports } from '@/lib/serviceYear'
import type { Contact } from '@/types/contact'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'

/**
 * The figures behind the Year and All Time Progress cards. A Service Year's
 * months are counted as its report counts them (each capped by the credit limit
 * of the role that applied then); All Time counts raw time, as the lifetime
 * total and Year by Year list do.
 */

export type MonthTotal = CalendarMonth & { minutes: number }

const monthIndex = ({ year, month }: CalendarMonth) => year * 12 + month

const entryMinutes = (entry: TimeEntry) =>
  (entry.hours ?? 0) * 60 + (entry.minutes ?? 0)

/**
 * A Service Year's twelve months, September first, each with its total after
 * that month's credit cap (`capFor`, `null` for no limit).
 */
export const serviceYearMonthTotals = (
  serviceReports: TimeEntriesByYear,
  serviceYear: number,
  capFor: (month: CalendarMonth) => number | null
): MonthTotal[] => {
  const totals = new Map<number, number>()
  for (const m of getServiceYearMonthlyBreakdowns(
    getServiceYearReports(serviceReports, serviceYear)
  )) {
    totals.set(
      monthIndex(m),
      applyMonthCreditCap(m.standard, m.credit, capFor(m))
    )
  }
  return serviceYearMonths(serviceYear).map((m) => ({
    ...m,
    minutes: totals.get(monthIndex(m)) ?? 0,
  }))
}

/** Every month with Time Entries, oldest first, with its raw total. */
export const allMonthTotals = (
  serviceReports: TimeEntriesByYear
): MonthTotal[] => {
  const out: MonthTotal[] = []
  for (const year in serviceReports) {
    for (const month in serviceReports[year]) {
      const entries = serviceReports[year][month]
      if (!entries?.length) continue
      out.push({
        year: Number(year),
        month: Number(month),
        minutes: entries.reduce((sum, entry) => sum + entryMinutes(entry), 0),
      })
    }
  }
  return out.sort((a, b) => monthIndex(a) - monthIndex(b))
}

/** The first month with a Time Entry, or `null` with none. */
export const firstRecordMonth = (
  serviceReports: TimeEntriesByYear
): CalendarMonth | null => {
  const first = allMonthTotals(serviceReports)[0]
  return first ? { year: first.year, month: first.month } : null
}

/** The month with the most time, the earliest on a tie; `null` with none. */
export const bestMonth = (totals: MonthTotal[]): MonthTotal | null =>
  totals.reduce<MonthTotal | null>(
    (best, m) => (m.minutes > 0 && m.minutes > (best?.minutes ?? 0) ? m : best),
    null
  )

export type MonthlyAverage = {
  averageMinutes: number
  /** How many months it's over. */
  months: number
}

/**
 * The usual month: from the first month with time to the last one that's ended.
 * The month under way counts only while it's the only one, since a month half
 * done would pull the average down.
 */
export const monthlyAverage = (
  totals: MonthTotal[],
  today: CalendarMonth
): MonthlyAverage | null => {
  const now = monthIndex(today)
  const started = totals.filter((m) => monthIndex(m) <= now)
  const first = started.findIndex((m) => m.minutes > 0)
  if (first < 0) return null
  const span = started.slice(first)
  const ended = span.filter((m) => monthIndex(m) < now)
  const counted = ended.length ? ended : span
  return {
    averageMinutes:
      counted.reduce((sum, m) => sum + m.minutes, 0) / counted.length,
    months: counted.length,
  }
}

export type MonthsShared = {
  /** Months the User shared in the ministry. */
  shared: number
  /**
   * Months that count: every one that's ended, and the month under way once
   * it's shared, since it isn't missed yet.
   */
  months: number
  /** Ended months without any sharing, oldest first. */
  missed: CalendarMonth[]
  /** The most months shared in a row. */
  longestRun: number
}

/**
 * Which of `months` the User shared in the ministry (`isCountableEntry`, so a
 * checkbox month counts the same as one with hours). Months before `since` (the
 * User's first record) aren't counted, since nothing was being kept then.
 */
export const monthsShared = ({
  serviceReports,
  months,
  since,
  today,
}: {
  serviceReports: TimeEntriesByYear
  months: CalendarMonth[]
  since: CalendarMonth | null
  today: CalendarMonth
}): MonthsShared => {
  const now = monthIndex(today)
  const result: MonthsShared = {
    shared: 0,
    months: 0,
    missed: [],
    longestRun: 0,
  }
  if (!since) return result
  let run = 0
  for (const m of months) {
    const at = monthIndex(m)
    if (at < monthIndex(since) || at > now) continue
    const shared = getMonthsReports(serviceReports, m.month, m.year).some(
      isCountableEntry
    )
    if (shared) {
      result.shared += 1
      result.months += 1
      run += 1
      result.longestRun = Math.max(result.longestRun, run)
    } else if (at < now) {
      result.months += 1
      result.missed.push(m)
      run = 0
    }
  }
  return result
}

/** Every calendar month from `from` through `to`, oldest first. */
export const monthsBetween = (
  from: CalendarMonth,
  to: CalendarMonth
): CalendarMonth[] => {
  const count = monthIndex(to) - monthIndex(from) + 1
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    addCalendarMonths(from, i)
  )
}

export type StudyStats = {
  /** Contacts the User studied with at least once. */
  contactIds: Set<string>
  /** The month with the most people studied with, the earliest on a tie. */
  peak: (CalendarMonth & { count: number }) | null
}

/**
 * The people the User studied with (Visits marked as a Bible Study) on dates
 * `inRange` accepts, and the month with the most, as each month's report counts
 * its Bible Studies. Only Contacts still on this device count, as on the
 * month's report.
 */
export const studyStats = ({
  contacts,
  conversations,
  inRange = () => true,
}: {
  contacts: Contact[]
  conversations: Visit[]
  inRange?: (date: moment.Moment) => boolean
}): StudyStats => {
  const known = new Set(contacts.map((c) => c.id))
  const contactIds = new Set<string>()
  const byMonth = new Map<number, Set<string>>()
  for (const visit of conversations) {
    if (!visit.isBibleStudy || !known.has(visit.contact.id)) continue
    const date = moment(visit.date)
    if (!inRange(date)) continue
    contactIds.add(visit.contact.id)
    const key = date.year() * 12 + date.month()
    const people = byMonth.get(key) ?? new Set<string>()
    people.add(visit.contact.id)
    byMonth.set(key, people)
  }
  let peak: StudyStats['peak'] = null
  for (const [key, people] of [...byMonth].sort(([a], [b]) => a - b)) {
    if (!peak || people.size > peak.count) {
      peak = { year: Math.floor(key / 12), month: key % 12, count: people.size }
    }
  }
  return { contactIds, peak }
}

export type VisitStats = {
  /** Visits where someone was home. */
  talked: number
  notAtHome: number
  /** Different people talked with. */
  people: number
  /** Contacts added. */
  newContacts: number
}

/** Visits on dates `inRange` accepts, and the Contacts added then. */
export const visitStats = ({
  contacts,
  conversations,
  inRange = () => true,
}: {
  contacts: Contact[]
  conversations: Visit[]
  inRange?: (date: moment.Moment) => boolean
}): VisitStats => {
  const people = new Set<string>()
  let talked = 0
  let notAtHome = 0
  for (const visit of conversations) {
    if (!inRange(moment(visit.date))) continue
    if (visit.notAtHome) {
      notAtHome += 1
    } else {
      talked += 1
      people.add(visit.contact.id)
    }
  }
  return {
    talked,
    notAtHome,
    people: people.size,
    newContacts: contacts.filter(
      (c) => c.createdAt && inRange(moment(c.createdAt))
    ).length,
  }
}

export type YearlyAverage = {
  averageMinutes: number
  /** Service Years it's over. */
  years: number
  /** Only the Service Year under way has time so far. */
  currentOnly: boolean
}

/**
 * The usual Service Year across `years` (end years, oldest first, each with its
 * total): every one that's ended, or the one under way while it's the only
 * one.
 */
export const yearlyAverage = (
  years: { endYear: number; minutes: number }[],
  currentEndYear: number
): YearlyAverage | null => {
  if (!years.some((y) => y.minutes > 0)) return null
  const ended = years.filter((y) => y.endYear < currentEndYear)
  const counted = ended.length
    ? ended
    : years.filter((y) => y.endYear === currentEndYear)
  return {
    averageMinutes:
      counted.reduce((sum, y) => sum + y.minutes, 0) / counted.length,
    years: counted.length,
    currentOnly: !ended.length,
  }
}
