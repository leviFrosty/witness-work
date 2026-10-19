import { describe, expect, it } from 'vitest'

import { createBuffer, pixelAt } from './buffer'
import { fillEllipse, fillRect } from './draw'
import { createLru } from './lru'
import { createRng, hashString, seedFrom } from './rng'
import { stamp, stampPixels, stampWidth } from './stamp'

describe('stamps', () => {
  it('maps characters to colours, dots stay transparent, clip applies', () => {
    const buf = createBuffer(6, 6)
    stamp(buf, ['.r.', 'rgr'], 1, 1, { r: 0xff0000, g: 0x00ff00 })
    expect(pixelAt(buf, 1, 1)).toBeNull()
    expect(pixelAt(buf, 2, 1)).toBe(0xff0000)
    expect(pixelAt(buf, 2, 2)).toBe(0x00ff00)
    stamp(buf, ['b'], 4, 4, { b: 0x0000ff }, () => false)
    expect(pixelAt(buf, 4, 4)).toBeNull()
    expect(stampPixels(['x.x'], 0, 0, { x: 1 })).toEqual([
      [0, 0, 1],
      [2, 0, 1],
    ])
    expect(stampWidth(['ab', 'abcd'])).toBe(4)
  })
})

describe('draw', () => {
  it('fills half-open rects and pixel-centre ellipses', () => {
    const buf = createBuffer(10, 10)
    fillRect(buf, 1, 1, 3, 2, 0xffffff)
    expect(pixelAt(buf, 2, 1)).toBe(0xffffff)
    expect(pixelAt(buf, 3, 1)).toBeNull()
    fillEllipse(buf, 6, 6, 2, 2, 0xff0000, true)
    expect(pixelAt(buf, 6, 5)).toBe(0xff0000)
    expect(pixelAt(buf, 6, 7)).toBeNull()
  })
})

describe('rng', () => {
  it('repeats per seed', () => {
    const a = createRng(7)
    const b = createRng(7)
    const seq = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(seq)
    for (const v of seq) expect(v).toBeGreaterThanOrEqual(0)
    expect(seedFrom(0)).toBe(1)
    expect(hashString('pet')).toBe(hashString('pet'))
    expect(hashString('pet')).not.toBe(hashString('pets'))
  })

  it('normalizes zero, negative and non-finite seeds', () => {
    const take = (seed: number) => {
      const r = createRng(seed)
      return [r(), r(), r()]
    }
    for (const seed of [0, -0, 2147483647, Number.NaN, Infinity]) {
      expect(take(seed)).toEqual(take(1))
    }
    expect(take(-7)).toEqual(take(7))
    expect(take(7.9)).toEqual(take(7))
    for (const seed of [0, -1, -123456789, 2147483647 * 3, Number.NaN]) {
      const values = take(seed)
      for (const v of values) {
        expect(v).toBeGreaterThan(0)
        expect(v).toBeLessThan(1)
      }
      expect(new Set(values).size).toBe(3)
    }
    expect(seedFrom(-5)).toBe(5)
    expect(seedFrom(Number.NaN)).toBe(1)
  })
})

describe('lru', () => {
  it('evicts the least recently used entry', () => {
    const cache = createLru<number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a')
    cache.set('c', 3)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(1)
    expect(cache.getOrCreate('d', () => 4)).toBe(4)
    expect(cache.size).toBe(2)
  })
})
