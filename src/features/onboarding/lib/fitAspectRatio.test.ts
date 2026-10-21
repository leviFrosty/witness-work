import { describe, expect, it } from 'vitest'
import { fitAspectRatio } from '@/features/onboarding/lib/fitAspectRatio'

describe('fitAspectRatio', () => {
  it('fills the width when the box is tall enough', () => {
    expect(fitAspectRatio({ width: 320, height: 400 }, 320 / 280)).toEqual({
      width: 320,
      height: 280,
    })
  })

  it('shrinks to the height when the box is short', () => {
    expect(fitAspectRatio({ width: 680, height: 280 }, 320 / 280)).toEqual({
      width: 320,
      height: 280,
    })
  })

  it('collapses to nothing in an empty box', () => {
    expect(fitAspectRatio({ width: 680, height: 0 }, 320 / 280)).toEqual({
      width: 0,
      height: 0,
    })
  })
})
