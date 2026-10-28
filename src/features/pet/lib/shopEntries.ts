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

/** One option as the Shop shows it. */
export type ShopEntry = {
  part: RoomChoicePart
  option: string
  /** `part:option`. */
  item: string
  state: ShopItemState
  /** What it costs in coins; null for a starter or a secret. */
  price: number | null
}

/**
 * A Shop category's items, part by part (Wall has a colour and a pattern): all
 * but the starters, which come with the room and are never sold. Owned ones
 * stay, marked owned, so the shelf doesn't move as things are bought.
 */
export function shopEntries(
  tab: ShopTab,
  room: PetRoomSettings,
  unlocked: ReadonlySet<string>,
  /** Coins left to spend. */
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

/** Whether the Shop sells `entry` now: it has a price and isn't owned. */
export const isForSale = (entry: Pick<ShopEntry, 'state'>): boolean =>
  entry.state === 'forSale' || entry.state === 'short'

/** The scene is 180 × 100 pixels. */
const SCENE_W = 180
const SCENE_H = 100

/**
 * A card's picture of `part`: its Decorate Room view, re-cut to `w` × `h`
 * pixels around the same middle and kept inside the scene, so every card's
 * pixels are the Shop's size.
 */
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

/** Where the narrow layout's room strip looks, per category. */
const PREVIEW_TOP: Record<ShopTab, number> = {
  hat: 26,
  wall: 0,
  floor: 44,
  bed: 44,
  shelf: 4,
  lamp: 36,
}

/** The narrow layout's room: a strip of the scene where the category is. */
export const shopPreviewView = (tab: ShopTab): Viewport => [
  12,
  PREVIEW_TOP[tab],
  156,
  56,
]
