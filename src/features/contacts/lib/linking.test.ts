import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  urlListener: undefined as undefined | ((event: { url: string }) => void),
  removed: 0,
  launchURL: null as string | null,
  linkSinceLaunch: null as string | null,
}))
/** The navigator's screens: onboarding's, or the app's once it renders them. */
const navigation = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  return {
    routeNames: ['Root'],
    listeners,
    /** The next render swaps onboarding's screens for the app's. */
    showApp() {
      this.routeNames = ['Root']
      listeners.forEach((listener) => listener())
    },
  }
})

vi.mock('expo-linking', () => ({
  createURL: (path: string) => `exp://dev${path}`,
  parse: () => ({}),
  addEventListener: (_: string, listener: (event: { url: string }) => void) => {
    runtime.urlListener = listener
    return { remove: () => runtime.removed++ }
  },
}))
vi.mock('@/lib/launchLinks', () => ({
  launchURL: async () => runtime.launchURL,
  linkSinceLaunch: () => runtime.linkSinceLaunch,
}))
vi.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: () => ({
    isReady: () => true,
    getRootState: () => ({ routeNames: navigation.routeNames }),
    addListener: (_: string, listener: () => void) => {
      navigation.listeners.add(listener)
      return () => navigation.listeners.delete(listener)
    },
  }),
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
  runtime.launchURL = null
  runtime.linkSinceLaunch = null
  navigation.routeNames = ['Root']
  navigation.listeners.clear()
  usePreferences.setState({ onboardingComplete: true })
})

/** Onboarding is showing, as a fresh install starts. */
const startOnboarding = () => {
  usePreferences.setState({ onboardingComplete: false })
  navigation.routeNames = ['Onboarding']
}

describe('prefixes', () => {
  it('cover the scheme and every app-link host, never the web app', () => {
    expect(linking.prefixes).toEqual(
      expect.arrayContaining([
        'witnesswork://',
        'https://witnesswork.app',
        'https://dev.witnesswork.app',
        'https://ww-proxy.leviwilkerson.com',
      ])
    )
    expect(linking.prefixes).not.toContain('https://app.witnesswork.app')
  })
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
    startOnboarding()
    const listener = vi.fn()
    const unsubscribe = linking.subscribe!(listener)
    runtime.urlListener?.({ url: 'witnesswork://day' })
    expect(listener).not.toHaveBeenCalled()
    usePreferences.setState({ onboardingComplete: true })
    // Not until the app's screens are up, or it would have nowhere to go.
    expect(listener).not.toHaveBeenCalled()
    navigation.showApp()
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

describe('links on a cold start', () => {
  it('opens the link that launched the app', async () => {
    runtime.launchURL = 'witnesswork://schedule/2026-10-23'
    await expect(linking.getInitialURL!()).resolves.toBe(
      'witnesswork://schedule/2026-10-23'
    )
    const listener = vi.fn()
    linking.subscribe!(listener)
    // Not opened a second time.
    expect(listener).not.toHaveBeenCalled()
  })

  it('opens a link tapped after the launch link was read', async () => {
    runtime.launchURL = 'witnesswork://home'
    await linking.getInitialURL!()
    // Before navigation listened for links itself.
    runtime.linkSinceLaunch = 'witnesswork://add-time'
    const listener = vi.fn()
    linking.subscribe!(listener)
    expect(listener).toHaveBeenCalledWith('witnesswork://add-time')
  })

  it('holds a launch link during onboarding and opens it after', async () => {
    startOnboarding()
    runtime.launchURL = 'witnesswork://day'
    // The onboarding screens have no such route; it would be lost.
    await expect(linking.getInitialURL!()).resolves.toBeNull()
    const listener = vi.fn()
    linking.subscribe!(listener)
    expect(listener).not.toHaveBeenCalled()
    usePreferences.setState({ onboardingComplete: true })
    navigation.showApp()
    expect(listener).toHaveBeenCalledWith('witnesswork://day')
  })
})
