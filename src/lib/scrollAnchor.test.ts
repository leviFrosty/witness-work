import { describe, expect, it } from 'vitest'
import { readingAnchor } from '@/lib/scrollAnchor'

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
})

describe('readingAnchor', () => {
  it('takes the anchor across the line', () => {
    expect(
      readingAnchor(
        [
          { id: 'a', rect: rect(0, 0, 300, 100) },
          { id: 'b', rect: rect(0, 120, 300, 100) },
        ],
        150,
        false
      )
    ).toEqual({ id: 'b', into: 30 })
  })

  it('takes a row over the card around it', () => {
    expect(
      readingAnchor(
        [
          { id: 'card', rect: rect(0, 0, 300, 1000) },
          { id: 'row', rect: rect(10, 140, 280, 40) },
        ],
        150,
        false
      )
    ).toEqual({ id: 'row', into: 10 })
  })

  it('takes the nearest row when the line falls between rows', () => {
    expect(
      readingAnchor(
        [
          { id: 'card', rect: rect(0, 0, 300, 1000) },
          { id: 'above', rect: rect(10, 100, 280, 40) },
          { id: 'below', rect: rect(10, 152, 280, 40) },
        ],
        148,
        false
      )
    ).toEqual({ id: 'below', into: -4 })
  })

  it('keeps the card when no row is near the line', () => {
    expect(
      readingAnchor(
        [
          { id: 'card', rect: rect(0, 0, 300, 1000) },
          { id: 'row', rect: rect(10, 600, 280, 40) },
        ],
        150,
        false
      )
    ).toEqual({ id: 'card', into: 150 })
  })

  it('takes the column read first when two sit side by side', () => {
    const columns = [
      { id: 'right', rect: rect(400, 0, 300, 300) },
      { id: 'left', rect: rect(0, 50, 300, 300) },
    ]
    expect(readingAnchor(columns, 150, false)?.id).toBe('left')
    expect(readingAnchor(columns, 150, true)?.id).toBe('right')
  })

  it('takes the next anchor below when none crosses the line', () => {
    expect(
      readingAnchor(
        [
          { id: 'a', rect: rect(0, 0, 300, 100) },
          { id: 'b', rect: rect(0, 200, 300, 100) },
        ],
        150,
        false
      )
    ).toEqual({ id: 'b', into: -50 })
  })

  it('ignores anchors not laid out', () => {
    expect(readingAnchor([{ id: 'a', rect: null }], 150, false)).toBeNull()
  })
})
