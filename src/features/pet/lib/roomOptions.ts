import type { Viewport } from '@/lib/pixelArt'
import type { StreakKind } from '@/lib/serviceStreak'
import type {
  PetRoomSettings,
  RoomWindow,
  TimeOfDay,
  Season,
} from '@/types/pet'
import { ROOM_PARTS, type SilhouetteStyle } from '@/features/pet/art'
import { isSecretItem } from '@/features/pet/lib/secretUnlocks'
import {
  isRoomOptionUnlocked,
  nextUnlockIn,
  unlockStreakFor,
  type UnlockMode,
} from '@/features/pet/lib/unlocks'

/**
 * The Decorate Room sheet's model: its tabs, the choices on each, what a choice
 * changes in the room, and the part of the room each thumbnail shows. Pure, so
 * the screen only lays it out.
 */

/** The sheet's tabs, in order. `lamp` is labelled "Light". */
export const ROOM_TABS = [
  'hat',
  'window',
  'wall',
  'floor',
  'bed',
  'shelf',
  'lamp',
  'sign',
] as const
export type RoomTab = (typeof ROOM_TABS)[number]

/** One row of choices: a room setting and its options in picker order. */
export type RoomChoicePart =
  | 'windowTime'
  | 'windowSeason'
  | 'wallColor'
  | 'wallPattern'
  | 'floor'
  | 'bed'
  | 'shelf'
  | 'lamp'
  | 'sign'
  | 'hat'

export type RoomChoiceSection = {
  part: RoomChoicePart
  options: readonly string[]
}

const section = (part: RoomChoicePart): RoomChoiceSection => ({
  part,
  options: ROOM_PARTS[part].options,
})

/** Whether the window follows the clock and the season (both Live). */
export const isLiveWindow = (window: RoomWindow): boolean =>
  window.time === 'live' && window.season === 'live'

/**
 * The choice sections of `tab`. The window's time and season only show while
 * the window isn't fully Live; each of them can still be Live on its own.
 */
export function roomTabSections(
  tab: RoomTab,
  room: Pick<PetRoomSettings, 'window'>
): RoomChoiceSection[] {
  switch (tab) {
    case 'window':
      return isLiveWindow(room.window)
        ? []
        : [section('windowTime'), section('windowSeason')]
    case 'wall':
      return [section('wallColor'), section('wallPattern')]
    default:
      return [section(tab)]
  }
}

/** The option of `part` the room has now. */
export function selectedRoomOption(
  room: PetRoomSettings,
  part: RoomChoicePart
): string {
  if (part === 'windowTime') return room.window.time
  if (part === 'windowSeason') return room.window.season
  return room[part]
}

/** The `updateRoom` change that picks `option` for `part`. */
export function roomChoicePatch(
  room: PetRoomSettings,
  part: RoomChoicePart,
  option: string
): Partial<PetRoomSettings> {
  if (part === 'windowTime')
    return {
      window: { ...room.window, time: option as RoomWindow['time'] },
    }
  if (part === 'windowSeason')
    return {
      window: { ...room.window, season: option as RoomWindow['season'] },
    }
  return { [part]: option } as Partial<PetRoomSettings>
}

/** The room with `option` picked for `part`, for its thumbnail. */
export const roomWithChoice = (
  room: PetRoomSettings,
  part: RoomChoicePart,
  option: string
): PetRoomSettings => ({ ...room, ...roomChoicePatch(room, part, option) })

/**
 * The Live switch's change: both Live, or both fixed at what the window shows
 * now so turning Live off changes nothing on screen.
 */
export function liveWindowPatch(
  live: boolean,
  now: { time: TimeOfDay; season: Season }
): Partial<PetRoomSettings> {
  return {
    window: live
      ? { time: 'live', season: 'live' }
      : { time: now.time, season: now.season },
  }
}

/**
 * The part of the 180 × 100 scene each thumbnail shows, all 8:5 so the grid
 * lines up.
 */
export const ROOM_THUMB_VIEWS: Readonly<Record<RoomChoicePart, Viewport>> = {
  windowTime: [3, 5, 72, 45],
  windowSeason: [3, 5, 72, 45],
  wallColor: [56, 0, 72, 45],
  wallPattern: [56, 0, 72, 45],
  floor: [0, 55, 72, 45],
  bed: [28, 48, 80, 50],
  shelf: [67, 10, 48, 30],
  lamp: [92, 47, 80, 50],
  sign: [115, 2, 64, 40],
  hat: [36, 36, 64, 40],
}

/** Whether the pet sits in `part`'s thumbnails (the bed's and the hat's). */
export const thumbShowsPet = (part: RoomChoicePart): boolean =>
  part === 'bed' || part === 'hat'

/** Whether `option` of `part` can be picked now. */
export function isRoomChoiceUnlocked(
  part: RoomChoicePart,
  option: string,
  unlocked: ReadonlySet<string>
): boolean {
  if (part === 'windowTime' || part === 'windowSeason') return true
  return isRoomOptionUnlocked(part, option, unlocked)
}

/**
 * What Decorate Room needs to tell which options are open, and how the rest
 * open up.
 */
export type RoomUnlocks = {
  unlocked: ReadonlySet<string>
  mode: UnlockMode
  streakKind: StreakKind
  /** Months with an active day since adoption (months mode). */
  activeMonths: number
  /** This month counts toward unlocks already (months mode). */
  thisMonthActive: boolean
}

/**
 * What opens a locked option: the streak count it opens up at, or (months mode)
 * the calendar months from now at the earliest, 0 this month, 1 next month.
 * Each active month unlocks one item, so with this month not yet active, the
 * next item can still open up this month. A secret item's never says
 * (`secret`): it shows as a silhouette and a question mark.
 */
export type UnlockRequirement =
  | { by: 'streak'; count: number }
  | { by: 'months'; monthsFromNow: number }
  | { by: 'secret' }

/**
 * How a locked option opens up; null for one that's open already, always free,
 * or unknown to this build.
 */
export function unlockRequirement(
  part: RoomChoicePart,
  option: string,
  unlocks: RoomUnlocks
): UnlockRequirement | null {
  if (isRoomChoiceUnlocked(part, option, unlocks.unlocked)) return null
  const item = `${part}:${option}`
  if (isSecretItem(item)) return { by: 'secret' }
  if (unlocks.mode === 'streak') {
    const count = unlockStreakFor(item, unlocks.streakKind)
    return count ? { by: 'streak', count } : null
  }
  const needed = nextUnlockIn(item, unlocks.activeMonths)
  if (!needed) return null
  return {
    by: 'months',
    monthsFromNow: unlocks.thisMonthActive ? needed : needed - 1,
  }
}

/**
 * How a locked secret option's silhouette reads: an object (hat, bed, shelf,
 * lamp) as one flat shadow, a surface (wall, floor) as two shadow tones so its
 * pattern shows but not its colours.
 */
export const silhouetteStyle = (part: RoomChoicePart): SilhouetteStyle =>
  part === 'wallColor' || part === 'wallPattern' || part === 'floor'
    ? 'surface'
    : 'object'

/**
 * Rooms to tell a secret option's own pixels from the rest of its thumbnail, in
 * the order `silhouetteOf` reads them (a few, as each is a scene to draw):
 *
 * - A wall colour: the same wall plain (its pattern becomes the light tone) and
 *   another colour (what isn't wall);
 * - A pattern: the same wall plain, and the pattern in another colour;
 * - A floor: two other floors;
 * - An object (hat, bed, shelf, lamp): the option over another wall and floor, so
 *   the bare wall and floor around it aren't counted even where every other
 *   option covers them, then no hat or the regular options, which hold the pet,
 *   the table and the rest of the room.
 *
 * All are shown by day, so the lamp's glow doesn't count as its shape.
 */
export function silhouetteRooms(
  room: PetRoomSettings,
  part: RoomChoicePart,
  option: string
): { room: PetRoomSettings; references: PetRoomSettings[] } {
  const shown: PetRoomSettings = {
    ...roomWithChoice(room, part, option),
    window: { ...room.window, time: 'day' },
  }
  const other = <T extends string>(current: string, pick: readonly T[]) =>
    pick.filter((value) => value !== current)
  const wallColor = other(shown.wallColor, ['sky', 'rose'])[0]
  let references: PetRoomSettings[]
  if (part === 'wallColor' || part === 'wallPattern') {
    references = [
      { ...shown, wallPattern: 'plain' },
      { ...shown, wallColor },
    ]
  } else if (part === 'floor') {
    references = other(shown.floor, ['wood', 'tile', 'stone'])
      .slice(0, 2)
      .map((floor) => ({ ...shown, floor }))
  } else {
    const backdrop: PetRoomSettings = {
      ...shown,
      wallColor: other(shown.wallColor, ['indigo', 'cream'])[0],
      floor: other(shown.floor, ['lilypond', 'brick'])[0],
    }
    const others =
      part === 'hat'
        ? ['none']
        : (ROOM_PARTS[part].options as readonly string[])
            .filter((o) => o !== option && !isSecretItem(`${part}:${o}`))
            .slice(0, 4)
    references = [
      backdrop,
      ...others.map((o) => roomWithChoice(shown, part, o)),
    ]
  }
  return { room: shown, references }
}
