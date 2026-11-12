import { describe, expect, it } from 'vitest'
import {
  aroundPoint,
  fitScale,
  isStartView,
  keepInRoom,
  nextQuarterTurn,
  normalizeAngle,
  START_VIEW,
  turnedBounds,
} from '@/features/territories/lib/cardPhotoTurn'

const QUARTER = Math.PI / 2

const screenOf = (
  view: { x: number; y: number; scale: number; angle: number },
  point: { x: number; y: number }
) => ({
  x:
    view.x +
    view.scale *
      (point.x * Math.cos(view.angle) - point.y * Math.sin(view.angle)),
  y:
    view.y +
    view.scale *
      (point.x * Math.sin(view.angle) + point.y * Math.cos(view.angle)),
})

describe('turning the card photo with two fingers', () => {
  it('keeps the point between the fingers still while it turns and zooms', () => {
    const view = { x: 30, y: -12, scale: 1.4, angle: 0.3 }
    const focal = { x: 80, y: 40 }
    const under = {
      x:
        ((focal.x - view.x) * Math.cos(-view.angle) -
          (focal.y - view.y) * Math.sin(-view.angle)) /
        view.scale,
      y:
        ((focal.x - view.x) * Math.sin(-view.angle) +
          (focal.y - view.y) * Math.cos(-view.angle)) /
        view.scale,
    }
    const next = aroundPoint(view, focal, 1.7, 0.9)
    expect(next.scale).toBeCloseTo(1.4 * 1.7)
    expect(next.angle).toBeCloseTo(1.2)
    const stays = screenOf(next, under)
    expect(stays.x).toBeCloseTo(focal.x)
    expect(stays.y).toBeCloseTo(focal.y)
  })

  it('turns any amount, not just quarter turns', () => {
    const next = aroundPoint(START_VIEW, { x: 0, y: 0 }, 1, 0.37)
    expect(next).toEqual({ x: 0, y: 0, scale: 1, angle: 0.37 })
  })

  it('adds up small steps the same as one big step', () => {
    const focal = { x: -20, y: 55 }
    let stepped = { x: 5, y: 9, scale: 1, angle: 0 }
    for (let i = 0; i < 10; i++)
      stepped = aroundPoint(stepped, focal, 1.05, 0.1)
    const once = aroundPoint(
      { x: 5, y: 9, scale: 1, angle: 0 },
      focal,
      1.05 ** 10,
      1
    )
    expect(stepped.x).toBeCloseTo(once.x)
    expect(stepped.y).toBeCloseTo(once.y)
    expect(stepped.scale).toBeCloseTo(once.scale)
    expect(stepped.angle).toBeCloseTo(once.angle)
  })
})

describe('the Turn Photo button', () => {
  it('goes to the next quarter turn from wherever the photo is', () => {
    expect(nextQuarterTurn(0)).toBeCloseTo(QUARTER)
    expect(nextQuarterTurn(0.4)).toBeCloseTo(QUARTER)
    expect(nextQuarterTurn(QUARTER)).toBeCloseTo(Math.PI)
    expect(nextQuarterTurn(QUARTER - 0.001)).toBeCloseTo(Math.PI)
    expect(nextQuarterTurn(-0.4)).toBeCloseTo(0)
  })

  it('fills the room at a quarter turn, as the turned photo did before', () => {
    const photo = { width: 300, height: 200 }
    const room = { width: 300, height: 600 }
    expect(fitScale(photo, room, 0)).toBeCloseTo(1)
    expect(fitScale(photo, room, QUARTER)).toBeCloseTo(1.5)
    expect(turnedBounds(photo, QUARTER).width).toBeCloseTo(200)
  })
})

describe('back to the start', () => {
  it('takes the short way back to upright', () => {
    expect(normalizeAngle(2 * Math.PI + 0.2)).toBeCloseTo(0.2)
    expect(normalizeAngle(-2 * Math.PI - 0.2)).toBeCloseTo(-0.2)
    expect(normalizeAngle(3 * QUARTER)).toBeCloseTo(-QUARTER)
  })

  it('knows the starting view, turned or not', () => {
    expect(isStartView(START_VIEW)).toBe(true)
    expect(isStartView({ ...START_VIEW, angle: 2 * Math.PI })).toBe(true)
    expect(isStartView({ ...START_VIEW, angle: 0.3 })).toBe(false)
    expect(isStartView({ ...START_VIEW, scale: 2 })).toBe(false)
  })

  it('keeps a small photo inside the room and a big one over its edges', () => {
    const photo = { width: 300, height: 200 }
    const room = { width: 300, height: 600 }
    expect(keepInRoom({ ...START_VIEW, y: 900 }, photo, room).y).toBe(200)
    const big = { x: 900, y: 0, scale: 3, angle: 0 }
    expect(keepInRoom(big, photo, room).x).toBe(300)
  })
})
