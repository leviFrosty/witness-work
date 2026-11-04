import { beforeEach, describe, expect, it } from 'vitest'
import {
  REPLAY_SAMPLE_RATE,
  resetSessionDraw,
  sessionDraw,
  sessionSampled,
} from '@/lib/sessionReplay/replaySampling'

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial }
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value
    },
  }
}

beforeEach(resetSessionDraw)

describe('sessionSampled', () => {
  it('samples one session in ten', () => {
    expect(REPLAY_SAMPLE_RATE).toBe(0.1)
  })

  it('samples a session whose draw falls under the rate', () => {
    expect(sessionSampled(0.1, memoryStorage(), () => 0.05)).toBe(true)
  })

  it('leaves out a session whose draw is at or over the rate', () => {
    expect(sessionSampled(0.1, memoryStorage(), () => 0.1)).toBe(false)
    resetSessionDraw()
    expect(sessionSampled(0.1, memoryStorage(), () => 0.9)).toBe(false)
  })

  it('keeps a session in or out for its whole length', () => {
    const storage = memoryStorage()
    expect(sessionSampled(0.1, storage, () => 0.05)).toBe(true)
    // A reload draws nothing new: the tab's stored draw decides.
    resetSessionDraw()
    expect(sessionSampled(0.1, storage, () => 0.99)).toBe(true)

    const other = memoryStorage()
    resetSessionDraw()
    expect(sessionSampled(0.1, other, () => 0.99)).toBe(false)
    resetSessionDraw()
    expect(sessionSampled(0.1, other, () => 0.01)).toBe(false)
  })

  it('samples nothing at a rate of zero and everything at one', () => {
    expect(sessionSampled(0, memoryStorage(), () => 0)).toBe(false)
    resetSessionDraw()
    expect(sessionSampled(1, memoryStorage(), () => 0.999)).toBe(true)
  })

  it('draws once per page when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const draws = [0.04, 0.9]
    const random = () => draws.shift() ?? 0.9
    expect(sessionSampled(0.1, blocked, random)).toBe(true)
    expect(sessionSampled(0.1, blocked, random)).toBe(true)
  })

  it('ignores a stored value that is not a draw', () => {
    const storage = memoryStorage({ 'ww-replay-draw': 'oops' })
    expect(sessionDraw(storage, () => 0.5)).toBe(0.5)
    expect(storage.data['ww-replay-draw']).toBe('0.5')
  })

  it('draws about one session in ten', () => {
    let sampled = 0
    for (let i = 0; i < 2000; i++) {
      resetSessionDraw()
      if (sessionSampled(0.1, memoryStorage())) sampled++
    }
    expect(sampled).toBeGreaterThan(120)
    expect(sampled).toBeLessThan(290)
  })
})
