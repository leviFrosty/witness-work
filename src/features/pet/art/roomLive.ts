import type { ResolvedRoom } from './room'
import { BED_LIVE } from './room/bedLive'
import { FLOOR_LIVE } from './room/floorLive'
import { LAMP_LIVE } from './room/lampLive'
import type { RoomLive, RoomMoment } from './room/live'
import { SHELF_LIVE } from './room/shelfLive'
import { STUDY_LIVE } from './room/studyLive'
import { WALL_LIVE } from './room/wallLive'

export type { RoomLive, RoomMoment }

export interface RoomLiveParts {
  readonly back: readonly NonNullable<RoomLive['back']>[]
  readonly front: readonly NonNullable<RoomLive['front']>[]
  readonly fx: readonly NonNullable<RoomLive['fx']>[]
  readonly dim: readonly NonNullable<RoomLive['dim']>[]
}

const NONE: RoomLiveParts = { back: [], front: [], fx: [], dim: [] }

const byRoom = new WeakMap<ResolvedRoom, RoomLiveParts>()

export function roomLiveItems(room: ResolvedRoom): RoomLive[] {
  const found = [
    WALL_LIVE[room.wallPattern],
    FLOOR_LIVE[room.floor],
    SHELF_LIVE[room.shelf],
    room.study ? STUDY_LIVE[room.study] : undefined,
    BED_LIVE[room.bed],
    LAMP_LIVE[room.lamp],
  ]
  return found.filter((live): live is RoomLive => !!live)
}

export function roomLiveParts(room: ResolvedRoom): RoomLiveParts {
  let parts = byRoom.get(room)
  if (!parts) {
    const items = roomLiveItems(room)
    const pick = <K extends keyof RoomLive>(key: K) =>
      items
        .map((item) => item[key])
        .filter((fn): fn is NonNullable<RoomLive[K]> => !!fn)
    parts =
      items.length === 0
        ? NONE
        : {
            back: pick('back'),
            front: pick('front'),
            fx: pick('fx'),
            dim: pick('dim'),
          }
    byRoom.set(room, parts)
  }
  return parts
}

export const hasRoomLive = (room: ResolvedRoom): boolean =>
  roomLiveParts(room) !== NONE

export function roomLiveDim(parts: RoomLiveParts, m: RoomMoment): number {
  let dim = 0
  for (const of of parts.dim) dim = Math.max(dim, of(m))
  return Math.max(0, Math.min(1, dim))
}
