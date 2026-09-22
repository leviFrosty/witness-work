import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reset: vi.fn(),
  enabled: true,
  hydrated: true,
  changed: () => {},
  finishHydration: () => {},
}))

vi.mock('@/lib/analytics', () => ({ analytics: { reset: mocks.reset } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => ({ analyticsEnabled: mocks.enabled }),
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
  mocks.reset.mockReset()
  mocks.enabled = true
  mocks.hydrated = true
})

it('revokes consent and resets synchronously, including rapid off/on changes', async () => {
  await import('./analyticsConsent')
  const { analyticsEventsAllowed } = await import('./analyticsPolicy')
  mocks.reset.mockImplementation(() =>
    expect(analyticsEventsAllowed()).toBe(false)
  )
  mocks.enabled = false
  mocks.changed()
  expect(mocks.reset).toHaveBeenCalledOnce()
  mocks.enabled = true
  mocks.changed()
  expect(analyticsEventsAllowed()).toBe(true)
  expect(mocks.reset).toHaveBeenCalledOnce()
})

it('waits for hydration and does not reset identity for an unchanged disabled preference', async () => {
  mocks.hydrated = false
  await import('./analyticsConsent')
  const { analyticsEventsAllowed } = await import('./analyticsPolicy')
  expect(analyticsEventsAllowed()).toBe(false)
  mocks.enabled = false
  mocks.changed()
  mocks.hydrated = true
  mocks.finishHydration()
  expect(analyticsEventsAllowed()).toBe(false)
  expect(mocks.reset).not.toHaveBeenCalled()
})
