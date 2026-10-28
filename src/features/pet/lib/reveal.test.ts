import { describe, expect, it } from 'vitest'
import {
  changedHeart,
  heartSteps,
  REVEAL_FLIGHTS,
  revealTier,
  seenPetKey,
  shownBefore,
} from '@/features/pet/lib/reveal'

const now = { coins: 62, hearts: 5 }

describe('shownBefore', () => {
  it('shows what this device last showed of the same pet', () => {
    const seen = { pet: 'p1', coins: 42, hearts: 3.5 }
    expect(shownBefore(seen, 'p1', now, false)).toEqual({
      coins: 42,
      hearts: 3.5,
    })
  })

  it('starts a pet it never showed from now, or from nothing on its first day', () => {
    const other = { pet: 'old', coins: 9, hearts: 1 }
    expect(shownBefore(other, 'p1', now, false)).toEqual(now)
    expect(shownBefore(null, 'p1', now, false)).toEqual(now)
    // Adopted today: the first coins fly in, from the hearts it starts at.
    expect(shownBefore(null, 'p1', { coins: 8, hearts: 4 }, true)).toEqual({
      coins: 0,
      hearts: 3,
    })
  })

  it('starts from now when what it showed predates coins', () => {
    const old = { pet: 'p1', thread: 42, coin: 3, hearts: 3.5 }
    expect(
      shownBefore(
        old as unknown as typeof now & { pet: string },
        'p1',
        now,
        false
      )
    ).toEqual(now)
  })

  it('names a pet by its seed, else its adoption day', () => {
    expect(seenPetKey({ seed: 'abc', adoptedOn: '2026-10-01' })).toBe('abc')
    expect(seenPetKey({ adoptedOn: '2026-10-01' })).toBe('2026-10-01')
  })
})

describe('revealTier', () => {
  it('makes more of a show the bigger the gain', () => {
    // A day out, and a planned one kept.
    expect(revealTier(1)).toBe('small')
    expect(revealTier(2)).toBe('small')
    // A few days', or a shared month's.
    expect(revealTier(3)).toBe('medium')
    expect(revealTier(8)).toBe('medium')
    // A streak milestone's.
    expect(revealTier(10)).toBe('big')
    expect(revealTier(-12)).toBe('loss')
    expect(REVEAL_FLIGHTS).toEqual({ small: 1, medium: 3, big: 5, loss: 0 })
  })
})

describe('heartSteps', () => {
  it('steps half a heart at a time, either way', () => {
    expect(heartSteps(3.5, 5)).toEqual([4, 4.5, 5])
    expect(heartSteps(5, 4)).toEqual([4.5, 4])
    expect(heartSteps(4, 4)).toEqual([])
  })

  it('names the heart each step changed', () => {
    // Filling the 4th heart's second half, then the 5th heart.
    expect(changedHeart(3.5, 4)).toBe(3)
    expect(changedHeart(4, 4.5)).toBe(4)
    // Fading the 5th heart.
    expect(changedHeart(5, 4.5)).toBe(4)
    expect(changedHeart(0.5, 0)).toBe(0)
  })
})
