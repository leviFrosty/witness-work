import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ useWindowDimensions: () => ({}) }))

import { breaksAWord } from '@/hooks/useUnbrokenWords'

const lines = (...texts: string[]) => texts.map((text) => ({ text }))

describe('breaksAWord', () => {
  it('accepts lines that wrap between words', () => {
    expect(breaksAWord('Scribe AI', lines('Scribe ', 'AI'))).toBe(false)
    expect(breaksAWord('Scribe AI', lines('Scribe', 'AI'))).toBe(false)
    expect(
      breaksAWord('Use your microphone', lines('Use your ', 'microphone'))
    ).toBe(false)
  })

  it('catches a word split across lines', () => {
    expect(breaksAWord('Scribe AI', lines('Scrib', 'e AI'))).toBe(true)
    expect(
      breaksAWord('Use your microphone', lines('Use your ', 'micropho', 'ne'))
    ).toBe(true)
  })

  it('leaves one line alone', () => {
    expect(breaksAWord('Scribe AI', lines('Scribe AI'))).toBe(false)
  })

  it('leaves scripts that break between characters alone', () => {
    expect(breaksAWord('使用麦克风', lines('使用麦', '克风'))).toBe(false)
    expect(breaksAWord('マイクを使う', lines('マイク', 'を使う'))).toBe(false)
  })
})
