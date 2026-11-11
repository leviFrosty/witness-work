import type { PixelBuffer, PixelMask } from '@/lib/pixelArt'
import type { Season, TimeOfDay, WallColor } from '@/types/pet'

export interface RoomMoment {
  readonly tMs: number
  readonly time: TimeOfDay
  readonly season: Season
  readonly wallColor: WallColor
  readonly lampLevel: number
  readonly patMs: number
  readonly coinsMs: number
}

export interface RoomLive {
  readonly back?: (buf: PixelBuffer, m: RoomMoment, open: PixelMask) => void

  readonly front?: (layer: PixelBuffer, m: RoomMoment) => void

  readonly fx?: (
    buf: PixelBuffer,
    m: RoomMoment,
    subject: PixelMask,
    open: PixelMask
  ) => void

  readonly dim?: (m: RoomMoment) => number
}

export type RoomLiveSet<T extends string> = Readonly<
  Partial<Record<T, RoomLive>>
>

export const sincePat = (m: RoomMoment): number => m.tMs - m.patMs

export const sinceCoins = (m: RoomMoment): number => m.tMs - m.coinsMs

export const within = (since: number, ms: number): boolean =>
  since >= 0 && since < ms

export const isOpen = (open: PixelMask, x: number, y: number): boolean =>
  x >= 0 &&
  y >= 0 &&
  x < open.width &&
  y < open.height &&
  open.data[y * open.width + x] === 1
