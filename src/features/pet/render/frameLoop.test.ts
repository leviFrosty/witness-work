import { describe, expect, it, vi } from 'vitest'
import { createFrameLoop } from '@/features/pet/render/frameLoop'

const harness = (busy = false, onError?: (error: unknown) => void) => {
  let t = 0
  let tick: (() => void) | null = null
  let soon: (() => void) | null = null
  const onFrame = vi.fn(() => busy)
  const loop = createFrameLoop({
    onFrame,
    onError,
    now: () => t,
    timers: {
      setInterval: (fn) => {
        tick = fn
        return 1
      },
      clearInterval: () => {
        tick = null
      },
      setTimeout: (fn) => {
        soon = fn
        return 2
      },
      clearTimeout: () => {
        soon = null
      },
    },
  })
  return {
    loop,
    onFrame,
    advance(ms: number) {
      t += ms
      tick?.()
    },
    running: () => tick !== null,
    flushSoon() {
      const fn = soon
      soon = null
      fn?.()
    },
  }
}

describe('pet frame loop', () => {
  it('runs only while active, drawing at once', () => {
    const h = harness()
    h.loop.kick()
    expect(h.onFrame).not.toHaveBeenCalled()
    h.loop.setActive(true)
    expect(h.onFrame).toHaveBeenCalledTimes(1)
    h.advance(100)
    expect(h.onFrame).toHaveBeenCalledTimes(2)
    h.loop.setActive(false)
    expect(h.running()).toBe(false)
  })

  it('stops when idle with idle stops on, and a kick restarts it', () => {
    const h = harness()
    h.loop.setActive(true)
    h.loop.setIdleStops(true)
    h.loop.kick(500)
    h.advance(400)
    expect(h.running()).toBe(true)
    h.advance(200)
    expect(h.running()).toBe(false)
    h.loop.kick(500)
    expect(h.running()).toBe(true)
  })

  it('keeps running while something animates', () => {
    const h = harness(true)
    h.loop.setActive(true)
    h.loop.setIdleStops(true)
    h.advance(10_000)
    expect(h.running()).toBe(true)
  })

  it('stops on a frame that throws, reports it once, and retries on a kick', () => {
    const onError = vi.fn()
    const h = harness(false, onError)
    h.onFrame.mockImplementationOnce(() => {
      throw new Error('bad frame')
    })
    h.loop.setActive(true)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(h.running()).toBe(false)
    h.loop.setActive(true)
    expect(h.running()).toBe(false)
    h.loop.kick()
    expect(h.running()).toBe(true)
    h.advance(100)
    expect(h.onFrame).toHaveBeenCalledTimes(3)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('rethrows without an error handler', () => {
    const h = harness()
    h.onFrame.mockImplementationOnce(() => {
      throw new Error('bad frame')
    })
    expect(() => h.loop.setActive(true)).toThrow('bad frame')
    expect(h.running()).toBe(false)
  })

  it('draws right after a kick while running, once per task', () => {
    const h = harness()
    h.loop.setActive(true)
    expect(h.onFrame).toHaveBeenCalledTimes(1)
    h.loop.kick()
    h.loop.kick()
    expect(h.onFrame).toHaveBeenCalledTimes(1)
    h.flushSoon()
    expect(h.onFrame).toHaveBeenCalledTimes(2)
    h.loop.kick()
    h.loop.setActive(false)
    h.flushSoon()
    expect(h.onFrame).toHaveBeenCalledTimes(2)
  })

  it('reports a frame that keeps failing once, until one draws again', () => {
    const onError = vi.fn()
    const h = harness(false, onError)
    h.onFrame.mockImplementation(() => {
      throw new Error('bad frame')
    })
    h.loop.setActive(true)
    h.loop.kick()
    h.loop.kick()
    expect(h.onFrame).toHaveBeenCalledTimes(3)
    expect(onError).toHaveBeenCalledTimes(1)
    h.onFrame.mockImplementation(() => false)
    h.loop.kick()
    h.onFrame.mockImplementation(() => {
      throw new Error('bad again')
    })
    h.advance(100)
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('stays stopped once disposed', () => {
    const h = harness()
    h.loop.setActive(true)
    h.loop.dispose()
    h.loop.kick()
    h.loop.setActive(true)
    expect(h.running()).toBe(false)
  })
})
