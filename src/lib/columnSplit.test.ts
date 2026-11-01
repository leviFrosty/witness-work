import { describe, expect, it } from 'vitest'
import { splitInReadingOrder } from '@/lib/columnSplit'

describe('splitInReadingOrder', () => {
  it('leaves one section in one column', () => {
    expect(splitInReadingOrder([100])).toBe(1)
    expect(splitInReadingOrder([])).toBe(0)
  })

  it('breaks where the columns come out closest in height', () => {
    expect(splitInReadingOrder([300, 100, 100, 100])).toBe(1)

    expect(splitInReadingOrder([100, 100, 100, 300])).toBe(3)
  })

  it('counts the gap between sections', () => {
    expect(splitInReadingOrder([100, 100, 200], 20)).toBe(2)
  })

  it('gives ties to the longer leading column', () => {
    expect(splitInReadingOrder([100, 100, 100])).toBe(2)
  })

  it('ignores empty sections and their gaps', () => {
    expect(splitInReadingOrder([200, 0, 0, 200], 20)).toBe(3)
  })

  it('counts unmeasured sections as the average', () => {
    expect(
      splitInReadingOrder([undefined, undefined, undefined, undefined])
    ).toBe(2)
    expect(splitInReadingOrder([300, undefined, 100])).toBe(1)
  })
})
