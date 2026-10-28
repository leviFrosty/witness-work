import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM } from '@/types/pet'
import {
  fullyUnlockedRoom,
  INTRO_HAT,
  INTRO_STEPS,
} from '@/features/pet/lib/intro'

describe('adoption intro', () => {
  it('previews the room with the last item of every part and the last hat', () => {
    expect(fullyUnlockedRoom(DEFAULT_ROOM)).toEqual({
      ...DEFAULT_ROOM,
      wallColor: 'rose',
      wallPattern: 'trellis',
      floor: 'tile',
      bed: 'cushion',
      shelf: 'fruit',
      lamp: 'stand',
      hat: 'tophat',
    })
  })

  it('tries on the first hat to open up', () => {
    expect(INTRO_HAT).toBe('bow')
  })

  it('walks through the hearts, the Shop, then decorating', () => {
    expect(INTRO_STEPS).toEqual(['hearts', 'shop', 'decorate'])
  })
})
