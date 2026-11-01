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

export const START_HEARTS = 3
export const MAX_HEARTS = 5

export const QUIET_DAYS_BEFORE_DECAY = 10

export const DECAY_EVERY_DAYS = 3
export const DECAY_STEP = 0.5

export const ASLEEP_HEARTS = 0.5

export const QUIET_DAYS_UNTIL_DEATH = 60

export const GOLD_AFTER_FULL_DAYS = 365

export type HeartsPace = 'daily' | 'monthly'

export const MONTHLY_HOLD_MAX_DAYS = 61

export type PetLifeInput = {
  adoptedOn: string

  activeDays: ReadonlySet<string>

  wakes: readonly string[]

  today: string

  paceOf?: (month: string) => HeartsPace

  giftSeed?: string

  petId?: string
}

export type PetLife = {
  hearts: number
  dead: boolean
  mood: PetMood

  asleep: boolean

  quietDays: number

  fullRunDays: number

  goldRunDays: number
  gold: boolean

  goldStartedToday: boolean

  rainbowToday: boolean

  gift: { kind: GiftKind; on: string } | null
}

export function moodOf(hearts: number, dead: boolean): PetMood {
  if (dead) return 'dead'
  if (hearts >= 4.5) return 'happy'
  if (hearts >= 3.5) return 'content'
  if (hearts >= 2.5) return 'ok'
  if (hearts >= 1.5) return 'low'
  if (hearts >= 1) return 'weak'
  return 'nap'
}

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

  if (Number.isFinite(start) && activeDays.has(dayKeyFromNumber(start - 1)))
    start--

  if (!Number.isFinite(start) || start > first) start = first
  const wakeDays = new Set(wakes)
  const seed =
    giftSeed ?? (petId !== undefined ? petGiftSeed({ adoptedOn }) : undefined)

  let hearts = START_HEARTS
  let dead = false

  let quietFrom = start

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
