import { describe, expect, it } from 'vitest'
import { dialogHeight } from '@/components/ui/web/dialogHeight'

describe('dialogHeight', () => {
  it('sizes a sheet without snap points to its content', () => {
    expect(dialogHeight(undefined, 900)).toBeUndefined()
    expect(dialogHeight([], 900)).toBeUndefined()
  })

  it('follows the largest snap point', () => {
    expect(dialogHeight(['half', 'full'], 1000)).toBe(850)
    expect(dialogHeight([{ fraction: 0.7 }], 1000)).toBe(700)
    expect(dialogHeight([{ height: 600 }], 1000)).toBe(600)
  })

  it('keeps a small sheet usable and a tall one inside the window', () => {
    expect(dialogHeight(['half'], 600)).toBe(480)
    expect(dialogHeight(['full'], 600)).toBe(510)
  })
})
