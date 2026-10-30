import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
import { createGestureTracker } from '@/lib/userGesture'

const fakeTarget = () => {
  const listeners = new Map<string, () => void>()
  return {
    listeners,
    addEventListener: (type: string, listener: () => void) =>
      void listeners.set(type, listener),
    removeEventListener: (type: string) => void listeners.delete(type),
  }
}

describe('createGestureTracker', () => {
  it('is always active without a page to wait on', () => {
    expect(createGestureTracker(null)()).toBe(true)
  })

  it('waits for the first tap or key press, then stops listening', () => {
    const target = fakeTarget()
    const active = createGestureTracker(target)
    expect(active()).toBe(false)
    target.listeners.get('keydown')?.()
    expect(active()).toBe(true)
    expect(target.listeners.size).toBe(0)
  })

  it('counts a gesture the browser saw before this loaded', () => {
    const activation = { hasBeenActive: false }
    const active = createGestureTracker(fakeTarget(), activation)
    expect(active()).toBe(false)
    activation.hasBeenActive = true
    expect(active()).toBe(true)
  })
})
