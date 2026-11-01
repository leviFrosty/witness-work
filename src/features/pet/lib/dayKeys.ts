import moment from 'moment'
import { storedDayKey } from '@/lib/normalizeDate'

const MS_PER_DAY = 86_400_000
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

export const isDayKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  DAY_KEY.test(value) &&
  dayKeyFromNumber(dayNumber(value)) === value

export function dayNumber(key: string): number {
  const match = DAY_KEY.exec(key)
  if (!match) return NaN
  const [, year, month, day] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / MS_PER_DAY
}

export const dayKeyFromNumber = (n: number): string =>
  new Date(n * MS_PER_DAY).toISOString().slice(0, 10)

export const addDays = (key: string, days: number): string =>
  dayKeyFromNumber(dayNumber(key) + days)

export function weekOfDayKey(key: string): string {
  const n = dayNumber(key)

  return dayKeyFromNumber(n - ((((n + 3) % 7) + 7) % 7))
}

export const daysBetween = (from: string, to: string): number =>
  dayNumber(to) - dayNumber(from)

export function lastDayOfNextMonth(key: string): number {
  const match = DAY_KEY.exec(key)
  if (!match) return NaN

  return Date.UTC(Number(match[1]), Number(match[2]) + 1, 0) / MS_PER_DAY
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

export function localDayKey(at: Date | number | string = new Date()): string {
  const date = at instanceof Date ? at : new Date(at)
  const year = date.getFullYear()
  if (!Number.isFinite(year)) return 'Invalid date'
  if (year < 1000 || year > 9999) return moment(date).format('YYYY-MM-DD')
  return `${year}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

const ANCHORED_ISO = /^(\d{4}-\d{2}-\d{2})T12:00:00(?:\.000)?Z$/

export function recordDayKey(date: Date | string): string {
  if (typeof date === 'string') {
    const match = ANCHORED_ISO.exec(date)
    if (match) return match[1]
  } else if (
    date instanceof Date &&
    date.getUTCHours() === 12 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    const key = date.toISOString()
    if (key.length === 24) return key.slice(0, 10)
  }
  return storedDayKey(date)
}

export const monthOfDayKey = (key: string): string => key.slice(0, 7)
