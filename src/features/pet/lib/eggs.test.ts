import { describe, expect, it } from 'vitest'
import {
  createPatCounter,
  shouldShowParadise,
  shouldShowRainbow,
  shouldShowStar,
  visitorForToday,
} from '@/features/pet/lib/eggs'

const live = (time: 'dawn' | 'day' | 'dusk' | 'night') => ({
  time,
  liveTime: true,
})
const fixed = (time: 'dawn' | 'day' | 'dusk' | 'night') => ({
  time,
  liveTime: false,
})

describe('hidden moments', () => {
  it('shows paradise in about 1 in 20 live daytime visits only', () => {
    expect(shouldShowParadise(() => 0.049, live('day'))).toBe(true)
    expect(shouldShowParadise(() => 0.05, live('day'))).toBe(false)
    expect(shouldShowParadise(() => 0, fixed('day'))).toBe(false)
    expect(shouldShowParadise(() => 0, live('night'))).toBe(false)
  })

  it('shows a shooting star in about 1 in 15 live night visits only', () => {
    expect(shouldShowStar(() => 0.066, live('night'))).toBe(true)
    expect(shouldShowStar(() => 0.067, live('night'))).toBe(false)
    expect(shouldShowStar(() => 0, fixed('night'))).toBe(false)
    expect(shouldShowStar(() => 0, live('dusk'))).toBe(false)
  })

  it('shows the rainbow on its day, not at night', () => {
    expect(shouldShowRainbow({ rainbowToday: true }, { time: 'dusk' })).toBe(
      true
    )
    expect(shouldShowRainbow({ rainbowToday: true }, { time: 'night' })).toBe(
      false
    )
    expect(shouldShowRainbow({ rainbowToday: false }, { time: 'day' })).toBe(
      false
    )
    expect(shouldShowRainbow(null, { time: 'day' })).toBe(false)
  })

  it('does a trick on the 15th pat within 5 seconds', () => {
    const counter = createPatCounter()
    for (let i = 0; i < 14; i++) expect(counter.pat(i * 300)).toBe(false)
    expect(counter.pat(14 * 300)).toBe(true)
    // Counting starts over after a trick.
    expect(counter.pat(14 * 300 + 10)).toBe(false)
  })

  it('needs the pats close together', () => {
    const counter = createPatCounter()
    // 15 pats over 7 s: never 15 inside any 5 s.
    for (let i = 0; i < 15; i++) expect(counter.pat(i * 500)).toBe(false)
    counter.reset()
    for (let i = 0; i < 14; i++) counter.pat(i)
    counter.reset()
    expect(counter.pat(20)).toBe(false)
  })

  describe('visitorForToday', () => {
    const today = '2026-10-18'
    const noonUtc = (key: string) => new Date(`${key}T12:00:00.000Z`)
    const anna = {
      inboxId: 'anna',
      pet: { species: 'cat' as const, coat: 'grey' },
    }
    const ben = {
      inboxId: 'ben',
      pet: { species: 'lamb' as const, coat: 'default' },
    }

    it("picks a buddy with a pet from today's earliest Plan", () => {
      expect(
        visitorForToday({
          todayKey: today,
          buddiesWithPets: [anna, ben],
          dayPlans: [
            {
              date: noonUtc(today),
              startTimeInMinutes: 900,
              buddies: ['anna'],
            },
            {
              date: noonUtc(today),
              startTimeInMinutes: 540,
              buddies: ['cara', 'ben'],
            },
          ],
        })
      ).toBe(ben)
    })

    it('counts the buddy whose invitation the User answered', () => {
      expect(
        visitorForToday({
          todayKey: today,
          buddiesWithPets: [anna],
          dayPlans: [
            {
              date: noonUtc(today),
              buddyShare: { from: 'anna', shareId: 's' },
            },
          ],
        })
      ).toBe(anna)
    })

    it('ignores other days and buddies without a pet', () => {
      expect(
        visitorForToday({
          todayKey: today,
          buddiesWithPets: [anna],
          dayPlans: [
            { date: noonUtc('2026-10-17'), buddies: ['anna'] },
            { date: noonUtc(today), buddies: ['cara'] },
          ],
        })
      ).toBeNull()
      expect(
        visitorForToday({ todayKey: today, buddiesWithPets: [], dayPlans: [] })
      ).toBeNull()
    })
  })
})
