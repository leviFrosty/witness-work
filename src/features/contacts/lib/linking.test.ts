import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  urlListener: undefined as undefined | ((event: { url: string }) => void),
  removed: 0,
}))

vi.mock('expo-linking', () => ({
  createURL: (path: string) => `exp://dev${path}`,
  parse: () => ({}),
  addEventListener: (_: string, listener: (event: { url: string }) => void) => {
    runtime.urlListener = listener
    return { remove: () => runtime.removed++ }
  },
}))
vi.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: () => ({}),
}))
vi.mock('@/stores/preferences', async () => {
  const { create } = await import('zustand')
  return {
    usePreferences: create(() => ({ onboardingComplete: true })),
  }
})

import { linking } from '@/features/contacts/lib/linking'
import { usePreferences } from '@/stores/preferences'
import { resetTakeovers, useTakeover } from '@/stores/takeover'

beforeEach(() => {
  resetTakeovers()
  runtime.urlListener = undefined
  usePreferences.setState({ onboardingComplete: true })
})

describe('deep links wait for takeovers and onboarding (ADR 0021)', () => {
  it('opens a link at once when nothing is taking over', () => {
    const listener = vi.fn()
    linking.subscribe!(listener)
    runtime.urlListener?.({ url: 'witnesswork://add-time' })
    expect(listener).toHaveBeenCalledWith('witnesswork://add-time')
  })

  it('opens a link that comes during the update reveal once it closes', () => {
    const listener = vi.fn()
    const reveal = useTakeover.getState().seed('update-reveal')
    linking.subscribe!(listener)
    runtime.urlListener?.({ url: 'witnesswork://add-time' })
    runtime.urlListener?.({ url: 'witnesswork://schedule/2026-10-08' })
    expect(listener).not.toHaveBeenCalled()
    useTakeover.getState().release(reveal)
    // The newest link wins.
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('witnesswork://schedule/2026-10-08')
  })

  it('opens a link that comes during onboarding once it finishes', () => {
    usePreferences.setState({ onboardingComplete: false })
    const listener = vi.fn()
    const unsubscribe = linking.subscribe!(listener)
    runtime.urlListener?.({ url: 'witnesswork://day' })
    expect(listener).not.toHaveBeenCalled()
    usePreferences.setState({ onboardingComplete: true })
    expect(listener).toHaveBeenCalledWith('witnesswork://day')
    expect(typeof unsubscribe).toBe('function')
  })

  it('drops a waiting link when unsubscribed', () => {
    const listener = vi.fn()
    const reveal = useTakeover.getState().seed('update-reveal')
    const unsubscribe = linking.subscribe!(listener) as () => void
    runtime.urlListener?.({ url: 'witnesswork://add-time' })
    unsubscribe()
    useTakeover.getState().release(reveal)
    expect(listener).not.toHaveBeenCalled()
  })
})
