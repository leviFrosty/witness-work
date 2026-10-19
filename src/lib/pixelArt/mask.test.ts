import { describe, expect, it } from 'vitest'

import { createBuffer } from './buffer'
import { setPixel } from './draw'
import { createMask, maskOpaque } from './mask'

describe('pixel masks', () => {
  it('flags the opaque pixels of a placed sprite, clipped to the mask', () => {
    const sprite = createBuffer(2, 2)
    setPixel(sprite, 0, 0, 0xff0000)
    setPixel(sprite, 1, 1, 0x00ff00)
    const mask = createMask(3, 3)
    maskOpaque(mask, sprite, 2, 1)
    expect(Array.from(mask.data)).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0])
  })

  it('clears flags with on false', () => {
    const sprite = createBuffer(1, 1)
    setPixel(sprite, 0, 0, 0xffffff)
    const mask = createMask(2, 1)
    mask.data.fill(1)
    maskOpaque(mask, sprite, 1, 0, false)
    expect(Array.from(mask.data)).toEqual([1, 0])
  })
})
