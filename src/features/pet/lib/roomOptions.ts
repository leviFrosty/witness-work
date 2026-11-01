import type { Viewport } from '@/lib/pixelArt'
import type {
  PetRoomSettings,
  RoomWindow,
  TimeOfDay,
  Season,
} from '@/types/pet'
import { ROOM_PARTS, type SilhouetteStyle } from '@/features/pet/art'
import { isSecretItem } from '@/features/pet/lib/secretUnlocks'
import { isRoomOptionUnlocked } from '@/features/pet/lib/unlocks'

export const ROOM_TABS = [
  'hat',
  'wall',
  'floor',
  'bed',
  'shelf',
  'lamp',
  'sign',
  'window',
] as const
export type RoomTab = (typeof ROOM_TABS)[number]

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

export const isLiveWindow = (window: RoomWindow): boolean =>
  window.time === 'live' && window.season === 'live'

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

export function selectedRoomOption(
  room: PetRoomSettings,
  part: RoomChoicePart
): string {
  if (part === 'windowTime') return room.window.time
  if (part === 'windowSeason') return room.window.season
  return room[part]
}

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

export const roomWithChoice = (
  room: PetRoomSettings,
  part: RoomChoicePart,
  option: string
): PetRoomSettings => ({ ...room, ...roomChoicePatch(room, part, option) })

export function thumbRoom(
  room: PetRoomSettings,
  part: RoomChoicePart,
  option: string
): PetRoomSettings {
  const picked = roomWithChoice(room, part, option)
  if (part === 'windowTime') return picked
  return { ...picked, window: { ...picked.window, time: 'day' } }
}

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

export const thumbShowsPet = (part: RoomChoicePart): boolean =>
  part === 'bed' || part === 'hat'

export function isRoomChoiceUnlocked(
  part: RoomChoicePart,
  option: string,
  unlocked: ReadonlySet<string>
): boolean {
  if (part === 'windowTime' || part === 'windowSeason') return true
  return isRoomOptionUnlocked(part, option, unlocked)
}

export const silhouetteStyle = (part: RoomChoicePart): SilhouetteStyle =>
  part === 'wallColor' || part === 'wallPattern' || part === 'floor'
    ? 'surface'
    : 'object'

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
