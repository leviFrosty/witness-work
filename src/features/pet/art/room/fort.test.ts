import { describe, expect, it } from 'vitest'

import { cloneBuffer, readRgb, type PixelBuffer } from '@/lib/pixelArt'

import { PET_X } from '../layout'
import { composeScene } from '../scene'
import { FORT_BOX, FORT_BUNNY_HOME, FORT_LANTERN, FORT_REST } from './fort'
import {
  DEMO_SIGN_DATA,
  drawRoomBase,
  roomOpenMask,
  type ResolvedRoom,
} from './index'
import type { RoomMoment } from './live'
import { FORT_TRIP_MS, fortPose, STUDY_LIVE } from './studyLive'

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
  study: 'fort',
}

const moment = (over: Partial<RoomMoment> = {}): RoomMoment => ({
  tMs: 0,
  time: 'day',
  season: 'summer',
  wallColor: 'cream',
  lampLevel: 4,
  patMs: -Infinity,
  coinsMs: -Infinity,
  ...over,
})

const FRAME_MS = 50
const PAT = 20_000

const tripFrames = () =>
  Array.from({ length: FORT_TRIP_MS / FRAME_MS }, (_, i) =>
    fortPose(moment({ tMs: PAT + i * FRAME_MS, patMs: PAT }))
  )

const isOut = (y: number) => y > FORT_BUNNY_HOME[1] + 1

const luma = (buf: PixelBuffer, x: number, y: number): number => {
  const c = readRgb(buf, x, y)
  return 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255)
}

describe('blanket fort', () => {
  it('has the bunny reading inside when nothing moves', () => {
    expect(fortPose(moment())).toEqual({ ...FORT_REST, lit: 1 })
  })

  it('keeps the bunny at home between pats', () => {
    for (let t = 0; t < 60_000; t += 130) {
      const { bunny, door } = fortPose(moment({ tMs: t }))
      expect([bunny.x, bunny.y, bunny.hop]).toEqual([...FORT_BUNNY_HOME, 0])
      expect(door).toBe(0)
    }
  })

  it('sends the bunny out of the door on a pat, and home again', () => {
    const frames = tripFrames()
    expect(frames.some(({ bunny }) => isOut(bunny.y))).toBe(true)
    expect(frames.some(({ bunny }) => bunny.look === 'joy')).toBe(true)
    expect(
      fortPose(moment({ tMs: PAT + FORT_TRIP_MS, patMs: PAT })).bunny
    ).toEqual(FORT_REST.bunny)
  })

  it('opens the door before the bunny leaves', () => {
    for (const { bunny, door } of tripFrames())
      if (isOut(bunny.y)) expect(door).toBe(2)
  })

  it('hops in small steps, clear of the pet', () => {
    let last = FORT_REST.bunny
    for (const { bunny } of tripFrames()) {
      expect(Math.abs(bunny.x - last.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(bunny.y - last.y)).toBeLessThanOrEqual(1)
      expect(bunny.x + 8).toBeLessThan(PET_X)
      last = bunny
    }
  })

  it('has the bunny cheer at home for new coins', () => {
    const cheer = fortPose(moment({ tMs: PAT + 200, coinsMs: PAT }))
    expect(cheer.bunny.look).toBe('joy')
    expect([cheer.bunny.x, cheer.bunny.y]).toEqual([...FORT_BUNNY_HOME])
    expect(cheer.door).toBe(0)
  })

  it('glows from inside after dusk', () => {
    const [x, y] = [FORT_LANTERN[0] - 2, FORT_LANTERN[1]]
    const at = (study: ResolvedRoom['study']) =>
      luma(
        composeScene(
          {
            room: { ...ROOM, time: 'night', study },
            sign: DEMO_SIGN_DATA,
            lampLevel: 0,
            pet: null,
          },
          1000
        ),
        x,
        y
      )
    expect(at('fort')).toBeGreaterThan(3 * at('none'))
  })

  it.each(['hotspring', 'leafpile', 'cheese'] as const)(
    'stays behind a %s bed that reaches in front of it',
    (bed) => {
      const base = (room: Partial<ResolvedRoom>) =>
        drawRoomBase({ ...ROOM, ...room }, DEMO_SIGN_DATA)
      const alone = base({})
      const empty = base({ study: 'none' })
      const withBed = base({ bed })
      const bedOnly = base({ bed, study: 'none' })
      const covered: [number, number][] = []
      for (let y = FORT_BOX.y0; y <= FORT_BOX.y1; y++)
        for (let x = FORT_BOX.x0; x <= FORT_BOX.x1; x++)
          if (
            readRgb(alone, x, y) !== readRgb(empty, x, y) &&
            readRgb(withBed, x, y) === readRgb(bedOnly, x, y) &&
            readRgb(withBed, x, y) !== readRgb(alone, x, y)
          )
            covered.push([x, y])
      expect(covered.length).toBeGreaterThan(0)

      const room = { ...ROOM, bed }
      const open = roomOpenMask(room, DEMO_SIGN_DATA)
      for (const m of [
        moment({ tMs: 3000 }),
        moment({ tMs: PAT + 300, coinsMs: PAT }),
        moment({ tMs: PAT + 60, patMs: PAT }),
        moment({ tMs: PAT + FORT_TRIP_MS + 60, patMs: PAT }),
      ]) {
        const frame = cloneBuffer(withBed)
        STUDY_LIVE.fort!.back!(frame, m, open)
        for (const [x, y] of covered)
          expect(readRgb(frame, x, y)).toBe(readRgb(withBed, x, y))
      }
    }
  )
})
