import { afterEach, describe, expect, it, vi } from 'vitest'
import { whenIdle } from '@/lib/whenIdle'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('whenIdle', () => {
  it('waits for idle where the platform has requestIdleCallback', () => {
    const request = vi.fn((_callback: () => void, _options?: object) => 7)
    const cancel = vi.fn()
    vi.stubGlobal('requestIdleCallback', request)
    vi.stubGlobal('cancelIdleCallback', cancel)
    const work = vi.fn()
    const stop = whenIdle(work, { timeout: 500 })
    expect(request).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 500,
    })
    request.mock.calls[0][0]()
    expect(work).toHaveBeenCalledOnce()
    stop()
    expect(cancel).toHaveBeenCalledWith(7)
  })

  it('runs after the current task where it doesn’t (Safari), and can be cancelled', () => {
    vi.stubGlobal('requestIdleCallback', undefined)
    vi.useFakeTimers()
    const work = vi.fn()
    whenIdle(work)
    expect(work).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(work).toHaveBeenCalledOnce()
    const cancelled = vi.fn()
    whenIdle(cancelled)()
    vi.runAllTimers()
    expect(cancelled).not.toHaveBeenCalled()
  })
})
