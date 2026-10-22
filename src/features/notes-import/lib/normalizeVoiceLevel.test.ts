import { describe, expect, it } from 'vitest'
import {
  initialVoiceLevelRange,
  normalizeVoiceLevel,
  type VoiceLevelRange,
} from '@/features/notes-import/lib/normalizeVoiceLevel'

// Native levels map -50...0 dB onto 0...1; samples arrive every ~80 ms.
const ROOM = 0.1 // ~-45 dB
const QUIET_SPEECH = 0.3 // ~-35 dB
const COUGH = 0.95

const feed = (range: VoiceLevelRange, levels: number[]) => {
  let current = range
  const loudness: number[] = []
  for (const level of levels) {
    const { loudness: value, ...next } = normalizeVoiceLevel(current, level)
    current = next
    loudness.push(value)
  }
  return { range: current, loudness }
}

const repeat = (level: number, count: number) =>
  Array.from({ length: count }, () => level)

describe('normalizeVoiceLevel', () => {
  it('keeps room tone as dots', () => {
    const { loudness } = feed(initialVoiceLevelRange(), repeat(ROOM, 100))
    expect(Math.max(...loudness)).toBe(0)
  })

  it('ignores the reset level before the first reading', () => {
    const { loudness } = feed(initialVoiceLevelRange(), [
      0,
      0,
      ...repeat(ROOM, 20),
    ])
    expect(Math.max(...loudness)).toBe(0)
  })

  it('draws quiet speech as clear bars', () => {
    const { range } = feed(initialVoiceLevelRange(), repeat(ROOM, 20))
    const { loudness } = feed(range, repeat(QUIET_SPEECH, 5))
    expect(Math.min(...loudness)).toBeGreaterThan(0.6)
  })

  it('recovers quiet speech a few seconds after a cough', () => {
    const { range } = feed(initialVoiceLevelRange(), [
      ...repeat(ROOM, 20),
      COUGH,
      COUGH,
      ...repeat(ROOM, 40), // ~3 s
    ])
    const { loudness } = feed(range, repeat(QUIET_SPEECH, 3))
    expect(loudness[0]).toBeGreaterThan(0.5)
  })

  it('keeps a loud sound taller than quiet speech around it', () => {
    const { range } = feed(initialVoiceLevelRange(), repeat(ROOM, 20))
    const { loudness } = feed(range, [QUIET_SPEECH, COUGH, QUIET_SPEECH])
    expect(loudness[1]).toBe(1)
    expect(loudness[2]).toBeLessThan(loudness[1])
  })
})
