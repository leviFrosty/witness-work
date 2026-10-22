import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useProgressiveCount from '@/features/contacts/hooks/useProgressiveCount'

type Options = Parameters<typeof useProgressiveCount>[1]

const Probe = ({
  total,
  options,
  onRender,
}: {
  total: number
  options: Options
  onRender: (count: number) => void
}) => {
  onRender(useProgressiveCount(total, options))
  return null
}

const mount = (total: number, options: Options) => {
  const counts: number[] = []
  act(() => {
    create(
      <Probe
        total={total}
        options={options}
        onRender={(count) => counts.push(count)}
      />
    )
  })
  return counts
}

/** Runs one animation frame and the render it sets off. */
const nextFrame = () =>
  act(() => {
    vi.advanceTimersByTime(16)
  })

describe('useProgressiveCount', () => {
  // Node has no animation frames; a frame here is a 16 ms timer.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (run: () => void) =>
      setTimeout(run, 16)
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('draws the first items, then a batch a frame until all are drawn', () => {
    const counts = mount(20, { first: 8, batch: 8 })
    expect(counts.at(-1)).toBe(8)
    nextFrame()
    expect(counts.at(-1)).toBe(16)
    nextFrame()
    expect(counts.at(-1)).toBe(20)
    nextFrame()
    expect(counts.at(-1)).toBe(20)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('draws a short list at once, without waiting a frame', () => {
    const counts = mount(3, { first: 8, batch: 8 })
    expect(counts).toEqual([3])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('draws through an item that has to show at once', () => {
    const counts = mount(50, { first: 8, batch: 8, atLeast: 31 })
    expect(counts[0]).toBe(31)
    nextFrame()
    expect(counts.at(-1)).toBe(39)
  })
})
