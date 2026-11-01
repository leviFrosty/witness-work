import { createBuffer, createLru, type PixelBuffer } from '@/lib/pixelArt'
import {
  DEFAULT_ROOM,
  HAT_IDS,
  roomItemId,
  STARTER_ROOM_ITEMS,
  UNLOCK_ORDER,
  type HatId,
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

export type WindowTime = 'live' | TimeOfDay

export type WindowSeason = 'live' | Season

export type RoomConfig = PetRoomSettings

export const DEFAULT_ROOM_CONFIG: RoomConfig = DEFAULT_ROOM

export const STARTER_ITEMS: readonly RoomItemId[] = STARTER_ROOM_ITEMS
export { roomItemId, UNLOCK_ORDER }
export type { RoomItemId }

export interface RoomPart<T extends string> {
  readonly options: readonly T[]
  readonly starter: readonly T[]
}

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
  hat: unlockable<HatId>('hat', HAT_IDS),
} as const

export type RoomPartId = keyof typeof ROOM_PARTS

export type RoomPartOption<P extends RoomPartId> =
  (typeof ROOM_PARTS)[P]['options'][number]

export function isRoomOption<P extends RoomPartId>(
  part: P,
  value: unknown
): value is RoomPartOption<P> {
  return (
    typeof value === 'string' &&
    (ROOM_PARTS[part].options as readonly string[]).includes(value)
  )
}

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

  readonly hat?: HatId
}

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
    hat: config.hat,
  }
}

export interface RoomDecor {
  readonly rainbow?: boolean

  readonly sill?: readonly GiftKind[]

  readonly gift?: GiftKind | null
}

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

export function roomBaseKey(
  room: ResolvedRoom,
  sign: SignData,
  decor: RoomDecor = {}
): string {
  const sill = decor.sill?.slice(0, 5).join(',') ?? ''
  return `${roomSignKey(room, sign)}|${decor.rainbow ? 1 : 0}|${sill}|${decor.gift ?? ''}`
}

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
