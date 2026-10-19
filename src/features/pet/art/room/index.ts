/**
 * The pet's room: a registry of swappable parts, the starter set, the unlock
 * order, and the cached room base (everything that doesn't move).
 *
 * Option ids, the starter set and `UNLOCK_ORDER` live once in `@/types/pet`
 * (shared with the store and unlock logic). To add an option: add its id there
 * (and to `UNLOCK_ORDER` unless it's a starter; append only, so earlier unlocks
 * keep their items), then add its art to the part module's table; the type
 * checker flags the missing art.
 */
import { createBuffer, createLru, type PixelBuffer } from '@/lib/pixelArt'
import {
  DEFAULT_ROOM,
  roomItemId,
  STARTER_ROOM_ITEMS,
  UNLOCK_ORDER,
  type PetRoomSettings,
  type RoomItemId,
} from '@/types/pet'

import { SCENE_H, SCENE_W } from '../layout'
import { BED_IDS, drawBedBack, type BedId } from './bed'
import { drawFloor, FLOOR_IDS, type FloorId } from './floor'
import {
  drawKeepsake,
  drawSill,
  RUG_GIFT_POS,
  type GiftKind,
} from './keepsakes'
import { drawStool, LAMP_IDS, LAMPS, type LampId } from './lamp'
import { drawPlant } from './plant'
import { drawShelf, SHELF_IDS, type ShelfId } from './shelf'
import { drawSign, SIGN_IDS, type SignData, type SignId } from './sign'
import {
  drawWall,
  WALL_COLOR_IDS,
  WALL_PATTERN_IDS,
  type WallColor,
  type WallPattern,
} from './wall'
import {
  drawWindow,
  SEASONS,
  TIMES_OF_DAY,
  type Season,
  type TimeOfDay,
} from './window'

export * from './bed'
export * from './floor'
export * from './keepsakes'
export * from './lamp'
export * from './shelf'
export * from './sign'
export * from './wall'
export * from './window'
export { drawPlant } from './plant'

/** Window time setting: a fixed time, or `live` (device clock). */
export type WindowTime = 'live' | TimeOfDay
/** Window season setting: a fixed season, or `live` (date and hemisphere). */
export type WindowSeason = 'live' | Season

/** The room as the user configured it (the persisted room settings). */
export type RoomConfig = PetRoomSettings
/** A new pet's room. */
export const DEFAULT_ROOM_CONFIG: RoomConfig = DEFAULT_ROOM

/** Free from the start (window and sign options are always free). */
export const STARTER_ITEMS: readonly RoomItemId[] = STARTER_ROOM_ITEMS
export { roomItemId, UNLOCK_ORDER }
export type { RoomItemId }

/** One swappable part: its options in picker order and the free ones. */
export interface RoomPart<T extends string> {
  readonly options: readonly T[]
  readonly starter: readonly T[]
}

/** Options of an unlockable part that are in {@link STARTER_ITEMS}. */
function startersOf<T extends string>(
  part: string,
  options: readonly T[]
): T[] {
  const starters = STARTER_ITEMS as readonly string[]
  return options.filter((o) => starters.includes(`${part}:${o}`))
}

const unlockable = <T extends string>(
  part: string,
  options: readonly T[]
): RoomPart<T> => ({
  options,
  starter: startersOf(part, options),
})

const free = <T extends string>(options: readonly T[]): RoomPart<T> => ({
  options,
  starter: options,
})

/** Every swappable part of the room, by picker tab. */
export const ROOM_PARTS = {
  windowTime: free<WindowTime>(['live', ...TIMES_OF_DAY]),
  windowSeason: free<WindowSeason>(['live', ...SEASONS]),
  wallColor: unlockable<WallColor>('wallColor', WALL_COLOR_IDS),
  wallPattern: unlockable<WallPattern>('wallPattern', WALL_PATTERN_IDS),
  floor: unlockable<FloorId>('floor', FLOOR_IDS),
  bed: unlockable<BedId>('bed', BED_IDS),
  shelf: unlockable<ShelfId>('shelf', SHELF_IDS),
  lamp: unlockable<LampId>('lamp', LAMP_IDS),
  sign: free<SignId>(SIGN_IDS),
} as const

export type RoomPartId = keyof typeof ROOM_PARTS

/** The option type of a part. */
export type RoomPartOption<P extends RoomPartId> =
  (typeof ROOM_PARTS)[P]['options'][number]

/** Whether `value` is an option of `part`. */
export function isRoomOption<P extends RoomPartId>(
  part: P,
  value: unknown
): value is RoomPartOption<P> {
  return (
    typeof value === 'string' &&
    (ROOM_PARTS[part].options as readonly string[]).includes(value)
  )
}

/** A room with the live window resolved to a concrete time and season. */
export interface ResolvedRoom {
  readonly time: TimeOfDay
  readonly season: Season
  readonly wallColor: WallColor
  readonly wallPattern: WallPattern
  readonly floor: FloorId
  readonly bed: BedId
  readonly shelf: ShelfId
  readonly lamp: LampId
  readonly sign: SignId
}

/** Resolves `live` window settings with the caller's current time and season. */
export function resolveRoom(
  config: RoomConfig,
  live: { readonly time: TimeOfDay; readonly season: Season }
): ResolvedRoom {
  return {
    time: config.window.time === 'live' ? live.time : config.window.time,
    season:
      config.window.season === 'live' ? live.season : config.window.season,
    wallColor: config.wallColor,
    wallPattern: config.wallPattern,
    floor: config.floor,
    bed: config.bed,
    shelf: config.shelf,
    lamp: config.lamp,
    sign: config.sign,
  }
}

/** Moments drawn into the static room. */
export interface RoomDecor {
  /** Rainbow in the window (callers skip it at night). */
  readonly rainbow?: boolean
  /**
   * Keepsakes on the sill, left to right (the first 5 are drawn; pass the
   * newest).
   */
  readonly sill?: readonly GiftKind[]
  /** A gift waiting on the rug. */
  readonly gift?: GiftKind | null
}

/** Paints the static room into `buf` (180 × 100). */
export function paintRoomBase(
  buf: PixelBuffer,
  room: ResolvedRoom,
  sign: SignData,
  decor: RoomDecor = {}
): void {
  drawWall(buf, room.wallColor, room.wallPattern)
  drawFloor(buf, room.floor)
  drawWindow(buf, {
    time: room.time,
    season: room.season,
    rainbow: decor.rainbow,
  })
  drawShelf(buf, room.shelf)
  drawSign(buf, room.sign, sign, room.wallColor)
  if (decor.sill?.length) drawSill(buf, decor.sill)
  drawPlant(buf)
  if (LAMPS[room.lamp].stool) drawStool(buf)
  drawBedBack(buf, room.bed)
  if (decor.gift)
    drawKeepsake(buf, decor.gift, RUG_GIFT_POS[0], RUG_GIFT_POS[1])
}

const bases = createLru<PixelBuffer>(8)

/**
 * Room + sign keys by object identity. A live scene passes the same room and
 * sign objects every frame, so the key is built once instead of serializing the
 * sign 10 times a second. Other objects with the same values get the same key,
 * so they still hit the base cache. Treat both as immutable.
 */
const roomSignKeys = new WeakMap<ResolvedRoom, WeakMap<SignData, string>>()

function roomSignKey(room: ResolvedRoom, sign: SignData): string {
  let bySign = roomSignKeys.get(room)
  if (!bySign) {
    bySign = new WeakMap()
    roomSignKeys.set(room, bySign)
  }
  let key = bySign.get(sign)
  if (key === undefined) {
    key = JSON.stringify([
      room.time,
      room.season,
      room.wallColor,
      room.wallPattern,
      room.floor,
      room.bed,
      room.shelf,
      room.lamp,
      room.sign,
      room.sign === 'none' ? null : sign,
    ])
    bySign.set(sign, key)
  }
  return key
}

/** A stable cache key for a room base. Sign values only matter when shown. */
export function roomBaseKey(
  room: ResolvedRoom,
  sign: SignData,
  decor: RoomDecor = {}
): string {
  const sill = decor.sill?.slice(0, 5).join(',') ?? ''
  return `${roomSignKey(room, sign)}|${decor.rainbow ? 1 : 0}|${sill}|${decor.gift ?? ''}`
}

/**
 * The static room (wall, floor, window, shelf, sign, plant, stool, bed back
 * layer, keepsakes): 180 × 100, memoized by {@link roomBaseKey}. Shared, so
 * callers must copy before drawing on it.
 */
export function drawRoomBase(
  room: ResolvedRoom,
  sign: SignData,
  decor: RoomDecor = {}
): PixelBuffer {
  return bases.getOrCreate(roomBaseKey(room, sign, decor), () => {
    const buf = createBuffer(SCENE_W, SCENE_H)
    paintRoomBase(buf, room, sign, decor)
    return buf
  })
}
