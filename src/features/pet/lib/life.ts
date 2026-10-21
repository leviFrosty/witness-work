import type { GiftKind, PetMood } from '@/types/pet'
import {
  dayKeyFromNumber,
  dayNumber,
  lastDayOfNextMonth,
  localDayKey,
  monthOfDayKey,
} from '@/features/pet/lib/dayKeys'
import {
  GIFT_AFTER_FULL_DAYS,
  GIFT_MIN_SPACING_DAYS,
  giftKindAt,
  isGiftCandidate,
  petGiftSeed,
} from '@/features/pet/lib/gifts'

/**
 * The life model: hearts replayed day by day from the adoption day to today,
 * from synced records only, so every device computes the same pet. Nothing here
 * is stored (ADR 0030, `docs/pet-companion.md`).
 */

export const START_HEARTS = 3
export const MAX_HEARTS = 5
/** Quiet days before hearts start to fade. */
export const QUIET_DAYS_BEFORE_DECAY = 10
/** After that, half a heart fades every this many days. */
export const DECAY_EVERY_DAYS = 3
export const DECAY_STEP = 0.5
/** Fading stops here: the pet is asleep. */
export const ASLEEP_HEARTS = 0.5
/** Quiet days until the pet dies. */
export const QUIET_DAYS_UNTIL_DEATH = 60
/** Days in a row at five hearts until the hearts turn gold. */
export const GOLD_AFTER_FULL_DAYS = 365

/**
 * How a month's active days fill hearts (ADR 0031). `daily`: each adds a heart.
 * `monthly`, for a role that reports only whether it shared: each fills all
 * five, and they hold through the next month before quiet days count.
 */
export type HeartsPace = 'daily' | 'monthly'
/**
 * The most days monthly hearts hold after an active day: from the 1st of a
 * 31-day month through the end of a 31-day next month.
 */
export const MONTHLY_HOLD_MAX_DAYS = 61

export type PetLifeInput = {
  /** Day key of the adoption. */
  adoptedOn: string
  /**
   * Active day keys (`petActiveDays`). The day before adoption counts as after
   * it; earlier days only matter in a `monthly` adoption month (`replay`).
   */
  activeDays: ReadonlySet<string>
  /** Day keys of wake taps. */
  wakes: readonly string[]
  /** Today's local day key. */
  today: string
  /**
   * The hearts' pace in each month (`YYYY-MM`), from that month's role; absent,
   * every month is `daily`. Keep the same function while the roles don't
   * change, for the cache.
   */
  paceOf?: (month: string) => HeartsPace
  /**
   * The pet's `petGiftSeed`; gifts are only worked out when it (or `petId`) is
   * given.
   */
  giftSeed?: string
  /**
   * Older callers: works out gifts from the adoption day, as for a pet without
   * a seed. Prefer `giftSeed`.
   */
  petId?: string
}

export type PetLife = {
  /** 0–5 in half steps; 0 only when the pet died. */
  hearts: number
  dead: boolean
  mood: PetMood
  /** At ½ heart (and not dead): shows Zzz, a tap wakes it. */
  asleep: boolean
  /**
   * Quiet days so far: since the last active day or wake (0 on one), or, after
   * a `monthly` active day, since the end of the next month (0 until then).
   */
  quietDays: number
  /** Days in a row at five hearts, today included; 0 below five. */
  fullRunDays: number
  /** Days the hearts have been gold, 1 on the day they turned; 0 if not. */
  goldRunDays: number
  gold: boolean
  /** Today is the day the hearts turned gold. */
  goldStartedToday: boolean
  /** Today hearts reached five after the pet was asleep or died. */
  rainbowToday: boolean
  /**
   * The latest gift left during the current run at five hearts, kept or not
   * (`pendingGift` checks the keepsakes). Needs `giftSeed` (or `petId`).
   */
  gift: { kind: GiftKind; on: string } | null
}

/** The mood hearts show. */
export function moodOf(hearts: number, dead: boolean): PetMood {
  if (dead) return 'dead'
  if (hearts >= 4.5) return 'happy'
  if (hearts >= 3.5) return 'content'
  if (hearts >= 2.5) return 'ok'
  if (hearts >= 1.5) return 'low'
  if (hearts >= 1) return 'weak'
  return 'nap'
}

/**
 * Results kept by `simulateLife`, so Home and the widget don't evict each
 * other.
 */
const CACHE_SLOTS = 8
let cache: { input: PetLifeInput; life: PetLife }[] = []

const sameInput = (a: PetLifeInput, b: PetLifeInput): boolean =>
  a.adoptedOn === b.adoptedOn &&
  a.activeDays === b.activeDays &&
  a.wakes === b.wakes &&
  a.today === b.today &&
  a.paceOf === b.paceOf &&
  a.giftSeed === b.giftSeed &&
  a.petId === b.petId

/**
 * Replays the pet's life through `today`, one step per day, in O(days):
 *
 * - Starts at 3 hearts on the adoption day, or the day before when that day is
 *   active (another time zone may have recorded it after the adoption). In a
 *   `monthly` month already active before then, starts at 5, held as below.
 * - A wake sets hearts to at least 1 (reviving a pet that died) and restarts the
 *   quiet count. Applied before the day's activity.
 * - An active day adds a heart, up to 5; a pet that died comes back at 1. It also
 *   restarts the quiet count. In a `monthly` month (`paceOf`) it fills all five
 *   hearts, a pet that died included, and the quiet count starts after the end
 *   of the next month.
 * - Otherwise, on quiet day 10, 13, 16, … half a heart fades, never below ½
 *   (asleep). On quiet day 60 the pet dies (0 hearts).
 * - 365 days in a row at 5 turns the hearts gold, until they drop below 5.
 * - Reaching 5 after being asleep or dead since the last time at 5 is a rainbow
 *   day.
 *
 * The last few results are kept while the inputs are the same objects.
 */
export function simulateLife(input: PetLifeInput): PetLife {
  const index = cache.findIndex((slot) => sameInput(slot.input, input))
  if (index >= 0) {
    const [hit] = cache.splice(index, 1)
    cache.push(hit)
    return hit.life
  }
  const [life] = replay(input, 0)
  cache.push({ input, life })
  if (cache.length > CACHE_SLOTS) cache = cache.slice(-CACHE_SLOTS)
  return life
}

let aheadCache: {
  input: PetLifeInput
  days: number
  lives: PetLife[]
} | null = null

/**
 * The pet's life on `today` and each of the next `days` days, as `simulateLife`
 * would give it on each, in one replay. Activity already recorded for those
 * days counts; nothing else new does. The last result is kept while the inputs
 * are the same objects.
 */
export function simulateLifeAhead(
  input: PetLifeInput,
  days: number
): PetLife[] {
  const extra = Math.max(0, Math.floor(days))
  if (
    aheadCache &&
    aheadCache.days === extra &&
    sameInput(aheadCache.input, input)
  )
    return aheadCache.lives
  const lives = replay(input, extra)
  aheadCache = { input, days: extra, lives }
  return lives
}

/** Whether a day of `day`'s month before it is active. */
function activeEarlierInMonth(
  activeDays: ReadonlySet<string>,
  day: number
): boolean {
  const month = monthOfDayKey(dayKeyFromNumber(day))
  for (let earlier = day - 1; ; earlier--) {
    const key = dayKeyFromNumber(earlier)
    if (monthOfDayKey(key) !== month) return false
    if (activeDays.has(key)) return true
  }
}

/** Lives for `today` through `extraDays` after it, in order. */
function replay(
  {
    adoptedOn,
    activeDays,
    wakes,
    today,
    paceOf,
    giftSeed,
    petId,
  }: PetLifeInput,
  extraDays: number
): PetLife[] {
  let first = dayNumber(today)
  if (!Number.isFinite(first)) first = dayNumber(localDayKey())
  const end = first + extraDays
  let start = dayNumber(adoptedOn)
  // An active day the day before counts: a device behind the adopting one's
  // time zone may have recorded it after the adoption.
  if (Number.isFinite(start) && activeDays.has(dayKeyFromNumber(start - 1)))
    start--
  // A bad or future adoption day (a clock that ran ahead) reads as today.
  if (!Number.isFinite(start) || start > first) start = first
  const wakeDays = new Set(wakes)
  const seed =
    giftSeed ?? (petId !== undefined ? petGiftSeed({ adoptedOn }) : undefined)

  let hearts = START_HEARTS
  let dead = false
  // The day quiet days count from; later than today while monthly hearts hold.
  let quietFrom = start
  // At the monthly pace, a month already shared in before adoption has had its
  // one check: hold five hearts, as for a pet adopted before it (ADR 0031).
  const startKey = dayKeyFromNumber(start)
  if (
    paceOf?.(monthOfDayKey(startKey)) === 'monthly' &&
    activeEarlierInMonth(activeDays, start)
  ) {
    hearts = MAX_HEARTS
    quietFrom = lastDayOfNextMonth(startKey)
  }
  let month = ''
  let pace: HeartsPace = 'daily'
  let lowSinceFull = false
  let fullRun = 0
  let rainbowDay = -1
  let lastGiftDay = -Infinity
  let giftCount = 0
  let gift: PetLife['gift'] = null
  const lives: PetLife[] = []

  for (let day = start; day <= end; day++) {
    const key = dayKeyFromNumber(day)
    if (monthOfDayKey(key) !== month) {
      month = monthOfDayKey(key)
      pace = paceOf?.(month) ?? 'daily'
    }
    const woke = wakeDays.has(key)
    const active = activeDays.has(key)
    if (woke) {
      if (dead || hearts < 1) hearts = 1
      dead = false
      quietFrom = Math.max(quietFrom, day)
    }
    if (active) {
      if (pace === 'monthly') {
        hearts = MAX_HEARTS
        quietFrom = Math.max(quietFrom, lastDayOfNextMonth(key))
      } else {
        hearts = dead ? 1 : Math.min(MAX_HEARTS, hearts + 1)
        quietFrom = Math.max(quietFrom, day)
      }
      dead = false
    }
    if (!woke && !active && !dead) {
      const quiet = day - quietFrom
      if (quiet >= QUIET_DAYS_UNTIL_DEATH) {
        dead = true
        hearts = 0
      } else if (
        quiet >= QUIET_DAYS_BEFORE_DECAY &&
        (quiet - QUIET_DAYS_BEFORE_DECAY) % DECAY_EVERY_DAYS === 0
      )
        hearts = Math.max(ASLEEP_HEARTS, hearts - DECAY_STEP)
    }

    if (dead || hearts <= ASLEEP_HEARTS) lowSinceFull = true
    if (hearts >= MAX_HEARTS) {
      if (fullRun === 0 && lowSinceFull) rainbowDay = day
      lowSinceFull = false
      fullRun++
    } else {
      fullRun = 0
      gift = null
    }

    if (
      seed !== undefined &&
      fullRun >= GIFT_AFTER_FULL_DAYS &&
      day - lastGiftDay >= GIFT_MIN_SPACING_DAYS &&
      isGiftCandidate(seed, key)
    ) {
      gift = { kind: giftKindAt(giftCount), on: key }
      giftCount++
      lastGiftDay = day
    }

    if (day < first) continue
    const gold = fullRun >= GOLD_AFTER_FULL_DAYS
    lives.push({
      hearts,
      dead,
      mood: moodOf(hearts, dead),
      asleep: !dead && hearts <= ASLEEP_HEARTS,
      quietDays: Math.max(0, day - quietFrom),
      fullRunDays: fullRun,
      goldRunDays: gold ? fullRun - GOLD_AFTER_FULL_DAYS + 1 : 0,
      gold,
      goldStartedToday: fullRun === GOLD_AFTER_FULL_DAYS,
      rainbowToday: rainbowDay === day,
      gift,
    })
  }
  return lives
}
