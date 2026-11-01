import { describe, expect, it, vi } from 'vitest'
import type { PatResult } from '@/features/pet/art'
import {
  createPetToucher,
  createRubTracker,
  RUB_STEP_PX,
  SCRUB_PAUSE_MS,
  SCRUB_TWIRL_MS,
} from '@/features/pet/lib/patTricks'

const fakePlayer = (result: PatResult = 'pat') => ({
  pat: vi.fn(() => result),
  playTrick: vi.fn(),
  playTwirl: vi.fn(),
})

const scrub = (
  toucher: ReturnType<typeof createPetToucher>,
  fromMs: number,
  toMs: number,
  everyMs = 100
) => {
  const results = []
  for (let t = fromMs; t <= toMs; t += everyMs)
    results.push(toucher.touch(t, happyDog, { rub: true }))
  return results
}

const happyDog = { species: 'dog' as const, mood: 'happy' as const }

describe('pet touches', () => {
  it('plays the trick on the 15th pat within 5 s', () => {
    const player = fakePlayer()
    const toucher = createPetToucher(player)
    const results = Array.from({ length: 15 }, (_, i) =>
      toucher.touch(i * 100, happyDog)
    )
    expect(results.slice(0, 14).every((r) => r === 'pat')).toBe(true)
    expect(results[14]).toBe('trick')
    expect(player.playTrick).toHaveBeenCalledWith('dog', 1400)
  })

  it('needs the pats close together', () => {
    const player = fakePlayer()
    const toucher = createPetToucher(player)
    for (let i = 0; i < 15; i++) toucher.touch(i * 400, happyDog)
    expect(player.playTrick).not.toHaveBeenCalled()
  })

  it('passes the rub along, and counts only taps toward the trick', () => {
    const player = fakePlayer()
    const toucher = createPetToucher(player)
    toucher.touch(0, happyDog, { rub: true })
    expect(player.pat).toHaveBeenCalledWith(0, 'happy', { rub: true })
    toucher.endRub()
    for (let i = 0; i < 20; i++) toucher.touch(i * 100, happyDog, { rub: true })
    expect(player.playTrick).not.toHaveBeenCalled()
  })

  it('twirls once a scrub has kept going long enough, once per drag', () => {
    const player = fakePlayer()
    const toucher = createPetToucher(player)
    const results = scrub(toucher, 0, SCRUB_TWIRL_MS + 500)
    expect(results.filter((r) => r === 'twirl')).toHaveLength(1)
    expect(results[SCRUB_TWIRL_MS / 100]).toBe('twirl')
    expect(player.playTwirl).toHaveBeenCalledTimes(1)
    expect(player.playTwirl).toHaveBeenCalledWith(SCRUB_TWIRL_MS)

    toucher.endRub()
    scrub(toucher, 10_000, 10_000 + SCRUB_TWIRL_MS)
    expect(player.playTwirl).toHaveBeenCalledTimes(2)
  })

  it('starts the scrub over after a pause', () => {
    const player = fakePlayer()
    const toucher = createPetToucher(player)
    scrub(toucher, 0, SCRUB_TWIRL_MS - 100)
    scrub(toucher, SCRUB_TWIRL_MS + SCRUB_PAUSE_MS, SCRUB_TWIRL_MS * 2)
    expect(player.playTwirl).not.toHaveBeenCalled()
  })

  it('asks to wake, and ignores touches mid-motion', () => {
    expect(
      createPetToucher(fakePlayer('wake')).touch(0, {
        ...happyDog,
        mood: 'nap',
      })
    ).toBe('wake')
    const busy = fakePlayer('busy')
    const toucher = createPetToucher(busy)
    for (let i = 0; i < 20; i++) expect(toucher.touch(i, happyDog)).toBe('busy')
    expect(busy.playTrick).not.toHaveBeenCalled()
  })

  it('makes one rub step per 28 px of sideways travel', () => {
    const rub = createRubTracker()
    expect(rub.move(100)).toBe(0)
    expect(rub.move(100 + RUB_STEP_PX - 1)).toBe(0)
    expect(rub.move(100 + RUB_STEP_PX)).toBe(1)

    expect(rub.move(100)).toBe(1)
    expect(rub.move(100 + RUB_STEP_PX * 3)).toBe(3)
    rub.end()
    expect(rub.move(0)).toBe(0)
  })
})
