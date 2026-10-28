/**
 * The Pet widget's slice of the widget snapshot (`WidgetSnapshot.pet`),
 * mirrored by `WidgetSnapshot.Pet` in `targets/widgets/Snapshot.swift`. See
 * `docs/pet-companion.md` → "Widgets" and `docs/widgets.md` → "Pet widget".
 *
 * The images are PNGs the app renders and writes into the App Group's `pet/`
 * folder with `WidgetBridge.writeFile`; each entry names its files. Swift draws
 * the hearts and text itself.
 *
 * Everything here is pure: the records come in as {@link PetWidgetInput}
 * (`petWidgetInput.ts` reads them from the stores) and the PNG encoder is
 * injected, so tests run without Skia.
 */
import moment from 'moment'
import { hashBuffer, type PixelBuffer } from '@/lib/pixelArt'
import i18n, { type TranslationKey } from '@/lib/locales'
import { contentHash } from '@/lib/contentHash'
import { formatMonthDayCompact } from '@/lib/dates'
import { formatMinutesCompact } from '@/lib/minutes'
import { formatNumber } from '@/lib/numbers'
import type { ServiceStreak } from '@/lib/serviceStreak'
import type {
  GiftKind,
  PetMood,
  PetRecord,
  PetRoomRecord,
  PetRoomSettings,
  Season,
  SignId,
  TimeOfDay,
} from '@/types/pet'
import {
  composeScene,
  cropScene,
  DEMO_SIGN_DATA,
  particles as petParticles,
  resolveRoom,
  VIEW_PET_SQUARE,
  VIEW_WIDGET_LARGE,
  type Particle,
  type ParticleState,
  type SceneInput,
} from '@/features/pet/art'
import { daysBetween, localDayKey } from '@/features/pet/lib/dayKeys'
import { shouldShowRainbow } from '@/features/pet/lib/eggs'
import { pendingGift } from '@/features/pet/lib/gifts'
import { lampLevel } from '@/features/pet/lib/lamp'
import {
  MAX_HEARTS,
  MONTHLY_HOLD_MAX_DAYS,
  QUIET_DAYS_UNTIL_DEATH,
  type HeartsPace,
  type PetLife,
} from '@/features/pet/lib/life'
import { resolveWindow } from '@/features/pet/lib/liveWindow'
import { petLifeAhead } from '@/features/pet/lib/petInputs'
import { readPet, readRoom } from '@/features/pet/lib/records'
import { petDisplayName, speciesName } from '@/features/pet/lib/names'
import type { SignData } from '@/features/pet/art'

/** What the widget's text says during one entry. */
export type PetWidgetEntryStatus = {
  /** Lamp brightness, 0 to 5, from the hearts (`lib/lamp.ts`). */
  lampLevel: number
  /** Localized, e.g. "12 days kept". `null` when streaks are hidden or none. */
  lampDaysLabel: string | null
  /** Localized one-liner of the wall sign, e.g. "14.5h of 30h". */
  signLine: string | null
  /** VoiceOver label for the pet and its hearts, localized. */
  accessibilityLabel: string
}

/** One future state of the pet: its images, hearts and text from `date` on. */
export type PetWidgetEntry = {
  /** Epoch ms the entry starts showing, like the rest of the snapshot. */
  date: number
  /**
   * File names in `pet/` (`^[a-z0-9-]+\.png$`). `small` and `medium` are square
   * crops of the pet; `large` is the room, 123:100.
   */
  small: string
  medium: string
  large: string
  /** 0 to 5 in steps of 0.5. */
  hearts: number
  dead: boolean
  gold: boolean
  /** The lamp and sign as of `date`; the top-level fields are the first's. */
  status: PetWidgetEntryStatus
}

export type PetWidgetSnapshot = {
  /** The pet's name, or its localized species name when it has none. */
  name: string
  /**
   * The current entry's hearts, lamp and text. Kept for widget builds older
   * than `PetWidgetEntry.status`; newer ones read each entry's.
   */
  accessibilityLabel: string
  /** Hearts now, 0 to 5 in steps of 0.5. Each entry carries its own. */
  hearts: number
  dead: boolean
  gold: boolean
  lampLevel: number
  lampDaysLabel: string | null
  signLine: string | null
  /**
   * The timeline, oldest first: every hearts, lamp, sign or window time change
   * over the next 48 hours, then the midnights hearts change on until the pet
   * would die, and the first of each month, at most 12 in all. The first may be
   * in the past.
   */
  entries: PetWidgetEntry[]
}

/** How far ahead the dense part of the timeline reaches. */
export const PET_TIMELINE_HOURS = 48
/**
 * How far ahead the sparse part reaches: a pet at five hearts with nothing
 * logged dies on quiet day 60, and monthly hearts hold for up to
 * `MONTHLY_HOLD_MAX_DAYS` before quiet days count.
 */
export const PET_TIMELINE_DAYS =
  MONTHLY_HOLD_MAX_DAYS + QUIET_DAYS_UNTIL_DEATH + 1
/** At most this many entries (and scene renders) per snapshot. */
export const PET_TIMELINE_MAX_ENTRIES = 12
/** Hours the Live window changes its time of day (`timeOfDayAt`). */
export const WINDOW_BOUNDARY_HOURS = [6, 9, 17, 20] as const
/** Keepsakes shown on the window sill. */
const SILL_KEEPSAKES = 5
/**
 * Bump when the widget's images or snapshot change for the same inputs (new
 * art, a new field), so a pet whose inputs didn't change is drawn again.
 */
export const PET_WIDGET_RENDER_VERSION = 1

/** Encodes a pixel buffer as a base64 PNG (`bufferToPngBase64` in the app). */
export type PetWidgetEncoder = (buffer: PixelBuffer) => string | null

/** The wall sign's values on a day, and the date of its next Plan. */
export type PetSignValues = {
  /** `buildSignData` as of that day. */
  sign: SignData
  /** The day of `sign.planDay`, for the text line; null without a plan. */
  nextPlanDate: Date | null
}

/** What the Pet widget reads, gathered from the stores (`petWidgetInput.ts`). */
export type PetWidgetInput = {
  /** The stored companion; null before adoption. */
  pet: PetRecord | null
  /** The stored room; null until customized. */
  room: PetRoomRecord | null
  /** Room defaults for the User's entry mode (`defaultRoomFor`). */
  roomDefaults: PetRoomSettings
  /** `petActiveDays` of the ministry records. */
  activeDays: ReadonlySet<string>
  /** Each month's hearts pace (`selectHeartsPace`). */
  heartsPace: (month: string) => HeartsPace
  /** The streak's label replays "no new activity" from these records. */
  streakAt: (at: Date) => Pick<ServiceStreak, 'kind' | 'count'>
  showStreaks: boolean
  /** The wall sign as of a day, with nothing new logged. */
  signAt: (at: Date) => PetSignValues
  /** Device region, for the Live season's hemisphere. */
  regionCode: string | null
}

/** Everything one widget image depends on, plus the hearts Swift draws. */
export type PetWidgetState = {
  hearts: number
  dead: boolean
  gold: boolean
  mood: PetMood
  asleep: boolean
  lampLevel: number
  time: TimeOfDay
  season: Season
  rainbow: boolean
  gift: GiftKind | null
  sill: GiftKind[]
}

export type PetTimelineEntry = {
  date: number
  state: PetWidgetState
  /** The Service Streak then, for the label beside the lamp's flame. */
  streak: Pick<ServiceStreak, 'kind' | 'count'>
  /** The wall sign then; null with no sign on the wall. */
  sign: PetSignValues | null
}

/** A PNG the snapshot names, to write into `pet/`. */
export type PetWidgetFile = { name: string; base64: string }

export type PetWidgetBuild = {
  /** `null` without a companion. */
  snapshot: PetWidgetSnapshot | null
  /** Every file the snapshot names, small and large. */
  files: PetWidgetFile[]
  /** `PetWidgetPlan.hash` of what was built; null without a companion. */
  hash: string | null
}

/** An image failed to encode; the build is incomplete. */
export class PetWidgetRenderError extends Error {
  constructor(message = 'A pet widget image failed to encode') {
    super(message)
    this.name = 'PetWidgetRenderError'
  }
}

/**
 * Local midnight `days` after the day of `at`, or the first moment of that day
 * where DST skips midnight. Each day is worked out from its date, so a day that
 * starts at 01:00 doesn't move the ones after it.
 */
export function localMidnight(at: Date, days = 0): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate() + days)
}

/** `hour`:00 local on the day `days` after the day of `at`. */
const localHour = (at: Date, days: number, hour: number): Date =>
  new Date(at.getFullYear(), at.getMonth(), at.getDate() + days, hour)

/**
 * Times the widget could look different: the start of the current period, each
 * local midnight, and, with a Live window, each time-of-day boundary, up to 48
 * hours ahead, ascending.
 */
export function timelineChangePoints(
  now: Date,
  liveTime: boolean,
  horizonHours = PET_TIMELINE_HOURS
): Date[] {
  const nowMs = now.getTime()
  const endMs = nowMs + horizonHours * 3_600_000
  let currentStart = localMidnight(now).getTime()
  const points = new Set<number>()
  for (let day = 0; ; day++) {
    const midnight = localMidnight(now, day).getTime()
    if (midnight >= endMs) break
    if (midnight > nowMs) points.add(midnight)
    if (!liveTime) continue
    for (const hour of WINDOW_BOUNDARY_HOURS) {
      const at = localHour(now, day, hour).getTime()
      if (at <= nowMs) currentStart = Math.max(currentStart, at)
      else if (at < endMs) points.add(at)
    }
  }
  return [currentStart, ...[...points].sort((a, b) => a - b)].map(
    (ms) => new Date(ms)
  )
}

/** The fields of the sign that `kind` draws and describes. */
function signKey(kind: SignId, values: PetSignValues | null): unknown {
  if (!values) return null
  const { sign } = values
  switch (kind) {
    case 'none':
      return null
    case 'month':
      return [sign.monthMinutes, sign.monthGoal, sign.digits]
    case 'year':
      return [
        sign.yearBars,
        sign.currentMonthIndex,
        sign.yearMinutes,
        sign.digits,
      ]
    case 'shared':
      return [sign.sharedMonths, sign.currentMonthIndex, sign.digits]
    case 'plan':
      return [
        sign.planDay,
        sign.planMinutes,
        sign.digits,
        values.nextPlanDate ? localDayKey(values.nextPlanDate) : null,
      ]
    case 'convos':
      return [sign.conversations, sign.returnVisits, sign.digits]
  }
}

/** Everything an entry's images and text depend on, apart from its date. */
const entryKey = (
  entry: PetTimelineEntry,
  sign: SignId,
  showStreaks: boolean
) =>
  JSON.stringify([
    entry.state,
    showStreaks && entry.streak.count > 0
      ? [entry.streak.kind, entry.streak.count]
      : null,
    signKey(sign, entry.sign),
  ])

/** Whether the pet looks or counts different from one day to the next. */
const lifeChanged = (before: PetLife, after: PetLife): boolean =>
  before.hearts !== after.hearts ||
  before.dead !== after.dead ||
  before.gold !== after.gold ||
  before.mood !== after.mood ||
  before.asleep !== after.asleep ||
  before.rainbowToday !== after.rainbowToday ||
  before.gift?.on !== after.gift?.on

/** How much a later entry is worth keeping when they don't all fit. */
function sparseRank(entry: PetTimelineEntry, before: PetTimelineEntry): number {
  const { state } = entry
  if (state.dead !== before.state.dead) return 4
  if (state.asleep !== before.state.asleep) return 3
  if (state.mood !== before.state.mood) return 2
  if (
    state.hearts !== before.state.hearts ||
    state.gold !== before.state.gold ||
    state.gift !== before.state.gift
  )
    return 1
  return 0
}

/**
 * The pet's states ahead, assuming nothing new is logged: hearts replayed for
 * each upcoming day (same active days and wakes), the Service Streak and the
 * wall sign on that day, and the Live window's time and season. Identical
 * consecutive states are merged.
 *
 * - Over the next 48 hours: every change point (`timelineChangePoints`).
 * - After that, until the pet would die: each midnight its hearts, mood, gold or
 *   gift change, and the first of each month (sign and season). These show the
 *   window as at noon, since they stand for whole days.
 *
 * At most {@link PET_TIMELINE_MAX_ENTRIES}: the 48 hours first, then the later
 * days whose change matters most (dying, falling asleep, a new mood, other
 * hearts, the month). Empty without a pet.
 */
export function petWidgetTimeline(
  input: PetWidgetInput,
  now: Date
): PetTimelineEntry[] {
  if (!input.pet) return []
  const pet = readPet(input.pet)
  const room = readRoom(input.room, input.roomDefaults)
  const liveTime = room.window.time === 'live'
  const sill = [...pet.keepsakes]
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))
    .slice(-SILL_KEEPSAKES)
    .map((keepsake) => keepsake.kind)

  const todayKey = localDayKey(now)
  const lives = petLifeAhead(
    pet,
    input.activeDays,
    todayKey,
    PET_TIMELINE_DAYS,
    input.heartsPace
  )
  const lifeOn = (dayKey: string): PetLife =>
    lives[
      Math.min(lives.length - 1, Math.max(0, daysBetween(todayKey, dayKey)))
    ]

  const days = new Map<
    string,
    {
      streak: Pick<ServiceStreak, 'kind' | 'count'>
      sign: PetSignValues | null
    }
  >()
  const dayValues = (at: Date) => {
    const key = localDayKey(at)
    let day = days.get(key)
    if (!day) {
      const streak = input.streakAt(at)
      day = {
        streak: { kind: streak.kind, count: streak.count },
        sign: room.sign === 'none' ? null : input.signAt(at),
      }
      days.set(key, day)
    }
    return day
  }

  /** The entry from `at`, with the window as at `windowAt`. */
  const entryAt = (at: Date, windowAt: Date): PetTimelineEntry => {
    const life = lifeOn(localDayKey(at))
    const { streak, sign } = dayValues(at)
    const window = resolveWindow(room.window, windowAt, input.regionCode)
    return {
      date: at.getTime(),
      state: {
        hearts: life.hearts,
        dead: life.dead,
        gold: life.gold,
        mood: life.mood,
        asleep: life.asleep,
        // The lamp follows the hearts (ADR 0035).
        lampLevel: lampLevel(life),
        time: window.time,
        season: window.season,
        rainbow: shouldShowRainbow(life, window),
        gift: pendingGift({ life, keepsakes: pet.keepsakes })?.kind ?? null,
        sill,
      },
      streak,
      sign,
    }
  }

  const keyOf = (entry: PetTimelineEntry) =>
    entryKey(entry, room.sign, input.showStreaks)

  const dense: PetTimelineEntry[] = []
  let lastKey = ''
  for (const at of timelineChangePoints(now, liveTime)) {
    const entry = entryAt(at, at)
    const key = keyOf(entry)
    if (key === lastKey) continue
    lastKey = key
    dense.push(entry)
    if (dense.length >= PET_TIMELINE_MAX_ENTRIES) return dense
  }

  // Whole days after the 48 hours, until the pet would have died: the ones
  // its life changes on, and each first of the month. The lamp and sign are
  // read only on those days.
  const denseEndMs = now.getTime() + PET_TIMELINE_HOURS * 3_600_000
  const sparse: { entry: PetTimelineEntry; rank: number }[] = []
  let previous = dense[dense.length - 1]
  for (let day = 1; day <= PET_TIMELINE_DAYS && day < lives.length; day++) {
    const midnight = localMidnight(now, day)
    if (midnight.getTime() < denseEndMs) continue
    if (midnight.getDate() !== 1 && !lifeChanged(lives[day - 1], lives[day]))
      continue
    const entry = entryAt(midnight, localHour(now, day, 12))
    if (previous && keyOf(entry) === keyOf(previous)) continue
    sparse.push({ entry, rank: previous ? sparseRank(entry, previous) : 0 })
    previous = entry
  }
  const slots = PET_TIMELINE_MAX_ENTRIES - dense.length
  const kept = [...sparse]
    .sort((a, b) => b.rank - a.rank || a.entry.date - b.entry.date)
    .slice(0, slots)
    .map(({ entry }) => entry)
    .sort((a, b) => a.date - b.date)
  return [...dense, ...kept]
}

/** Zzz over a sleeping pet, frozen mid-drift (pet-relative, like `step`). */
const STATIC_ZZZ: readonly Particle[] = [
  { kind: 'zzz', x: 20, y: -3, bornMs: 0, lifeMs: 2200 },
  { kind: 'zzz', x: 25, y: -10, bornMs: -1700, lifeMs: 2200 },
]
/** Gold sparkles around the pet, two as stars and two as dots. */
const STATIC_SPARKLES: readonly Particle[] = [
  { kind: 'sparkle', x: 1, y: 6, bornMs: -450, lifeMs: 900 },
  { kind: 'sparkle', x: 28, y: 3, bornMs: -150, lifeMs: 900 },
  { kind: 'sparkle', x: 3, y: 21, bornMs: -150, lifeMs: 900 },
  { kind: 'sparkle', x: 29, y: 17, bornMs: -450, lifeMs: 900 },
]

function staticParticles(state: PetWidgetState): ParticleState | null {
  const particles = [
    ...(state.asleep ? STATIC_ZZZ : []),
    ...(state.gold && !state.dead ? STATIC_SPARKLES : []),
  ]
  if (particles.length === 0) return null
  return { ...petParticles.createParticles(1), particles }
}

/**
 * One still frame of the state: no motion, idle pose at t = 0, no visitor,
 * paradise or shooting star (the widget can't animate them).
 */
export function petWidgetScene(
  pet: PetRecord,
  room: PetRoomSettings,
  sign: SignData,
  state: PetWidgetState
): PixelBuffer {
  const input: SceneInput = {
    room: resolveRoom(room, { time: state.time, season: state.season }),
    sign,
    lampLevel: state.lampLevel,
    pet: { species: pet.species, coat: pet.coat, mood: state.mood, seed: 0 },
    moments: {
      rainbow: state.rainbow,
      gold: state.gold,
      gift: state.gift,
      sill: state.sill,
    },
    particles: staticParticles(state),
    reduceMotion: true,
  }
  return composeScene(input, 0)
}

/** `pet-<hash>.png`: the same pixels always get the same name. */
export const petImageName = (buffer: PixelBuffer): string =>
  `pet-${hashBuffer(buffer).toString(16).padStart(8, '0')}.png`

type RenderedImages = { small: PetWidgetFile; large: PetWidgetFile }

/**
 * Rendered images by their `PetWidgetPlanEntry.imageKey` (a hash of everything
 * they depend on), so an unchanged state isn't composed or encoded again.
 * Bounded; the least recently used goes first.
 */
export function createPetImageCache(limit = 32) {
  const entries = new Map<string, RenderedImages>()
  return {
    get(key: string): RenderedImages | undefined {
      const hit = entries.get(key)
      if (hit) {
        entries.delete(key)
        entries.set(key, hit)
      }
      return hit
    },
    set(key: string, images: RenderedImages): void {
      entries.delete(key)
      entries.set(key, images)
      while (entries.size > limit) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
    },
    get size() {
      return entries.size
    },
  }
}

export type PetImageCache = ReturnType<typeof createPetImageCache>

const sharedCache = createPetImageCache()

const t = (key: string, options?: Record<string, unknown>): string =>
  i18n.t(key as TranslationKey, options)

/** "Biscuit, Lion cub, 4.5 of 5 hearts" for VoiceOver. */
export function petAccessibilityLabel(
  pet: Pick<PetRecord, 'name' | 'species'>,
  hearts: number
): string {
  const species = speciesName(pet.species)
  const values = {
    species,
    hearts: formatNumber(hearts, { maximumFractionDigits: 1 }),
    max: MAX_HEARTS,
  }
  const name = pet.name?.trim()
  return name
    ? t('pet.widget.accessibilityLabel', { ...values, name })
    : t('pet.widget.accessibilityLabelUnnamed', values)
}

/**
 * The Service Streak beside the lamp's flame, "12 days kept" or "3 months
 * kept". Null with streaks hidden or no streak.
 */
export function petLampDaysLabel(
  streak: Pick<ServiceStreak, 'kind' | 'count'>,
  showStreaks: boolean
): string | null {
  if (!showStreaks || streak.count <= 0) return null
  return t(
    streak.kind === 'months' ? 'pet.widget.lampMonths' : 'pet.widget.lampDays',
    { count: streak.count }
  )
}

/** Minutes as the widget's compact duration, "0h" for none. */
const compactMinutes = (minutes: number): string =>
  formatMinutesCompact(minutes) || formatMinutesCompact(0, { unit: 'hours' })

/** The wall sign's value as one short line; null for no sign. */
export function petSignLine(
  kind: SignId,
  sign: SignData,
  nextPlanDate: Date | null
): string | null {
  switch (kind) {
    case 'none':
      return null
    case 'month':
      return sign.monthGoal > 0
        ? t('pet.widget.signMonth', {
            value: compactMinutes(sign.monthMinutes),
            goal: formatMinutesCompact(sign.monthGoal, { unit: 'hours' }),
          })
        : t('pet.widget.signMonthNoGoal', {
            value: compactMinutes(sign.monthMinutes),
          })
    case 'year':
      return t('pet.widget.signYear', {
        value: compactMinutes(sign.yearMinutes),
      })
    case 'shared':
      return t('pet.widget.signShared', {
        count: sign.sharedMonths.filter(Boolean).length,
        total: sign.sharedMonths.length,
      })
    case 'plan':
      return nextPlanDate && sign.planMinutes !== null
        ? t('pet.widget.signPlan', {
            date: formatMonthDayCompact(moment(nextPlanDate)),
            duration: compactMinutes(sign.planMinutes),
          })
        : t('pet.widget.signPlanNone')
    case 'convos':
      return t('pet.widget.signConvos', {
        conversations: t('pet.widget.conversations', {
          count: sign.conversations,
        }),
        returnVisits: t('pet.widget.returnVisits', {
          count: sign.returnVisits,
        }),
      })
  }
}

/** One planned entry: its snapshot fields and what its images are drawn from. */
export type PetWidgetPlanEntry = {
  entry: Omit<PetWidgetEntry, 'small' | 'medium' | 'large'>
  state: PetWidgetState
  /** The sign the room draws; null with no sign on the wall. */
  sign: SignData | null
  /** `contentHash` of everything the images depend on. */
  imageKey: string
}

/** The `pet` slice worked out without drawing anything. */
export type PetWidgetPlan = {
  pet: PetRecord
  room: PetRoomSettings
  name: string
  entries: PetWidgetPlanEntry[]
  /**
   * `contentHash` of the whole slice but its image names: the same hash means
   * the same snapshot, so a push can skip drawing it again.
   */
  hash: string
}

/**
 * The `pet` slice as it will be, without rendering: the timeline, each entry's
 * text, and a hash of every input the images and text depend on (life, room,
 * species and coat, sign values, lamp, window time and season, moments). Null
 * without a pet.
 */
export function planPetWidget(
  input: PetWidgetInput,
  now: Date
): PetWidgetPlan | null {
  if (!input.pet) return null
  const pet = readPet(input.pet)
  const room = readRoom(input.room, input.roomDefaults)
  const name = petDisplayName(pet)
  const entries = petWidgetTimeline(input, now).map(
    ({ date, state, streak, sign }): PetWidgetPlanEntry => {
      const drawn = room.sign === 'none' || !sign ? null : sign.sign
      return {
        entry: {
          date,
          hearts: state.hearts,
          dead: state.dead,
          gold: state.gold,
          status: {
            lampLevel: state.lampLevel,
            lampDaysLabel: petLampDaysLabel(streak, input.showStreaks),
            signLine: sign
              ? petSignLine(room.sign, sign.sign, sign.nextPlanDate)
              : null,
            accessibilityLabel: petAccessibilityLabel(pet, state.hearts),
          },
        },
        state,
        sign: drawn,
        imageKey: contentHash(
          JSON.stringify([
            PET_WIDGET_RENDER_VERSION,
            pet.species,
            pet.coat,
            room,
            { ...state, hearts: undefined },
            signKey(room.sign, sign),
          ])
        ),
      }
    }
  )
  const hash = contentHash(
    JSON.stringify([
      PET_WIDGET_RENDER_VERSION,
      name,
      entries.map(({ entry, imageKey }) => [entry, imageKey]),
    ])
  )
  return { pet, room, name, entries, hash }
}

/**
 * Draws a plan: one still frame per entry not already in `cache` (by its image
 * key), cropped and encoded. Throws {@link PetWidgetRenderError} when an image
 * fails to encode, so a half-drawn slice is never written.
 */
export function renderPetWidget(
  plan: PetWidgetPlan,
  encode: PetWidgetEncoder,
  cache: PetImageCache = sharedCache
): PetWidgetBuild {
  const files = new Map<string, PetWidgetFile>()
  const entries: PetWidgetEntry[] = []
  for (const { entry, state, sign, imageKey } of plan.entries) {
    let images = cache.get(imageKey)
    if (!images) {
      const scene = petWidgetScene(
        plan.pet,
        plan.room,
        sign ?? DEMO_SIGN_DATA,
        state
      )
      const small = cropScene(scene, VIEW_PET_SQUARE)
      const large = cropScene(scene, VIEW_WIDGET_LARGE)
      const smallData = encode(small)
      const largeData = encode(large)
      if (smallData === null || largeData === null)
        throw new PetWidgetRenderError()
      images = {
        small: { name: petImageName(small), base64: smallData },
        large: { name: petImageName(large), base64: largeData },
      }
      cache.set(imageKey, images)
    }
    files.set(images.small.name, images.small)
    files.set(images.large.name, images.large)
    entries.push({
      ...entry,
      small: images.small.name,
      medium: images.small.name,
      large: images.large.name,
    })
  }

  const current = entries[0]
  return {
    snapshot: {
      name: plan.name,
      accessibilityLabel:
        current?.status.accessibilityLabel ??
        petAccessibilityLabel(plan.pet, 0),
      hearts: current?.hearts ?? 0,
      dead: current?.dead ?? false,
      gold: current?.gold ?? false,
      lampLevel: current?.status.lampLevel ?? 0,
      lampDaysLabel: current?.status.lampDaysLabel ?? null,
      signLine: current?.status.signLine ?? null,
      entries,
    },
    files: [...files.values()],
    hash: plan.hash,
  }
}

/**
 * The `pet` slice and the PNGs it names (`planPetWidget` then
 * `renderPetWidget`). Null snapshot without a pet.
 */
export function buildPetWidget(
  input: PetWidgetInput,
  now: Date,
  encode: PetWidgetEncoder,
  cache: PetImageCache = sharedCache
): PetWidgetBuild {
  const plan = planPetWidget(input, now)
  if (!plan) return { snapshot: null, files: [], hash: null }
  return renderPetWidget(plan, encode, cache)
}
