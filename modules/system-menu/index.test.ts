import { beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  platform: 'ios',
  native: null as Record<string, unknown> | null,
  requireNative: vi.fn(),
}))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
}))
vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () => {
    runtime.requireNative()
    return runtime.native
  },
}))

beforeEach(() => {
  vi.resetModules()
  runtime.requireNative.mockClear()
  runtime.native = null
})

it.each(['android', 'ios'])(
  'safely loads on %s without a menu module',
  async (platform) => {
    runtime.platform = platform
    const menu = await import('./index')
    expect(menu.isAvailable).toBe(false)
    expect(await menu.configure([])).toBe(false)
    expect(menu.subscribe(vi.fn())).toBeUndefined()
    expect(menu.supportsNavigationShortcuts).toBe(false)
    expect(await menu.configureNavigationShortcuts(['1'])).toBe(false)
    expect(menu.subscribeToCommandKey(vi.fn())).toBeUndefined()
    expect(runtime.requireNative).toHaveBeenCalledTimes(
      platform === 'ios' ? 1 : 0
    )
  }
)

it('delivers a native selection and releases the subscription', async () => {
  runtime.platform = 'ios'
  const remove = vi.fn()
  const listener = vi.fn()
  runtime.native = {
    configure: async () => true,
    addListener: (_: string, receive: (event: { action: string }) => void) => {
      receive({ action: 'help_center' })
      return { remove }
    },
  }
  const menu = await import('./index')
  expect(await menu.configure([])).toBe(true)
  menu.subscribe(listener)?.remove()
  expect(listener).toHaveBeenCalledWith({ action: 'help_center' })
  expect(remove).toHaveBeenCalledOnce()
})

it('does not call keyboard APIs absent from an older native menu module', async () => {
  runtime.platform = 'ios'
  runtime.native = { configure: async () => true }
  const menu = await import('./index')
  expect(menu.isAvailable).toBe(true)
  expect(menu.supportsNavigationShortcuts).toBe(false)
  expect(await menu.configureNavigationShortcuts(['1'])).toBe(false)
  expect(menu.subscribeToCommandKey(vi.fn())).toBeUndefined()
  expect(menu.subscribeToNavigationShortcut(vi.fn())).toBeUndefined()
})
