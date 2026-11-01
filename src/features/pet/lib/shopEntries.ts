import type { Viewport } from '@/lib/pixelArt'
import { STARTER_ROOM_ITEMS, type PetRoomSettings } from '@/types/pet'
import {
  isRoomChoiceUnlocked,
  ROOM_THUMB_VIEWS,
  roomTabSections,
  selectedRoomOption,
  type RoomChoicePart,
} from '@/features/pet/lib/roomOptions'
import { priceOf } from '@/features/pet/lib/prices'
import {
  shopItemState,
  type ShopItemState,
  type ShopTab,
} from '@/features/pet/lib/shop'

export type ShopEntry = {
  part: RoomChoicePart
  option: string

  item: string
  state: ShopItemState

  price: number | null
}

export function shopEntries(
  tab: ShopTab,
  room: PetRoomSettings,
  unlocked: ReadonlySet<string>,

  wallet: number
): { part: RoomChoicePart; entries: ShopEntry[] }[] {
  return roomTabSections(tab, room).map(({ part, options }) => {
    const current = selectedRoomOption(room, part)
    return {
      part,
      entries: options
        .filter(
          (option) =>
            !(STARTER_ROOM_ITEMS as readonly string[]).includes(
              `${part}:${option}`
            )
        )
        .map((option) => {
          const item = `${part}:${option}`
          return {
            part,
            option,
            item,
            price: priceOf(item),
            state: shopItemState({
              item,
              owned: isRoomChoiceUnlocked(part, option, unlocked),
              current: option === current,
              wallet,
            }),
          }
        }),
    }
  })
}

export const isForSale = (entry: Pick<ShopEntry, 'state'>): boolean =>
  entry.state === 'forSale' || entry.state === 'short'

export const isOwned = (entry: Pick<ShopEntry, 'state'>): boolean =>
  entry.state === 'owned' || entry.state === 'current'

export function pickedEntry(
  entries: readonly ShopEntry[],
  item: string | null
): ShopEntry | undefined {
  return (
    entries.find((entry) => entry.item === item) ??
    entries.find(isForSale) ??
    entries.find((entry) => entry.state === 'secret')
  )
}

const SCENE_W = 180
const SCENE_H = 100

export function shopThumbView(
  part: RoomChoicePart,
  w: number,
  h: number
): Viewport {
  const [x, y, vw, vh] = ROOM_THUMB_VIEWS[part]
  const width = Math.min(SCENE_W, Math.max(1, w))
  const height = Math.min(SCENE_H, Math.max(1, h))
  const left = Math.round(x + vw / 2 - width / 2)
  const top = Math.round(y + vh / 2 - height / 2)
  return [
    Math.max(0, Math.min(SCENE_W - width, left)),
    Math.max(0, Math.min(SCENE_H - height, top)),
    width,
    height,
  ]
}

const PREVIEW_TOP: Record<ShopTab, number> = {
  hat: 26,
  wall: 0,
  floor: 44,
  bed: 44,
  shelf: 4,
  lamp: 36,
}

export const shopPreviewView = (tab: ShopTab): Viewport => [
  12,
  PREVIEW_TOP[tab],
  156,
  56,
]
