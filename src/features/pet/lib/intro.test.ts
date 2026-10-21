import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM } from '@/types/pet'
import {
  fullyUnlockedRoom,
  INTRO_HAT,
  introStreakCopy,
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

  it('explains the streak the way the User grows it', () => {
    expect(introStreakCopy('streak', 'plans')).toBe('plans')
    expect(introStreakCopy('streak', 'months')).toBe('months')
    expect(introStreakCopy('months', 'plans')).toBe('noStreak')
    expect(introStreakCopy('months', 'months')).toBe('noStreak')
  })
})
