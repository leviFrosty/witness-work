import { describe, expect, it } from 'vitest'
import { fitInside } from '@/features/territories/lib/cardPhotoFit'

const phone = { width: 393, height: 640 }

describe('fitInside', () => {
  it('fills the width of a tall room with a wide photo', () => {
    expect(fitInside(phone, 3 / 2)).toEqual({ width: 393, height: 262 })
  })

  it('fills the height of a wide room with a tall photo', () => {
    expect(fitInside({ width: 600, height: 300 }, 1 / 2)).toEqual({
      width: 150,
      height: 300,
    })
  })
})
