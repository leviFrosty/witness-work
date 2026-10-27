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

it('reveals the app after an unlock on iOS binaries that can', async () => {
  const reveal = vi.fn()
  runtime.platform = 'ios'
  runtime.native = { appSwitcherPrivacyVersion: 2, setHidden: vi.fn(), reveal }
  const { revealAfterUnlock } = await import('./index')
  revealAfterUnlock()
  expect(reveal).toHaveBeenCalledTimes(1)
})

it.each([
  ['an older iOS binary', 'ios', 1],
  ['Android', 'android', 2],
])('leaves the cover alone on %s', async (_, platform, version) => {
  const reveal = vi.fn()
  runtime.platform = platform
  runtime.native = {
    appSwitcherPrivacyVersion: version,
    setHidden: vi.fn(),
    reveal,
  }
  const { revealAfterUnlock } = await import('./index')
  revealAfterUnlock()
  expect(reveal).not.toHaveBeenCalled()
})
