/**
 * Picks Home's greeting. It never names the publisher (only a full name is
 * stored) and never reads absence ("long time no see") or holidays. In order:
 * monthly goal reached, a Service Streak, a calendar moment, the time of day.
 * Streak greetings leave the number to the streak badge beside them, so Home
 * shows one streak.
 */

import type { TranslationKey } from '@/lib/locales'
import { STREAK_MIN } from '@/lib/serviceStreak'

export type GreetingContext = {
  now: Date
  /** The Service Streak as Home shows it; 0 while streaks are hidden. */
  streak: number
  /** This month's Monthly Goal is set and met. */
  goalReached: boolean
}

export type Greeting = { key: TranslationKey }

export const LONG_STREAK = 7

type Period =
  | 'lateNight'
  | 'earlyMorning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'

const BY_PERIOD: Record<Period, TranslationKey[]> = {
  lateNight: ['greetingNightOwl', 'greetingStillUp', 'greetingMidnightOil'],
  earlyMorning: [
    'greetingUpEarly',
    'greetingRiseAndShine',
    'greetingEarlyBird',
  ],
  morning: [
    'greetingGoodMorning',
    'greetingFreshStart',
    'greetingMorningGoingWell',
  ],
  afternoon: [
    'greetingGoodAfternoon',
    'greetingHeyThere',
    'greetingDayGoingWell',
  ],
  evening: [
    'greetingGoodEvening',
    'greetingHadGoodDay',
    'greetingEveningWelcome',
  ],
  night: ['greetingWindingDown', 'greetingGoodEvening', 'greetingNightOwl'],
}

const GOAL_REACHED: TranslationKey[] = [
  'greetingGoalReached',
  'greetingGoalNicelyDone',
  'greetingGoalWayToGo',
]
const STREAK: TranslationKey[] = ['greetingBusyBee', 'greetingStreakOnARoll']
const LONG_STREAK_KEYS: TranslationKey[] = [
  'greetingStreakGoingStrong',
  'greetingStreakLookAtYouGo',
]

const periodOf = (hour: number): Period => {
  if (hour < 5) return 'lateNight'
  if (hour < 7) return 'earlyMorning'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

/** Calendar moments that outrank the period's rotation while they last. */
const calendarKey = (now: Date, period: Period): TranslationKey | null => {
  const isDayStart = period === 'earlyMorning' || period === 'morning'
  if (isDayStart && now.getDate() === 1) return 'greetingNewMonth'
  switch (now.getDay()) {
    case 0:
      return isDayStart ? 'greetingHappySunday' : null
    case 1:
      return isDayStart ? 'greetingHappyMonday' : null
    case 5:
      return period === 'afternoon' || period === 'evening'
        ? 'greetingHappyFriday'
        : null
    case 6:
      return isDayStart ? 'greetingHappySaturday' : null
    default:
      return null
  }
}

/**
 * Stable for the whole day, so the greeting doesn't reshuffle on re-render, and
 * rotates day to day. `salt` keeps lists from moving in lockstep.
 */
const ofTheDay = (keys: TranslationKey[], now: Date, salt: number) => {
  const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5
  return keys[(day + salt) % keys.length]
}

export function pickGreeting({
  now,
  streak,
  goalReached,
}: GreetingContext): Greeting {
  if (goalReached) return { key: ofTheDay(GOAL_REACHED, now, 0) }
  if (streak >= LONG_STREAK) return { key: ofTheDay(LONG_STREAK_KEYS, now, 0) }
  // Cheered from where the streak itself is celebrated.
  if (streak >= STREAK_MIN) return { key: ofTheDay(STREAK, now, 0) }
  const period = periodOf(now.getHours())
  const calendar = calendarKey(now, period)
  if (calendar) return { key: calendar }
  const salt = Object.keys(BY_PERIOD).indexOf(period)
  return { key: ofTheDay(BY_PERIOD[period], now, salt) }
}
