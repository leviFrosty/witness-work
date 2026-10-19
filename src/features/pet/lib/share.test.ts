import { describe, expect, it } from 'vitest'
import { pixelAt } from '@/lib/pixelArt'
import { DEMO_SIGN_DATA, VIEW_CARD, type PlayerInput } from '@/features/pet/art'
import {
  PET_SHARE_SCALE,
  petShareFileName,
  petShareImage,
} from '@/features/pet/lib/share'

const INPUT: PlayerInput = {
  room: {
    time: 'day',
    season: 'spring',
    wallColor: 'sand',
    wallPattern: 'plain',
    floor: 'wood',
    bed: 'rug',
    shelf: 'scrolls',
    lamp: 'clay',
    sign: 'month',
  },
  sign: DEMO_SIGN_DATA,
  lampLevel: 3,
  pet: { species: 'cat', coat: 'calico', mood: 'happy', seed: 7 },
}

describe('sharing the pet', () => {
  it('names the file after the pet and the day, in any script', () => {
    expect(petShareFileName('Ari', '2026-10-18')).toBe('Ari-2026-10-18.png')
    expect(petShareFileName('Golden pup', '2026-10-18')).toBe(
      'Golden-pup-2026-10-18.png'
    )
    expect(petShareFileName('Mr. Whiskers / 2', '2026-01-02')).toBe(
      'Mr-Whiskers-2-2026-01-02.png'
    )
    expect(petShareFileName('ريم', '2026-10-18')).toBe('ريم-2026-10-18.png')
    expect(petShareFileName('Zoë', '2026-10-18')).toBe('Zoë-2026-10-18.png')
    expect(petShareFileName('..//', '2026-10-18')).toBe('pet-2026-10-18.png')
  })

  it('draws the Home card’s view, 4× with square pixels', () => {
    const image = petShareImage(INPUT)
    expect(PET_SHARE_SCALE).toBe(4)
    expect(image.width).toBe(VIEW_CARD[2] * 4)
    expect(image.height).toBe(VIEW_CARD[3] * 4)
    // Every 4 × 4 block is one colour.
    for (const [x, y] of [
      [0, 0],
      [120, 200],
      [400, 300],
    ])
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++)
          expect(pixelAt(image, x + i, y + j)).toEqual(pixelAt(image, x, y))
    // A still: the same input draws the same picture.
    expect(petShareImage(INPUT).data).toEqual(image.data)
  })
})
