import { z } from 'zod/v4'
import { defineReadTool } from '@/features/scribe/tools/types'
import { daysBetween, optionalDay } from '@/features/scribe/tools/shared'
import { allTimeEntries, categoryRef } from '@/features/scribe/runtime/snapshot'
import {
  applyMonthCreditCap,
  getTotalMinutesDetailedForSpecificMonth,
  isCountableEntry,
} from '@/lib/serviceReport'
import { entryMinutes } from '@/lib/entryMinutes'
import { isLdcEntry } from '@/lib/serviceReportCategory'
import { storedDayKey } from '@/lib/normalizeDate'
import {
  publisherCapabilitiesForMonth,
  serviceYearMonths,
} from '@/lib/roleHistory'
import { resolveMonthlyGoalHours, type CalendarMonth } from '@/lib/monthlyGoals'
import { isOwnVisit } from '@/lib/conversations'
import { localDayKey } from '@/features/scribe/runtime/snapshot'
import type { TimeEntry } from '@/types/timeEntry'

const MAX_RANGE_DAYS = 366

const monthKey = ({ year, month }: CalendarMonth) =>
  `${year}-${String(month + 1).padStart(2, '0')}`

export default defineReadTool({
  name: 'time_summary',
  area: 'time',
  description:
    'Totals for a month (YYYY-MM), a service year (its September start year), or a from/to range: send exactly one. For progress and goal questions. Returns minutes, standard and credit minutes (credit cap applied), the goal, Bible studies, days with time and minutes by category.',
  input: z.strictObject({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
    serviceYear: z.int().min(2000).max(2100).nullable(),
    from: optionalDay,
    to: optionalDay,
  }),
  run: ({ month, serviceYear, from, to }, ctx) => {
    const ranged = from !== null || to !== null
    const chosen = [month !== null, serviceYear !== null, ranged].filter(
      Boolean
    )
    if (chosen.length !== 1)
      return {
        ok: false,
        error: 'Send exactly one of month, serviceYear, or from and to.',
      }
    if (ranged && (from === null || to === null))
      return { ok: false, error: 'A range needs both from and to.' }
    if (ranged && daysBetween(from!, to!) < 0)
      return { ok: false, error: '`from` must be on or before `to`.' }
    if (ranged && daysBetween(from!, to!) >= MAX_RANGE_DAYS)
      return { ok: false, error: 'A range can cover at most 366 days.' }

    const prefs = ctx.stores.preferences
    const months: CalendarMonth[] =
      month !== null
        ? [{ year: +month.slice(0, 4), month: +month.slice(5, 7) - 1 }]
        : serviceYear !== null
          ? serviceYearMonths(serviceYear)
          : []
    const inPeriod = (key: string) =>
      ranged
        ? key >= from! && key <= to!
        : months.some((m) => key.startsWith(monthKey(m)))

    const entries = allTimeEntries(ctx.stores.serviceReports).filter((entry) =>
      inPeriod(storedDayKey(entry.date))
    )

    let standard = 0
    let credit = 0
    let creditCounted = 0
    const byMonth = ranged
      ? [{ entries, month: null as CalendarMonth | null }]
      : months.map((m) => ({
          month: m,
          entries: entries.filter((entry) =>
            storedDayKey(entry.date).startsWith(monthKey(m))
          ),
        }))
    for (const group of byMonth) {
      const target = group.month
      const detailed = target
        ? getTotalMinutesDetailedForSpecificMonth(
            group.entries,
            target.month,
            target.year
          )
        : sumRange(group.entries)
      standard += detailed.standard
      credit += detailed.credit
      const cap = target
        ? publisherCapabilitiesForMonth(prefs, target).creditCapMinutes
        : null
      creditCounted +=
        applyMonthCreditCap(detailed.standard, detailed.credit, cap) -
        detailed.standard
    }

    let goalMinutes: number | null = null
    if (month !== null) {
      const caps = publisherCapabilitiesForMonth(prefs, months[0])
      const hours = resolveMonthlyGoalHours(
        caps.monthlyGoalHours,
        prefs.monthlyGoalOverrides,
        months[0]
      )
      goalMinutes = hours > 0 ? Math.round(hours * 60) : null
    } else if (serviceYear !== null) {
      const caps = publisherCapabilitiesForMonth(prefs, months[0])
      goalMinutes =
        caps.hasAnnualGoal && caps.annualGoalHours > 0
          ? Math.round(caps.annualGoalHours * 60)
          : null
    }

    const studied = new Set<string>()
    for (const visit of ctx.stores.visits)
      if (
        visit.isBibleStudy &&
        isOwnVisit(visit) &&
        inPeriod(localDayKey(visit.date))
      )
        studied.add(visit.contact.id)

    const byCategory = new Map<string, number>()
    const days = new Set<string>()
    for (const entry of entries) {
      const ref = categoryRef(ctx.refs, ctx.stores.categories, entry.categoryId)
      byCategory.set(ref, (byCategory.get(ref) ?? 0) + entryMinutes(entry))
      if (isCountableEntry(entry)) days.add(storedDayKey(entry.date))
    }

    return {
      ok: true,
      trust: 'app',
      data: {
        minutes: Math.round(standard + creditCounted),
        standardMinutes: Math.round(standard),
        creditMinutes: Math.round(credit),
        creditCountedMinutes: Math.round(creditCounted),
        goalMinutes,
        studies: studied.size,
        daysWithTime: days.size,
        byCategory: [...byCategory.entries()]
          .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
          .map(([categoryRef, minutes]) => ({ categoryRef, minutes })),
      },
    }
  },
})

function sumRange(entries: TimeEntry[]): { standard: number; credit: number } {
  let standard = 0
  let credit = 0
  for (const entry of entries) {
    if (entry.credit || isLdcEntry(entry)) credit += entryMinutes(entry)
    else standard += entryMinutes(entry)
  }
  return { standard, credit }
}
