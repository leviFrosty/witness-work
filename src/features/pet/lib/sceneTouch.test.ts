import { describe, expect, it } from 'vitest'
import type { Viewport } from '@/lib/pixelArt'
import {
  inBox,
  PET_RUB_PAD,
  PET_TAP_PAD,
  sceneTapTarget,
  startsOnPet,
} from '@/features/pet/lib/sceneTouch'

const VIEW: Viewport = [22, 8, 146, 90]
const SCALE = 2
const PET: Viewport = [55, 54, 26, 30]
const GIFT: Viewport = [93, 79, 16, 14]

const at = (sx: number, sy: number) => ({
  x: (sx - VIEW[0]) * SCALE,
  y: (sy - VIEW[1]) * SCALE,
})

const target = (sx: number, sy: number, giftBox: Viewport | null = null) =>
  sceneTapTarget({
    ...at(sx, sy),
    scale: SCALE,
    viewport: VIEW,
    petBox: PET,
    giftBox,
  })

describe('scene taps', () => {
  it('pats only on the pet, padded a little for a fingertip', () => {
    expect(target(68, 70)).toBe('pet')
    expect(target(55 - PET_TAP_PAD, 70)).toBe('pet')
    expect(target(55 - PET_TAP_PAD - 1, 70)).toBe('room')
    expect(target(68, 54 - PET_TAP_PAD - 1)).toBe('room')

    expect(target(30, 20)).toBe('room')
    expect(target(150, 70)).toBe('room')
  })

  it('takes the gift before the pet, only while there is one', () => {
    expect(target(100, 85, GIFT)).toBe('gift')
    expect(target(100, 85)).toBe('room')
  })

  it('treats the inset around the picture as the room', () => {
    const base = { scale: SCALE, viewport: VIEW, petBox: PET, giftBox: null }
    expect(sceneTapTarget({ ...base, x: -4, y: 40 })).toBe('room')
    expect(sceneTapTarget({ ...base, x: 40, y: 90 * SCALE + 2 })).toBe('room')

    expect(sceneTapTarget({ ...base, petBox: null, ...at(68, 70) })).toBe(
      'room'
    )
    expect(sceneTapTarget({ ...base, scale: 0, x: 10, y: 10 })).toBe('room')
  })

  it('rubs only a drag that starts on (or right beside) the pet', () => {
    const base = { scale: SCALE, viewport: VIEW, petBox: PET }
    expect(startsOnPet({ ...base, ...at(68, 70) })).toBe(true)
    expect(startsOnPet({ ...base, ...at(55 - PET_RUB_PAD, 70) })).toBe(true)
    expect(startsOnPet({ ...base, ...at(30, 20) })).toBe(false)
    expect(startsOnPet({ ...base, petBox: null, ...at(68, 70) })).toBe(false)
  })

  it('checks boxes with their far edges outside', () => {
    expect(inBox(10, 10, [10, 10, 5, 5])).toBe(true)
    expect(inBox(15, 10, [10, 10, 5, 5])).toBe(false)
    expect(inBox(15, 10, [10, 10, 5, 5], 1)).toBe(true)
  })
})
