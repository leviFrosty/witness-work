/**
 * Picks the Home profile card's greeting from the clock alone — time of day,
 * weekday, and day of month. Never from usage history ("long time no see"), and
 * never from holidays.
 */

import type { TranslationKey } from '@/lib/locales'

/** `key` takes `{{name}}`; `noNameKey` is for publishers without a name. */
export type GreetingVariant = { key: TranslationKey; noNameKey: TranslationKey }

type Period =
  | 'lateNight'
  | 'earlyMorning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'

const named = (key: TranslationKey, noNameKey: TranslationKey) => ({
  key,
  noNameKey,
})
const unnamed = (key: TranslationKey) => ({ key, noNameKey: key })

const VARIANTS: Record<Period, GreetingVariant[]> = {
  lateNight: [
    named('greetingStillUp', 'greetingStillUpNoName'),
    unnamed('greetingNightOwl'),
    named('greetingMidnightOil', 'greetingMidnightOilNoName'),
  ],
  earlyMorning: [
    named('greetingUpEarly', 'greetingUpEarlyNoName'),
    named('greetingRiseAndShine', 'greetingRiseAndShineNoName'),
    unnamed('greetingEarlyBird'),
  ],
  morning: [
    named('greetingGoodMorning', 'greetingGoodMorningNoName'),
    named('greetingMorning', 'greetingMorningNoName'),
    named('greetingMorningGoingWell', 'greetingMorningGoingWellNoName'),
  ],
  afternoon: [
    named('greetingGoodAfternoon', 'greetingGoodAfternoonNoName'),
    named('greetingHeyThere', 'greetingHeyThereNoName'),
    named('greetingDayGoingWell', 'greetingDayGoingWellNoName'),
  ],
  evening: [
    named('greetingGoodEvening', 'greetingGoodEveningNoName'),
    named('greetingEvening', 'greetingEveningNoName'),
    named('greetingHadGoodDay', 'greetingHadGoodDayNoName'),
  ],
  night: [
    named('greetingWindingDown', 'greetingWindingDownNoName'),
    named('greetingGoodEvening', 'greetingGoodEveningNoName'),
    unnamed('greetingNightOwl'),
  ],
}

const PERIOD_ORDER: Period[] = [
  'lateNight',
  'earlyMorning',
  'morning',
  'afternoon',
  'evening',
  'night',
]

const periodOf = (hour: number): Period => {
  if (hour < 5) return 'lateNight'
  if (hour < 7) return 'earlyMorning'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

const SPECIALS = {
  newMonth: named('greetingNewMonth', 'greetingNewMonthNoName'),
  sunday: named('greetingHappySunday', 'greetingHappySundayNoName'),
  monday: named('greetingHappyMonday', 'greetingHappyMondayNoName'),
  friday: named('greetingHappyFriday', 'greetingHappyFridayNoName'),
  saturday: named('greetingHappySaturday', 'greetingHappySaturdayNoName'),
}

/** Calendar moments that outrank the period's rotation while they last. */
const specialFor = (now: Date, period: Period): GreetingVariant | null => {
  const isDaytimeStart = period === 'earlyMorning' || period === 'morning'
  if (isDaytimeStart && now.getDate() === 1) return SPECIALS.newMonth
  switch (now.getDay()) {
    case 0:
      return isDaytimeStart ? SPECIALS.sunday : null
    case 1:
      return isDaytimeStart ? SPECIALS.monday : null
    case 5:
      return period === 'afternoon' || period === 'evening'
        ? SPECIALS.friday
        : null
    case 6:
      return isDaytimeStart ? SPECIALS.saturday : null
    default:
      return null
  }
}

export function pickGreeting(now: Date): GreetingVariant {
  const period = periodOf(now.getHours())
  const special = specialFor(now, period)
  if (special) return special
  // Stable for the whole period, so the card doesn't reshuffle on re-render,
  // and rotates day to day.
  const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5
  const variants = VARIANTS[period]
  return variants[(day + PERIOD_ORDER.indexOf(period)) % variants.length]
}
