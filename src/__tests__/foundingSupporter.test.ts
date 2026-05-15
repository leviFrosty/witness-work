import { describe, it, expect } from 'vitest'
import { isFoundingSupporter } from '@/features/supporter/lib/foundingSupporter'

describe('isFoundingSupporter', () => {
  it('returns false when the user is not a Supporter and has no flag', () => {
    expect(
      isFoundingSupporter({
        isSupporter: false,
        seenFoundingSupporterReveal: false,
      })
    ).toBe(false)
  })

  it('returns false for a current Supporter who has not seen the Founding reveal', () => {
    expect(
      isFoundingSupporter({
        isSupporter: true,
        seenFoundingSupporterReveal: false,
      })
    ).toBe(false)
  })

  it('returns true for a current Supporter who has dismissed the Founding reveal', () => {
    expect(
      isFoundingSupporter({
        isSupporter: true,
        seenFoundingSupporterReveal: true,
      })
    ).toBe(true)
  })

  // A previously-Founding user whose subscription has lapsed loses the visual
  // recognition along with every other Supporter UI. The sticky flag stays set
  // so the badge returns automatically on re-subscription — see the ADR.
  it('returns false for a lapsed Founding Supporter (flag set but not currently a Supporter)', () => {
    expect(
      isFoundingSupporter({
        isSupporter: false,
        seenFoundingSupporterReveal: true,
      })
    ).toBe(false)
  })
})
