/**
 * The pet's details hold what the User owns, the way a game's locker does; the
 * Shop sells the rest (ADR 0035). This is what the locker shows: each part's
 * owned options, which one is in use, and how many more the Shop has.
 */
import { STARTER_ROOM_ITEMS, type PetRoomSettings } from '@/types/pet'
import { priceOf } from '@/features/pet/lib/prices'
import {
  isRoomChoiceUnlocked,
  ROOM_TABS,
  roomTabSections,
  selectedRoomOption,
  type RoomChoicePart,
  type RoomTab,
} from '@/features/pet/lib/roomOptions'

/** One part of a locker tab (Wall has a colour and a pattern). */
export type LockerSection = {
  part: RoomChoicePart
  /** The option in use. */
  current: string
  /** Owned options, in the registry's order, the one in use among them. */
  owned: string[]
  /** How many of its options the Shop sells that aren't owned yet. */
  forSale: number
  /** The first of those, `part:option`, to open the Shop at; null if none. */
  nextForSale: string | null
}

/** A locker tab's parts: what's owned of each and what's left to buy. */
export function lockerSections(
  tab: RoomTab,
  room: PetRoomSettings,
  unlocked: ReadonlySet<string>
): LockerSection[] {
  return roomTabSections(tab, room).map(({ part, options }) => {
    const current = selectedRoomOption(room, part)
    const owned = options.filter(
      (option) =>
        option === current || isRoomChoiceUnlocked(part, option, unlocked)
    )
    const forSale = options.filter(
      (option) =>
        !owned.includes(option) && priceOf(`${part}:${option}`) !== null
    )
    return {
      part,
      current,
      owned,
      forSale: forSale.length,
      nextForSale: forSale.length > 0 ? `${part}:${forSale[0]}` : null,
    }
  })
}

/** The parts the Shop sells: the ones whose items can say "New". */
const SOLD_PARTS: ReadonlySet<RoomChoicePart> = new Set([
  'hat',
  'wallColor',
  'wallPattern',
  'floor',
  'bed',
  'shelf',
  'lamp',
])

/**
 * Whether an owned option says "New": one the Shop sells or a found secret, not
 * a starter, not the one in use, and never picked on this install (`picked`).
 * Free choices (the sign, the window) never do.
 */
export const isNewOption = (
  part: RoomChoicePart,
  option: string,
  current: string,
  picked: (item: string) => boolean
): boolean => {
  const item = `${part}:${option}`
  return (
    SOLD_PARTS.has(part) &&
    option !== current &&
    !(STARTER_ROOM_ITEMS as readonly string[]).includes(item) &&
    !picked(item)
  )
}

/** The locker tabs that hold an owned item saying "New". */
export function tabsWithNew(
  room: PetRoomSettings,
  unlocked: ReadonlySet<string>,
  picked: (item: string) => boolean
): ReadonlySet<RoomTab> {
  return new Set(
    ROOM_TABS.filter((tab) =>
      lockerSections(tab, room, unlocked).some((section) =>
        section.owned.some((option) =>
          isNewOption(section.part, option, section.current, picked)
        )
      )
    )
  )
}

/** Whether any owned item says "New", so Home's pet card can say so too. */
export const hasNewRoomItem = (
  room: PetRoomSettings,
  unlocked: ReadonlySet<string>,
  picked: (item: string) => boolean
): boolean => tabsWithNew(room, unlocked, picked).size > 0
