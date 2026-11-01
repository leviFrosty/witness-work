import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-navigation/native', () => ({}))

import { followShownInTab } from '@/hooks/useShownInTab'

function app() {
  const s = { sheet: false, tab: 0, pushed: false }
  const listeners = new Set<() => void>()
  const navigator = (
    type: string,
    keys: () => string[],
    index: () => number,
    parent?: object
  ) => ({
    getState: () => ({
      type,
      index: index(),
      routes: keys().map((key) => ({ key })),
    }),
    getParent: () => parent,
  })
  const root = navigator(
    'stack',
    () => (s.sheet ? ['tabs', 'sheet'] : ['tabs']),
    () => (s.sheet ? 1 : 0)
  )
  const tabs = navigator(
    'tab',
    () => ['home', 'schedule'],
    () => s.tab,
    root
  )
  const dashboard = {
    ...navigator(
      'stack',
      () => (s.pushed ? ['dashboard', 'details'] : ['dashboard']),
      () => (s.pushed ? 1 : 0),
      tabs
    ),
    isFocused: () => !s.sheet && s.tab === 0 && !s.pushed,
    addListener: (_: string, listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const change = (patch: Partial<typeof s>) => {
    Object.assign(s, patch)
    listeners.forEach((listener) => listener())
  }
  return { dashboard, change, listeners }
}

describe('followShownInTab', () => {
  it('shows while its tab is selected and nothing is pushed over it', () => {
    const { dashboard, change } = app()
    const seen: boolean[] = []
    followShownInTab(dashboard as never, 'dashboard', (shown) =>
      seen.push(shown)
    )
    change({ tab: 1 })
    change({ tab: 0 })
    change({ pushed: true })
    change({ pushed: false })
    expect(seen).toEqual([true, false, true, false, true])
  })

  it('still shows under a sheet over the tabs', () => {
    const { dashboard, change } = app()
    const seen: boolean[] = []
    followShownInTab(dashboard as never, 'dashboard', (shown) =>
      seen.push(shown)
    )
    change({ sheet: true })
    change({ sheet: false })
    expect(seen).toEqual([true, true, true])
  })

  it('stays hidden until it has been focused once', () => {
    const { dashboard, change } = app()
    change({ tab: 1 })
    const seen: boolean[] = []
    followShownInTab(dashboard as never, 'dashboard', (shown) =>
      seen.push(shown)
    )
    change({ tab: 0 })
    expect(seen).toEqual([false, true])
  })

  it('stops listening', () => {
    const { dashboard, listeners } = app()
    const stop = followShownInTab(dashboard as never, 'dashboard', () => {})
    expect(listeners.size).toBeGreaterThan(0)
    stop?.()
    expect(listeners.size).toBe(0)
  })

  it('does nothing outside a tab navigator', () => {
    const screen = {
      getState: () => ({ type: 'stack', index: 0, routes: [{ key: 'a' }] }),
      getParent: () => undefined,
      isFocused: () => true,
      addListener: vi.fn(),
    }
    expect(followShownInTab(screen as never, 'a', () => {})).toBeNull()
    expect(screen.addListener).not.toHaveBeenCalled()
  })
})
