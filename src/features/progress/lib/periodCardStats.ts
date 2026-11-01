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
import { isOwnVisit } from '@/lib/conversations'
import type { Contact } from '@/types/contact'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'

export type MonthTotal = CalendarMonth & { minutes: number }

const monthIndex = ({ year, month }: CalendarMonth) => year * 12 + month

const entryMinutes = (entry: TimeEntry) =>
  (entry.hours ?? 0) * 60 + (entry.minutes ?? 0)

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

export const firstRecordMonth = (
  serviceReports: TimeEntriesByYear
): CalendarMonth | null => {
  const first = allMonthTotals(serviceReports)[0]
  return first ? { year: first.year, month: first.month } : null
}

export const bestMonth = (totals: MonthTotal[]): MonthTotal | null =>
  totals.reduce<MonthTotal | null>(
    (best, m) => (m.minutes > 0 && m.minutes > (best?.minutes ?? 0) ? m : best),
    null
  )

export type MonthlyAverage = {
  averageMinutes: number

  months: number
}

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
  shared: number

  months: number

  missed: CalendarMonth[]

  longestRun: number
}

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
  contactIds: Set<string>

  peak: (CalendarMonth & { count: number }) | null
}

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
    if (
      !visit.isBibleStudy ||
      !isOwnVisit(visit) ||
      !known.has(visit.contact.id)
    )
      continue
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
  talked: number
  notAtHome: number

  people: number

  newContacts: number
}

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
    if (!isOwnVisit(visit) || !inRange(moment(visit.date))) continue
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

  years: number

  currentOnly: boolean
}

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
