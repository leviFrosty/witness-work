import moment from 'moment'
import { TimeEntriesByYear } from '@/types/timeEntry'
import { storedDayKey } from '@/lib/normalizeDate'
import { isCountableEntry } from '@/lib/serviceReport'
import { entryMinutes } from '@/lib/entryMinutes'
import { isOwnVisit } from '@/lib/conversations'
import { Visit } from '@/types/visit'

const dayKey = (d: moment.Moment) => d.format('YYYY-MM-DD')

const pad2 = (n: number) => String(n).padStart(2, '0')

const localDateKey = (date: Date | string) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const weekdayOfKey = (key: string) =>
  new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10))
  ).getDay()

export const flattenDailyMinutes = (
  reports: TimeEntriesByYear
): Map<string, number> => {
  const out = new Map<string, number>()
  for (const year of Object.values(reports)) {
    for (const month of Object.values(year)) {
      for (const r of month) {
        if (!isCountableEntry(r)) continue
        const key = storedDayKey(r.date)
        const minutes = entryMinutes(r)
        out.set(key, (out.get(key) || 0) + minutes)
      }
    }
  }
  return out
}

export const minutesInTrailingDays = (
  daily: Map<string, number>,
  days: number,
  now: Date = new Date()
): number => {
  let total = 0
  const cursor = moment(now).startOf('day')
  for (let i = 0; i < days; i++) {
    total += daily.get(dayKey(cursor.clone().subtract(i, 'days'))) || 0
  }
  return total
}

export const busiestWeekday = (
  daily: Map<string, number>,
  visits: Pick<Visit, 'date' | 'receivedAt'>[],
  now: Date = new Date()
): number | null => {
  const today = dayKey(moment(now))
  const yearAgo = dayKey(moment(now).subtract(1, 'year'))
  const inPastYear = (key: string) => key > yearAgo && key <= today

  const activeDays = new Map<string, number>()
  for (const [key, minutes] of daily) {
    if (minutes > 0 && inPastYear(key)) activeDays.set(key, minutes)
  }
  for (const visit of visits) {
    if (!isOwnVisit(visit)) continue
    const key = localDateKey(visit.date)
    if (inPastYear(key) && !activeDays.has(key)) activeDays.set(key, 0)
  }

  const days = Array<number>(7).fill(0)
  const minutes = Array<number>(7).fill(0)
  const latest = Array<string>(7).fill('')
  for (const [key, dayMinutes] of activeDays) {
    const weekday = weekdayOfKey(key)
    days[weekday]++
    minutes[weekday] += dayMinutes
    if (key > latest[weekday]) latest[weekday] = key
  }

  let busiest: number | null = null
  for (let weekday = 0; weekday < 7; weekday++) {
    if (days[weekday] === 0) continue
    if (
      busiest === null ||
      days[weekday] > days[busiest] ||
      (days[weekday] === days[busiest] &&
        (minutes[weekday] > minutes[busiest] ||
          (minutes[weekday] === minutes[busiest] &&
            latest[weekday] > latest[busiest])))
    ) {
      busiest = weekday
    }
  }
  return busiest
}

export const totalMinutes = (daily: Map<string, number>): number => {
  let total = 0
  for (const m of daily.values()) total += m
  return total
}

export const daysLogged = (daily: Map<string, number>): number => {
  let n = 0
  for (const m of daily.values()) if (m > 0) n++
  return n
}

export * from '@/lib/contributionGrid'
