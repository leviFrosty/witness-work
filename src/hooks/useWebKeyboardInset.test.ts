import { describe, expect, it } from 'vitest'
import { keyboardOverlap } from '@/hooks/useWebKeyboardInset.web'

describe('keyboardOverlap', () => {
  it('is zero without a keyboard', () => {
    expect(keyboardOverlap(800, { height: 800, offsetTop: 0, scale: 1 })).toBe(
      0
    )
  })

  it('is the height the keyboard covers', () => {
    expect(keyboardOverlap(800, { height: 460, offsetTop: 0, scale: 1 })).toBe(
      340
    )
  })

  it('accounts for the browser scrolling the page up', () => {
    expect(
      keyboardOverlap(800, { height: 460, offsetTop: 120, scale: 1 })
    ).toBe(220)
  })

  it('ignores a pinch zoom', () => {
    expect(keyboardOverlap(800, { height: 400, offsetTop: 0, scale: 2 })).toBe(
      0
    )
  })
})
