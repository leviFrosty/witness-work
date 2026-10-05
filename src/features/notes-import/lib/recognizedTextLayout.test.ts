import { describe, expect, it } from 'vitest'
import {
  layoutRecognizedPage,
  layoutRecognizedPages,
} from '@/features/notes-import/lib/recognizedTextLayout'

const line = (
  text: string,
  x: number,
  y: number,
  width = 0.3,
  height = 0.03
) => ({ text, confidence: 0.8, x, y, width, height })

describe('layoutRecognizedPage', () => {
  it('returns an empty string when nothing was recognized', () => {
    expect(layoutRecognizedPage([])).toBe('')
    expect(layoutRecognizedPage([line('   ', 0.1, 0.1)])).toBe('')
  })

  it('orders lines top to bottom regardless of input order', () => {
    expect(
      layoutRecognizedPage([
        line('Go back Thursday', 0.1, 0.14),
        line('Talked with Maria', 0.1, 0.1),
      ])
    ).toBe('Talked with Maria\nGo back Thursday')
  })

  it('keeps a record-sheet row together with column separators', () => {
    expect(
      layoutRecognizedPage([
        line('Maria Lopez', 0.4, 0.2, 0.2),
        line('12 Oak St', 0.05, 0.201, 0.2),
        line('Ps 37', 0.75, 0.199, 0.15),
        line('Tom Reed', 0.4, 0.25, 0.2),
        line('14 Oak St', 0.05, 0.25, 0.2),
      ])
    ).toBe('12 Oak St | Maria Lopez | Ps 37\n14 Oak St | Tom Reed')
  })

  it('joins pieces of one line with a space when they nearly touch', () => {
    expect(
      layoutRecognizedPage([
        line('about Psalm 37', 0.42, 0.3, 0.3),
        line('Talked with Maria', 0.1, 0.3, 0.31),
      ])
    ).toBe('Talked with Maria about Psalm 37')
  })

  it('tolerates a slightly tilted row', () => {
    expect(
      layoutRecognizedPage([
        line('12 Oak St', 0.05, 0.2, 0.2),
        line('Maria', 0.5, 0.21, 0.2),
      ])
    ).toBe('12 Oak St | Maria')
  })

  it('separates paragraphs at a large vertical gap', () => {
    expect(
      layoutRecognizedPage([
        line('Saturday', 0.1, 0.1),
        line('Maria - Ps 37', 0.1, 0.135),
        line('Sunday', 0.1, 0.3),
      ])
    ).toBe('Saturday\nMaria - Ps 37\n\nSunday')
  })
})

describe('layoutRecognizedPages', () => {
  it('joins pages with a blank line and skips empty pages', () => {
    expect(
      layoutRecognizedPages([
        { lines: [line('Page one', 0.1, 0.1)] },
        { lines: [] },
        { lines: [line('Page two', 0.1, 0.1)] },
      ])
    ).toBe('Page one\n\nPage two')
  })
})
