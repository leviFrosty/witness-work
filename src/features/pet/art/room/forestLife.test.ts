import { describe, expect, it } from 'vitest'

import { DEMO_SIGN_DATA, type ResolvedRoom } from '..'
import { SCENE_H, SCENE_W } from '../layout'
import { FLOOR_TOP } from './floor'
import { forestVisits } from './forestLife'
import { roomOpenMask } from './index'
import type { RoomMoment } from './live'

const ROOM: ResolvedRoom = {
  time: 'day',
  season: 'summer',
  wallColor: 'cream',
  wallPattern: 'plain',
  floor: 'forest',
  bed: 'rug',
  shelf: 'scrolls',
  lamp: 'clay',
  sign: 'none',
}

const HOUR = 60 * 60 * 1000

function setup(
  time: RoomMoment['time'],
  season: RoomMoment['season'] = 'summer'
) {
  const room = { ...ROOM, time, season }
  const m: RoomMoment = {
    tMs: 0,
    time,
    season,
    wallColor: room.wallColor,
    lampLevel: 3,
    patMs: -Infinity,
    coinsMs: -Infinity,
  }
  return { m, open: roomOpenMask(room, DEMO_SIGN_DATA) }
}

describe('forest floor visitors', () => {
  it.each(['day', 'night'] as const)(
    'keeps the first moments quiet for still frames (%s)',
    (time) => {
      const { m, open } = setup(time)
      expect(forestVisits(m, open, 0, 2500)).toEqual([])
    }
  )

  it.each(['dawn', 'day', 'dusk', 'night'] as const)(
    'something comes by at least every couple of minutes (%s)',
    (time) => {
      const { m, open } = setup(time)
      const visits = forestVisits(m, open, 0, HOUR)
      let quietSince = 0
      let longest = 0
      for (const visit of visits) {
        longest = Math.max(longest, visit.startMs - quietSince)
        quietSince = Math.max(quietSince, visit.endMs)
      }
      expect(longest).toBeLessThan(2 * 60_000)
      expect(new Set(visits.map((v) => v.kind)).size).toBeGreaterThan(3)
    }
  )

  it('keeps birds and butterflies to the daytime, and butterflies out of winter', () => {
    const night = setup('night')
    const nightKinds = forestVisits(night.m, night.open, 0, HOUR).map(
      (v) => v.kind
    )
    expect(nightKinds).not.toContain('bird')
    expect(nightKinds).not.toContain('butterfly')
    const winter = setup('day', 'winter')
    expect(
      forestVisits(winter.m, winter.open, 0, HOUR).map((v) => v.kind)
    ).not.toContain('butterfly')
  })

  it.each(['day', 'night'] as const)(
    'never shows two of the same critter at once (%s)',
    (time) => {
      const { m, open } = setup(time)
      const visits = forestVisits(m, open, 0, HOUR)
      for (const a of visits)
        for (const b of visits)
          if (a !== b && a.kind === b.kind)
            expect(a.endMs <= b.startMs || b.endMs <= a.startMs).toBe(true)
    }
  )

  it.each(['day', 'night'] as const)(
    'keeps every route on the floor or just past an edge (%s)',
    (time) => {
      const { m, open } = setup(time)
      for (const visit of forestVisits(m, open, 0, HOUR)) {
        let t = 0
        for (const leg of visit.legs) {
          expect(leg.t0).toBe(t)
          t = leg.t1
          for (const [x, y] of [
            [leg.x0, leg.y0],
            [leg.x1, leg.y1],
          ]) {
            expect(x).toBeGreaterThan(-25)
            expect(x).toBeLessThan(SCENE_W + 25)
            expect(y).toBeLessThan(SCENE_H + 4)
            const flies = visit.kind === 'bird' || visit.kind === 'butterfly'
            expect(y).toBeGreaterThan(flies ? 8 : FLOOR_TOP + 4)
          }
        }
        expect(visit.startMs + t).toBeCloseTo(visit.endMs)
      }
    }
  )

  it('books the same visits for the same moment', () => {
    const { m, open } = setup('day')
    const a = forestVisits(m, open, 500_000, 700_000)
    const b = forestVisits(m, open, 500_000, 700_000)
    expect(a.map((v) => [v.kind, v.startMs])).toEqual(
      b.map((v) => [v.kind, v.startMs])
    )
  })
})
