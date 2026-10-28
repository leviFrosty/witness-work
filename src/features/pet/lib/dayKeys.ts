import moment from 'moment'
import { storedDayKey } from '@/lib/normalizeDate'

/**
 * Day keys (`YYYY-MM-DD`) as whole day numbers, for walking a pet's life one
 * day at a time. The arithmetic runs on the key's UTC midnight, so a day is
 * always exactly one step and DST or a time zone change never skips or repeats
 * one. Keys for stored records come from `storedDayKey`
 * (`src/lib/normalizeDate.ts`); keys for moments in time from `localDayKey`.
 */

const MS_PER_DAY = 86_400_000
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

export const isDayKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  DAY_KEY.test(value) &&
  dayKeyFromNumber(dayNumber(value)) === value

/** Days since 1970-01-01 for a day key; NaN for anything else. */
export function dayNumber(key: string): number {
  const match = DAY_KEY.exec(key)
  if (!match) return NaN
  const [, year, month, day] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / MS_PER_DAY
}

/** The day key `n` days after 1970-01-01. */
export const dayKeyFromNumber = (n: number): string =>
  new Date(n * MS_PER_DAY).toISOString().slice(0, 10)

export const addDays = (key: string, days: number): string =>
  dayKeyFromNumber(dayNumber(key) + days)

/**
 * The Monday that starts `key`'s week (Monday to Sunday, as ISO weeks run), so
 * every device groups days into the same weeks whatever its locale.
 */
export function weekOfDayKey(key: string): string {
  const n = dayNumber(key)
  // 1970-01-01, day 0, was a Thursday: three days after a Monday.
  return dayKeyFromNumber(n - ((((n + 3) % 7) + 7) % 7))
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number =>
  dayNumber(to) - dayNumber(from)

/** The day number of the last day of the month after `key`'s month. */
export function lastDayOfNextMonth(key: string): number {
  const match = DAY_KEY.exec(key)
  if (!match) return NaN
  // Day 0 of the month after next is the last day of the next month.
  return Date.UTC(Number(match[1]), Number(match[2]) + 1, 0) / MS_PER_DAY
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/**
 * The local calendar day a moment in time (Date, epoch ms or ISO string) falls
 * on. Built from the Date's local fields, not `moment`, since the replay reads
 * one per record. "Invalid date" for an unreadable value, as moment says.
 */
export function localDayKey(at: Date | number | string = new Date()): string {
  const date = at instanceof Date ? at : new Date(at)
  const year = date.getFullYear()
  if (!Number.isFinite(year)) return 'Invalid date'
  if (year < 1000 || year > 9999) return moment(date).format('YYYY-MM-DD')
  return `${year}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** A stored calendar day anchored at noon UTC, as JSON gives it back. */
const ANCHORED_ISO = /^(\d{4}-\d{2}-\d{2})T12:00:00(?:\.000)?Z$/

/**
 * `storedDayKey` (`src/lib/normalizeDate.ts`) for a Time Entry's or Plan's
 * stored date, without `moment` for the usual noon-UTC anchor.
 */
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

/** `YYYY-MM` of a day key. */
export const monthOfDayKey = (key: string): string => key.slice(0, 7)
