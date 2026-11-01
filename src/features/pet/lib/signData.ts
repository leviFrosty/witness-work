import moment from 'moment'
import type { DigitSystem } from '@/lib/digits'
import { storedDayKey } from '@/lib/normalizeDate'
import { plannedMinutesForDay, type RecurringPlan } from '@/lib/recurrence'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  isCountableEntry,
} from '@/lib/serviceReport'
import { getServiceYearFromDate } from '@/lib/serviceYear'
import type { Publisher } from '@/types/publisher'
import type { DayPlan, TimeEntriesByYear } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import type { SignData } from '@/features/pet/art'

export const NEXT_PLAN_LOOKAHEAD_DAYS = 60

export type SignDataInput = {
  today: Date
  serviceReports: TimeEntriesByYear
  dayPlans: readonly DayPlan[]
  recurringPlans: readonly RecurringPlan[]
  visits: readonly Visit[]

  publisher: Publisher
  creditLimit: { enabled: boolean; customLimitHours: number }

  monthGoalHours: number
  digits: DigitSystem
}

export function serviceYearMonths(
  today: Date
): { month: number; year: number }[] {
  const serviceYear = getServiceYearFromDate(moment(today))
  return Array.from({ length: 12 }, (_, i) => {
    const month = (8 + i) % 12
    return { month, year: month >= 8 ? serviceYear : serviceYear + 1 }
  })
}

export function nextPlannedDay(
  today: Date,
  dayPlans: readonly DayPlan[],
  recurringPlans: readonly RecurringPlan[]
): { day: number; minutes: number } | null {
  const byDay = new Map<string, DayPlan[]>()
  for (const plan of dayPlans) {
    const key = storedDayKey(plan.date)
    byDay.set(key, [...(byDay.get(key) ?? []), plan])
  }
  const start = moment(today).startOf('day')
  for (let d = 0; d <= NEXT_PLAN_LOOKAHEAD_DAYS; d++) {
    const day = start.clone().add(d, 'days')
    const minutes = plannedMinutesForDay(
      day.toDate(),
      byDay.get(day.format('YYYY-MM-DD')) ?? [],
      recurringPlans as RecurringPlan[]
    )
    if (minutes > 0) return { day: day.date(), minutes }
  }
  return null
}

export function visitCountsForMonth(
  visits: readonly Visit[],
  today: Date
): { conversations: number; returnVisits: number } {
  const firstDay = new Map<string, string>()
  for (const visit of visits) {
    const day = moment(visit.date).format('YYYY-MM-DD')
    const first = firstDay.get(visit.contact.id)
    if (!first || day < first) firstDay.set(visit.contact.id, day)
  }
  const month = moment(today).format('YYYY-MM')
  let conversations = 0
  let returnVisits = 0
  for (const visit of visits) {
    const day = moment(visit.date).format('YYYY-MM-DD')
    if (day.slice(0, 7) !== month || visit.receivedAt !== undefined) continue
    if (visit.notAtHome !== true) conversations++
    if (day > (firstDay.get(visit.contact.id) ?? day)) returnVisits++
  }
  return { conversations, returnVisits }
}

export function buildSignData(input: SignDataInput): SignData {
  const { serviceReports, publisher, creditLimit } = input
  const minutesIn = ({ month, year }: { month: number; year: number }) =>
    adjustedMinutesForSpecificMonth(
      getMonthsReports(serviceReports, month, year),
      month,
      year,
      publisher,
      creditLimit
    ).value

  const months = serviceYearMonths(input.today)
  const minutesByMonth = months.map(minutesIn)
  const sharedMonths = months.map((m) =>
    getMonthsReports(serviceReports, m.month, m.year).some(isCountableEntry)
  )
  const currentMonthIndex = (input.today.getMonth() - 8 + 12) % 12
  const plan = nextPlannedDay(input.today, input.dayPlans, input.recurringPlans)
  const { conversations, returnVisits } = visitCountsForMonth(
    input.visits,
    input.today
  )

  return {
    monthMinutes: minutesIn({
      month: input.today.getMonth(),
      year: input.today.getFullYear(),
    }),
    monthGoal: Math.max(0, input.monthGoalHours),
    yearBars: minutesByMonth.map((minutes) => minutes / 60),
    currentMonthIndex,
    yearMinutes: minutesByMonth.reduce((sum, minutes) => sum + minutes, 0),
    sharedMonths,
    planDay: plan?.day ?? null,
    planMinutes: plan?.minutes ?? null,
    conversations,
    returnVisits,
    digits: input.digits,
  }
}
