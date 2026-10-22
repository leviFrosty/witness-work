import { describe, expect, it } from 'vitest'
import { isOnScreen } from '@/lib/onScreen'

const WINDOW = { width: 390, height: 844 }

describe('isOnScreen', () => {
  it('is on screen while any part shows', () => {
    expect(isOnScreen({ x: 15, y: 300, width: 360, height: 220 }, WINDOW)).toBe(
      true
    )
    expect(
      isOnScreen({ x: 15, y: -219, width: 360, height: 220 }, WINDOW)
    ).toBe(true)
    expect(isOnScreen({ x: 15, y: 843, width: 360, height: 220 }, WINDOW)).toBe(
      true
    )
  })

  it('is off screen once scrolled fully out', () => {
    expect(
      isOnScreen({ x: 15, y: -220, width: 360, height: 220 }, WINDOW)
    ).toBe(false)
    expect(isOnScreen({ x: 15, y: 844, width: 360, height: 220 }, WINDOW)).toBe(
      false
    )
    expect(
      isOnScreen({ x: 400, y: 100, width: 360, height: 220 }, WINDOW)
    ).toBe(false)
  })

  it('counts a view without a size yet as on screen', () => {
    expect(isOnScreen({ x: 0, y: 0, width: 0, height: 0 }, WINDOW)).toBe(true)
  })
})
