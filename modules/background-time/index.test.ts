import { beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  platform: 'ios',
  native: null as Record<string, unknown> | null,
}))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
}))
vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () => runtime.native,
}))

beforeEach(() => {
  vi.resetModules()
  runtime.platform = 'ios'
  runtime.native = null
})

const nativeModule = (begin = vi.fn(() => 7)) => ({
  backgroundTimeVersion: 1,
  begin,
  end: vi.fn(),
})

it('holds a background task until the work settles, then ends it', async () => {
  const native = nativeModule()
  runtime.native = native
  const { withBackgroundTime } = await import('./index')
  let release!: (value: string) => void
  const pending = withBackgroundTime(
    'AccountSession',
    () => new Promise<string>((resolve) => (release = resolve))
  )
  expect(native.begin).toHaveBeenCalledWith('AccountSession')
  expect(native.end).not.toHaveBeenCalled()
  release('done')
  await expect(pending).resolves.toBe('done')
  expect(native.end).toHaveBeenCalledWith(7)
})

it('ends the task when the work fails, and passes the failure on', async () => {
  const native = nativeModule()
  runtime.native = native
  const { withBackgroundTime } = await import('./index')
  await expect(
    withBackgroundTime('x', () => Promise.reject(new Error('offline')))
  ).rejects.toThrow('offline')
  expect(native.end).toHaveBeenCalledWith(7)
})

it('just runs the work when iOS gives no time, or the native call fails', async () => {
  const native = nativeModule(vi.fn(() => 0))
  runtime.native = native
  const { withBackgroundTime } = await import('./index')
  await expect(withBackgroundTime('x', async () => 1)).resolves.toBe(1)
  expect(native.end).not.toHaveBeenCalled()
  native.begin = vi.fn(() => {
    throw new Error('no app')
  })
  await expect(withBackgroundTime('x', async () => 2)).resolves.toBe(2)
})

it.each([
  ['android', true],
  ['ios', false],
])('just runs the work on %s without the module', async (platform, has) => {
  runtime.platform = platform
  const native = nativeModule()
  runtime.native = has ? native : null
  const { isAvailable, withBackgroundTime } = await import('./index')
  expect(isAvailable()).toBe(false)
  await expect(withBackgroundTime('x', async () => 3)).resolves.toBe(3)
  expect(native.begin).not.toHaveBeenCalled()
})
