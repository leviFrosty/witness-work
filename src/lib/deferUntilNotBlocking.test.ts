import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const app = vi.hoisted(() => ({
  currentState: 'active',
  handlers: new Set<() => void>(),
}))
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return app.currentState
    },
    addEventListener: (_event: string, listener: () => void) => {
      app.handlers.add(listener)
      return { remove: () => app.handlers.delete(listener) }
    },
  },
}))
import {
  beginStartupWork,
  deferUntilNotBlocking,
} from '@/lib/deferUntilNotBlocking'

beforeEach(() => {
  vi.useFakeTimers()
  app.currentState = 'active'
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) =>
    setTimeout(callback, 16)
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.stubGlobal('requestIdleCallback', (callback: () => void) =>
    setTimeout(callback, 1)
  )
  vi.stubGlobal('cancelIdleCallback', clearTimeout)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('deferUntilNotBlocking', () => {
  it('waits for every startup task, two frames, and idle before running once', async () => {
    const finishRevenueCat = beginStartupWork()
    const finishNotes = beginStartupWork()
    const task = vi.fn()
    deferUntilNotBlocking(task)
    await vi.advanceTimersByTimeAsync(2000)
    finishRevenueCat()
    await vi.advanceTimersByTimeAsync(2000)
    expect(task).not.toHaveBeenCalled()
    finishNotes()
    await vi.advanceTimersByTimeAsync(1032)
    expect(task).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(task).toHaveBeenCalledTimes(1)
    finishNotes()
    await vi.advanceTimersByTimeAsync(40_000)
    expect(task).toHaveBeenCalledTimes(1)
    expect(app.handlers.size).toBe(0)
  })
  it('rechecks blockers registered between render and the idle callback', async () => {
    const task = vi.fn()
    deferUntilNotBlocking(task)
    await vi.advanceTimersByTimeAsync(1020)
    const finish = beginStartupWork()
    await vi.advanceTimersByTimeAsync(100)
    expect(task).not.toHaveBeenCalled()
    finish()
    await vi.advanceTimersByTimeAsync(1033)
    expect(task).toHaveBeenCalledTimes(1)
  })
  it('waits for foreground and can be cancelled before any work starts', async () => {
    app.currentState = 'background'
    const task = vi.fn()
    const controller = new AbortController()
    deferUntilNotBlocking(task, { signal: controller.signal })
    await vi.advanceTimersByTimeAsync(2000)
    app.currentState = 'active'
    app.handlers.forEach((handler) => handler())
    controller.abort()
    await vi.advanceTimersByTimeAsync(40_000)
    expect(task).not.toHaveBeenCalled()
    expect(app.handlers.size).toBe(0)
  })
  it('skips a hung startup instead of forcing optional work', async () => {
    const finish = beginStartupWork()
    const task = vi.fn()
    deferUntilNotBlocking(task)
    await vi.advanceTimersByTimeAsync(30_000)
    finish()
    await vi.advanceTimersByTimeAsync(2000)
    expect(task).not.toHaveBeenCalled()
    expect(app.handlers.size).toBe(0)
  })
})
