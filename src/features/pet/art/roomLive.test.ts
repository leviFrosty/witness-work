import { describe, expect, it } from 'vitest'

import {
  createBuffer,
  crop,
  hashBuffer,
  isOpaque,
  opaqueBounds,
  type PixelBuffer,
} from '@/lib/pixelArt'
import { itemReactions } from '@/features/pet/lib/itemReactions'
import { ROOM_THUMB_VIEWS } from '@/features/pet/lib/roomOptions'
import { RARE_ROOM_ITEMS, UNCOMMON_ROOM_ITEMS } from '@/types/pet'

import {
  composeScene,
  DEMO_SIGN_DATA,
  ROOM_PARTS,
  type ResolvedRoom,
  type SceneInput,
} from '.'
import { paintRocker, STUDY_FLOOR_Y } from './room/study'

type LivePart = 'wallPattern' | 'floor' | 'bed' | 'shelf' | 'lamp' | 'study'

const ROOM: ResolvedRoom = {
  time: 'day',
  season: 'summer',
  wallColor: 'cream',
  wallPattern: 'plain',
  floor: 'wood',
  bed: 'rug',
  shelf: 'scrolls',
  lamp: 'clay',
  sign: 'none',
  study: 'none',
}

const split = (item: string) => item.split(':') as [LivePart, string]

const roomItems = (items: readonly string[]) =>
  items.filter((item) => !item.startsWith('hat:')).map(split)

const UNCOMMON = roomItems(UNCOMMON_ROOM_ITEMS)
const RARE = roomItems(RARE_ROOM_ITEMS)
const MOVING = [...UNCOMMON, ...RARE]

const input = (
  part: LivePart,
  option: string,
  over: Partial<SceneInput> = {}
): SceneInput => ({
  room: { ...ROOM, [part]: option } as ResolvedRoom,
  sign: DEMO_SIGN_DATA,
  lampLevel: 4,
  pet: { species: 'dog', coat: 'gold', mood: 'happy', seed: 1000 },
  ...over,
})

const drawn = (
  part: LivePart,
  option: string,
  at: number,
  over: Partial<SceneInput> = {}
) => hashBuffer(composeScene(input(part, option, over), at))

const IDLE = [0, 500, 1300, 2600, 5200, 9100]
const AFTER = [0, 100, 250, 500, 900, 1500, 2400]

describe('uncommon and rare room items', () => {
  it('has two uncommon and two rare of every part the Shop sells', () => {
    for (const part of [
      'wallPattern',
      'floor',
      'bed',
      'shelf',
      'lamp',
      'study',
    ]) {
      expect(UNCOMMON.filter(([p]) => p === part)).toHaveLength(2)
      expect(RARE.filter(([p]) => p === part)).toHaveLength(2)
    }
  })

  it.each(MOVING)('%s %s has art of its own', (part, option) => {
    const still = (o: string) =>
      hashBuffer(crop(composeScene(input(part, o), 0), ROOM_THUMB_VIEWS[part]))
    const mine = still(option)
    for (const other of ROOM_PARTS[part].options as readonly string[])
      if (other !== option) expect(still(other)).not.toBe(mine)
  })

  it.each(MOVING.filter(([part]) => part !== 'lamp'))(
    '%s %s moves',
    (part, option) => {
      const frames = (o: string) =>
        new Set(
          IDLE.map((t) =>
            hashBuffer(
              crop(
                composeScene(input(part, o, { lampLevel: 0, pet: null }), t),
                ROOM_THUMB_VIEWS[part]
              )
            )
          )
        ).size
      expect(frames(part === 'wallPattern' ? 'plain' : ROOM[part]!)).toBe(1)
      expect(frames(option)).toBeGreaterThan(2)
    }
  )

  it.each(RARE)('%s %s answers a pat and new coins', (part, option) => {
    expect(itemReactions(`${part}:${option}`)).toEqual(['pat', 'coins'])
    const reacts = (over: Partial<SceneInput>) =>
      AFTER.some(
        (t) =>
          drawn(part, option, 5000 + t, over) !== drawn(part, option, 5000 + t)
      )
    expect(reacts({ hatPatMs: 5000 })).toBe(true)
    expect(reacts({ hatCoinsMs: 5000 })).toBe(true)
  })

  it.each(UNCOMMON)('%s %s only moves', (part, option) => {
    expect(itemReactions(`${part}:${option}`)).toEqual([])
  })

  it.each(MOVING)('%s %s is the same for the same moment', (part, option) => {
    const over = { hatPatMs: 900, hatCoinsMs: 1200 }
    expect(drawn(part, option, 1700, over)).toBe(
      drawn(part, option, 1700, over)
    )
  })
})

describe('rocking chair', () => {
  const chair = (tilt: number) => {
    const buf = createBuffer(96, 96)
    paintRocker(buf, tilt)
    return buf
  }
  const rows = (buf: PixelBuffer, y: number) => {
    const xs: number[] = []
    for (let x = 0; x < buf.width; x++) if (isOpaque(buf, x, y)) xs.push(x)
    return xs
  }
  const middle = (xs: readonly number[]) => (xs[0] + xs[xs.length - 1]) / 2
  const TILTS = Array.from({ length: 41 }, (_, i) => (i - 20) * 0.005)

  it('keeps its runners on the floor at every tilt', () => {
    for (const tilt of TILTS) {
      const [, top, , height] = opaqueBounds(chair(tilt))!
      expect(top + height).toBe(STUDY_FLOOR_Y)
    }
  })

  it('rolls the way it tips, back and runners together', () => {
    const at = (tilt: number) => {
      const buf = chair(tilt)
      const [, top] = opaqueBounds(buf)!
      return {
        back: middle(rows(buf, top)),
        foot: middle(rows(buf, STUDY_FLOOR_Y - 1)),
      }
    }
    const rest = at(0)
    const forward = at(0.1)
    const backward = at(-0.1)
    expect(forward.foot).toBeGreaterThan(rest.foot)
    expect(forward.back).toBeGreaterThan(rest.back)
    expect(backward.foot).toBeLessThan(rest.foot)
    expect(backward.back).toBeLessThan(rest.back)
  })

  it('has the same number of pixels however far it tips', () => {
    const count = (buf: PixelBuffer) => {
      let n = 0
      for (let y = 0; y < buf.height; y++) n += rows(buf, y).length
      return n
    }
    const rest = count(chair(0))
    for (const tilt of TILTS)
      expect(Math.abs(count(chair(tilt)) - rest)).toBeLessThan(rest * 0.05)
  })

  it('passes through many poses in one rock', () => {
    const poses = new Set(
      Array.from({ length: 14 }, (_, i) =>
        hashBuffer(
          crop(
            composeScene(
              input('study', 'rocker', { lampLevel: 0, pet: null }),
              1400 + i * 100
            ),
            ROOM_THUMB_VIEWS.study
          )
        )
      )
    )
    expect(poses.size).toBeGreaterThanOrEqual(8)
  })
})
