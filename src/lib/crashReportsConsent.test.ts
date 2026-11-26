import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: true,
  hydrated: true,
  locked: false,
  changed: () => {},
  finishHydration: () => {},
}))

vi.mock('@/stores/mmkv', () => ({ isStorageLocked: () => mocks.locked }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => ({ crashReportsEnabled: mocks.enabled }),
    subscribe: (callback: () => void) => {
      mocks.changed = callback
    },
    persist: {
      hasHydrated: () => mocks.hydrated,
      onFinishHydration: (callback: () => void) => {
        mocks.finishHydration = callback
      },
    },
  },
}))

beforeEach(() => {
  vi.resetModules()
  mocks.enabled = true
  mocks.hydrated = true
  mocks.locked = false
})

it('follows the switch at once, both ways', async () => {
  await import('./crashReportsConsent')
  const { crashReportsAllowed } = await import('./errorTrackingPolicy')
  expect(crashReportsAllowed()).toBe(true)
  mocks.enabled = false
  mocks.changed()
  expect(crashReportsAllowed()).toBe(false)
  mocks.enabled = true
  mocks.changed()
  expect(crashReportsAllowed()).toBe(true)
})

it('keeps the launch value until the preferences load', async () => {
  mocks.hydrated = false
  mocks.enabled = false
  const policy = await import('./errorTrackingPolicy')
  policy.setCrashReportsAllowed(true)
  await import('./crashReportsConsent')
  expect(policy.crashReportsAllowed()).toBe(true)
  mocks.hydrated = true
  mocks.finishHydration()
  expect(policy.crashReportsAllowed()).toBe(false)
})

it('sends nothing on a launch that cannot read the saved choice', async () => {
  mocks.locked = true
  await import('./crashReportsConsent')
  const { crashReportsAllowed } = await import('./errorTrackingPolicy')
  expect(crashReportsAllowed()).toBe(false)
})
