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
  runtime.native = null
})

it.each(['ios', 'android'])('hides the app on %s', async (platform) => {
  runtime.platform = platform
  const setHidden = vi.fn()
  runtime.native = { appSwitcherPrivacyVersion: 1, setHidden }
  const { setAppSwitcherHidden } = await import('./index')
  setAppSwitcherHidden(true)
  setAppSwitcherHidden(false)
  expect(setHidden.mock.calls).toEqual([[true], [false]])
})

it('does nothing on a binary without the module', async () => {
  const { setAppSwitcherHidden } = await import('./index')
  expect(() => setAppSwitcherHidden(true)).not.toThrow()
})

it('never throws when the native call fails', async () => {
  runtime.native = {
    appSwitcherPrivacyVersion: 1,
    setHidden: vi.fn(() => Promise.reject(new Error('no window'))),
  }
  const { setAppSwitcherHidden } = await import('./index')
  expect(() => setAppSwitcherHidden(true)).not.toThrow()
  runtime.native.setHidden = vi.fn(() => {
    throw new Error('no activity')
  })
  expect(() => setAppSwitcherHidden(false)).not.toThrow()
})
