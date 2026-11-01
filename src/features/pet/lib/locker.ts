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

export type LockerSection = {
  part: RoomChoicePart

  current: string

  owned: string[]

  forSale: number

  nextForSale: string | null
}

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

const SOLD_PARTS: ReadonlySet<RoomChoicePart> = new Set([
  'hat',
  'wallColor',
  'wallPattern',
  'floor',
  'bed',
  'shelf',
  'lamp',
])

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

export const hasNewRoomItem = (
  room: PetRoomSettings,
  unlocked: ReadonlySet<string>,
  picked: (item: string) => boolean
): boolean => tabsWithNew(room, unlocked, picked).size > 0
