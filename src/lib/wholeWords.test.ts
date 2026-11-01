import { describe, expect, it } from 'vitest'
import { splitWordShare } from '@/lib/wholeWords'

describe('splitWordShare', () => {
  it('is null when every line ends between words', () => {
    expect(splitWordShare(['Morning ', 'ministry'])).toBeNull()
    expect(splitWordShare(['Two-by-', 'Two'])).toBeNull()
    expect(splitWordShare(['Conversation'])).toBeNull()
    expect(splitWordShare([])).toBeNull()
  })

  it('finds a word broken across two lines', () => {
    expect(splitWordShare(['Mornin', 'g ministr', 'y'])).toBeCloseTo(6 / 7)
    expect(splitWordShare(['Conversatio', 'n History'])).toBeCloseTo(11 / 12)
  })

  it('keeps an apostrophe inside its word', () => {
    expect(splitWordShare(["September'", 's Report'])).toBeCloseTo(10 / 11)
  })

  it('reads letters beyond Latin', () => {
    expect(splitWordShare(['Служе', 'ние'])).toBeCloseTo(5 / 8)
  })

  it('ignores scripts that break lines between any two letters', () => {
    expect(splitWordShare(['奉仕の', '予定'])).toBeNull()
    expect(splitWordShare(['봉사', '계획'])).toBeNull()
  })
})
