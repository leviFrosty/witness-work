import { beforeEach, describe, expect, it, vi } from 'vitest'

const appState = vi.hoisted(() => ({
  currentState: 'active',
  handlers: [] as ((state: string) => void)[],
}))
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return appState.currentState
    },
    addEventListener: (_: string, handler: (state: string) => void) => {
      appState.handlers.push(handler)
      return { remove: () => {} }
    },
  },
}))

const emit = (state: string) => appState.handlers.forEach((h) => h(state))

describe('appLifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    appState.handlers = []
    appState.currentState = 'active'
  })

  it('ignores inactive blips and fires on a return from the background', async () => {
    const { addForegroundListener, addBackgroundListener } = await import(
      '@/lib/appLifecycle'
    )
    const onForeground = vi.fn()
    const onBackground = vi.fn()
    addForegroundListener(onForeground)
    addBackgroundListener(onBackground)
    emit('inactive')
    emit('active')
    expect(onForeground).not.toHaveBeenCalled()
    emit('inactive')
    emit('background')
    emit('inactive')
    emit('active')
    expect(onBackground).toHaveBeenCalledTimes(1)
    expect(onForeground).toHaveBeenCalledTimes(1)
  })

  it('fires once a background launch comes forward', async () => {
    appState.currentState = 'background'
    const { addForegroundListener } = await import('@/lib/appLifecycle')
    const listener = vi.fn()
    addForegroundListener(listener)
    emit('active')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('throttles with minIntervalMs', async () => {
    vi.useFakeTimers()
    const { addForegroundListener } = await import('@/lib/appLifecycle')
    const listener = vi.fn()
    const subscription = addForegroundListener(listener, {
      minIntervalMs: 60_000,
    })
    emit('background')
    emit('active')
    emit('background')
    emit('active')
    expect(listener).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(61_000)
    emit('background')
    emit('active')
    expect(listener).toHaveBeenCalledTimes(2)
    subscription.remove()
    emit('background')
    emit('active')
    expect(listener).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('remembers when the app last came back, from launch on', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const { lastForegroundAt } = await import('@/lib/appLifecycle')
    expect(lastForegroundAt()).toBe(1_000)
    vi.setSystemTime(5_000)
    emit('inactive')
    emit('active')
    expect(lastForegroundAt()).toBe(1_000)
    emit('background')
    emit('active')
    expect(lastForegroundAt()).toBe(5_000)
    vi.useRealTimers()
  })
})
