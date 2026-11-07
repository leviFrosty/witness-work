import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  offer: 'unavailable' as 'offer' | 'has_passkey' | 'unavailable',
  listeners: new Set<() => void>(),
  prefs: { onboardingPasskeysOffered: null as boolean | null },
}))

vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => ({
      ...runtime.prefs,
      set: (partial: object) => Object.assign(runtime.prefs, partial),
    }),
  },
}))

vi.mock('@/app/account/passkeyOffer', () => ({
  readPasskeyOffer: vi.fn(async () => runtime.offer),
}))
vi.mock('@/lib/serverAccount', () => ({
  onAccountChange: (listener: () => void) => {
    runtime.listeners.add(listener)
    return () => runtime.listeners.delete(listener)
  },
}))

import { analytics } from '@/lib/analytics'
import useOnboardingPasskeysAvailable from '@/features/onboarding/hooks/useOnboardingPasskeysAvailable'

const seen: boolean[] = []
let renderer: ReactTestRenderer | null = null
const Probe = ({ reached }: { reached: boolean }) => {
  seen.push(useOnboardingPasskeysAvailable(reached))
  return null
}
const latest = () => seen.at(-1)
const render = async (reached = false) => {
  await act(async () => {
    renderer = create(<Probe reached={reached} />)
  })
}
const update = async (reached: boolean) => {
  await act(async () => renderer!.update(<Probe reached={reached} />))
}

beforeEach(() => {
  vi.clearAllMocks()
  seen.length = 0
  runtime.prefs.onboardingPasskeysOffered = null
  runtime.offer = 'unavailable'
  runtime.listeners.clear()
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('useOnboardingPasskeysAvailable', () => {
  it('has no step for an install without an account', async () => {
    await render()
    expect(latest()).toBe(false)
  })

  it('has no step for an account that already has a passkey', async () => {
    runtime.offer = 'has_passkey'
    await render()
    expect(latest()).toBe(false)
  })

  it('adds the step when the account exists, checking again as it opens', async () => {
    await render()
    expect(latest()).toBe(false)
    runtime.offer = 'offer'
    await act(async () => runtime.listeners.forEach((listener) => listener()))
    expect(latest()).toBe(true)
  })

  it('starts as unavailable when a relaunch at or past the step finds nothing decided', async () => {
    runtime.offer = 'offer'
    await render(true)
    expect(seen[0]).toBe(false)
    expect(latest()).toBe(false)
  })

  it('starts as unavailable when the step was decided against', async () => {
    runtime.prefs.onboardingPasskeysOffered = false
    runtime.offer = 'offer'
    await render(true)
    expect(seen.every((available) => !available)).toBe(true)
  })

  it('starts as available when the step was offered before the relaunch', async () => {
    runtime.prefs.onboardingPasskeysOffered = true
    await render(true)
    expect(seen[0]).toBe(true)
    runtime.offer = 'has_passkey'
    await act(async () => runtime.listeners.forEach((listener) => listener()))
    expect(latest()).toBe(true)
  })

  it('saves what it decided once the step’s place is reached', async () => {
    runtime.offer = 'offer'
    await render()
    expect(runtime.prefs.onboardingPasskeysOffered).toBeNull()
    await update(true)
    expect(runtime.prefs.onboardingPasskeysOffered).toBe(true)
  })

  it('saves "no" for an install that has no step to offer', async () => {
    await render()
    await update(true)
    expect(runtime.prefs.onboardingPasskeysOffered).toBe(false)
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('reports the step shown once per onboarding, not per mount', async () => {
    runtime.offer = 'offer'
    await render()
    await update(true)
    await update(true)
    expect(analytics.capture).toHaveBeenCalledTimes(1)
    expect(analytics.capture).toHaveBeenCalledWith('passkey_onboarding_shown')
    act(() => renderer?.unmount())
    await render(true)
    expect(analytics.capture).toHaveBeenCalledTimes(1)
  })

  it('holds its answer once the step’s place is reached', async () => {
    runtime.offer = 'offer'
    await render()
    await update(true)
    runtime.offer = 'unavailable'
    await act(async () => runtime.listeners.forEach((listener) => listener()))
    expect(latest()).toBe(true)
  })
})
