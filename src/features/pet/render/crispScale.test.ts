import { describe, expect, it } from 'vitest'
import { crispScale, pixelsIn } from '@/features/pet/render/crispScale'

describe('pixelsIn', () => {
  const laidOut = (pixels: number, scale: number, ratio: number) =>
    Math.round(pixels * scale * ratio) / ratio

  it('keeps every pixel of a box sized to whole pixels, at any density', () => {
    for (const ratio of [2, 2.625, 3]) {
      const scale = crispScale(2.4, 1, ratio)
      for (const pixels of [1, 9, 10, 12, 17, 21, 120])
        expect(pixelsIn(laidOut(pixels, scale, ratio), scale)).toBe(pixels)
    }
  })

  it('drops a part pixel', () => {
    expect(pixelsIn(23, 7 / 3)).toBe(9)
    expect(pixelsIn(44, 7 / 3)).toBe(18)
  })
})
