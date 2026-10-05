import { describe, expect, it } from 'vitest'
import {
  hitTestPins,
  isPinInBounds,
  placePinLabel,
  toPinBoxes,
  type PinBox,
} from '@/features/map/lib/pinHover'

const pin = (id: string, x: number, y: number): PinBox => ({
  id,
  point: { x, y },
  // Balloon shape like MapKit's: centred on x, standing above the tip.
  box: { x: x - 15, y: y - 45, width: 30, height: 50 },
})

describe('toPinBoxes', () => {
  it('keeps only the requested contacts and their native frames', () => {
    const frame = { x: 85, y: 155, width: 30, height: 50 }
    const boxes = toPinBoxes(
      {
        a: { point: { x: 100, y: 200 }, frame },
        'new-contact-location': {
          point: { x: 10, y: 10 },
          frame: { x: 0, y: 0, width: 20, height: 20 },
        },
      },
      new Set(['a'])
    )
    expect(boxes).toEqual([{ id: 'a', point: { x: 100, y: 200 }, box: frame }])
  })

  it('falls back to a balloon above the point when the frame is unusable', () => {
    const [empty, detached] = toPinBoxes(
      {
        empty: {
          point: { x: 100, y: 200 },
          frame: { x: 0, y: 0, width: 0, height: 0 },
        },
        detached: {
          point: { x: 100, y: 200 },
          frame: { x: 500, y: 155, width: 30, height: 50 },
        },
      },
      new Set(['empty', 'detached'])
    )
    const fallback = { x: 85, y: 155, width: 30, height: 50 }
    expect(empty.box).toEqual(fallback)
    expect(detached.box).toEqual(fallback)
  })
})

describe('hitTestPins', () => {
  const pins = [pin('a', 100, 200), pin('b', 300, 200)]

  it('finds the balloon under the pointer, not just its tip', () => {
    expect(hitTestPins(pins, { x: 100, y: 170 })?.id).toBe('a')
    expect(hitTestPins(pins, { x: 290, y: 160 })?.id).toBe('b')
  })

  it('misses empty map, including just above a balloon', () => {
    expect(hitTestPins(pins, { x: 200, y: 180 })).toBeUndefined()
    expect(hitTestPins(pins, { x: 100, y: 150 })).toBeUndefined()
    expect(hitTestPins([], { x: 100, y: 180 })).toBeUndefined()
  })

  it('allows a little slop around the edges', () => {
    expect(hitTestPins(pins, { x: 83, y: 180 })?.id).toBe('a')
    expect(hitTestPins(pins, { x: 83, y: 180 }, 0)).toBeUndefined()
  })

  it('prefers the front (southernmost) pin where balloons overlap', () => {
    const overlapping = [pin('south', 100, 220), pin('north', 105, 200)]
    expect(hitTestPins(overlapping, { x: 102, y: 190 })?.id).toBe('south')
    expect(hitTestPins(overlapping.reverse(), { x: 102, y: 190 })?.id).toBe(
      'south'
    )
  })
})

describe('isPinInBounds', () => {
  const bounds = { left: 0, top: 50, right: 600, bottom: 800 }

  it('accepts pins in the visible area and rejects ones under overlays', () => {
    expect(isPinInBounds(pin('a', 300, 400), bounds)).toBe(true)
    expect(isPinInBounds(pin('a', 700, 400), bounds)).toBe(false)
    expect(isPinInBounds(pin('a', 300, 20), bounds)).toBe(false)
  })
})

describe('placePinLabel', () => {
  const bounds = { left: 0, top: 50, right: 600, bottom: 800 }
  const size = { width: 80, height: 30 }

  it('centres the label just above the balloon', () => {
    const box = pin('a', 300, 400).box
    expect(placePinLabel(box, size, bounds)).toEqual({ left: 260, top: 319 })
  })

  it('keeps the label inside the horizontal bounds', () => {
    expect(placePinLabel(pin('a', 10, 400).box, size, bounds).left).toBe(8)
    expect(placePinLabel(pin('a', 595, 400).box, size, bounds).left).toBe(512)
  })

  it('drops below the pin when there is no room above', () => {
    const box = pin('a', 300, 110).box
    expect(placePinLabel(box, size, bounds).top).toBe(121)
  })
})
