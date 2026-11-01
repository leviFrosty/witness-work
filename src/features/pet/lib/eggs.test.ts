import { describe, expect, it } from 'vitest'
import {
  createPatCounter,
  shouldShowParadise,
  shouldShowRainbow,
  shouldShowStar,
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

    expect(counter.pat(14 * 300 + 10)).toBe(false)
  })

  it('needs the pats close together', () => {
    const counter = createPatCounter()

    for (let i = 0; i < 15; i++) expect(counter.pat(i * 500)).toBe(false)
    counter.reset()
    for (let i = 0; i < 14; i++) counter.pat(i)
    counter.reset()
    expect(counter.pat(20)).toBe(false)
  })
})
