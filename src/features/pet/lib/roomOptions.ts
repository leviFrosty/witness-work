import type { Viewport } from '@/lib/pixelArt'
import type {
  PetRoomSettings,
  RoomWindow,
  TimeOfDay,
  Season,
} from '@/types/pet'
import { ROOM_PARTS } from '@/features/pet/art'
import { isRoomOptionUnlocked, nextUnlockIn } from '@/features/pet/lib/unlocks'

/**
 * The Decorate Room sheet's model: its tabs, the choices on each, what a choice
 * changes in the room, and the part of the room each thumbnail shows. Pure, so
 * the screen only lays it out.
 */

/** The sheet's tabs, in order. `lamp` is labelled "Light". */
export const ROOM_TABS = [
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
}

/** Whether the pet sits in `part`'s thumbnails (only the bed's frame it). */
export const thumbShowsPet = (part: RoomChoicePart): boolean => part === 'bed'

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
 * When a locked option opens up, in calendar months from now at the earliest: 0
 * this month, 1 next month. Each active month unlocks one item, so with this
 * month not yet active, the next item can still open up this month. Null for an
 * option that's already free (or unknown to this build).
 */
export function unlockMonthsFromNow(
  part: RoomChoicePart,
  option: string,
  activeMonthCount: number,
  thisMonthActive: boolean
): number | null {
  if (part === 'windowTime' || part === 'windowSeason') return null
  const needed = nextUnlockIn(`${part}:${option}`, activeMonthCount)
  if (!needed) return null
  return thisMonthActive ? needed : needed - 1
}
