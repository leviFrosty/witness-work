import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  web: true,
  prefs: { onboardingComplete: false },
}))

vi.mock('@/lib/syncTransport/platform', () => ({
  cloudSyncOnly: () => runtime.web,
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (state: typeof runtime.prefs) => unknown) =>
    select(runtime.prefs),
}))

const { FIRST_SYNC_WAIT_MS, onboardingHold, useWebOnboardingHold } =
  await import('@/app/sync/useWebOnboardingHold')
const { markCompletePull, resetCompletePull } = await import(
  '@/lib/cloudSyncPullSettled'
)
const { releaseFirstSync, resetFirstSync, retryFirstSync, stallFirstSync } =
  await import('@/app/sync/webFirstSync')

const base = {
  web: true,
  onboardingComplete: false,
  completedPull: false,
  firstSync: 'checking' as const,
}

describe('onboardingHold', () => {
  it('holds a browser’s onboarding until a complete pull', () => {
    expect(onboardingHold(base)).toBe('checking')
    expect(onboardingHold({ ...base, completedPull: true })).toBe('none')
  })

  it('offers Retry when the decision stalled', () => {
    expect(onboardingHold({ ...base, firstSync: 'stalled' })).toBe('stalled')
  })

  it('never holds a phone, a finished onboarding, or an account sync can’t run for', () => {
    expect(onboardingHold({ ...base, web: false })).toBe('none')
    expect(onboardingHold({ ...base, onboardingComplete: true })).toBe('none')
    expect(onboardingHold({ ...base, firstSync: 'released' })).toBe('none')
  })
})

describe('useWebOnboardingHold', () => {
  let renderer: ReactTestRenderer | null = null
  let hold: string | null = null
  const seen = (value: string) => {
    hold = value
  }
  function Probe({ onHold }: { onHold: (value: string) => void }) {
    onHold(useWebOnboardingHold())
    return null
  }

  beforeEach(() => {
    vi.useFakeTimers()
    runtime.web = true
    runtime.prefs.onboardingComplete = false
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    resetFirstSync()
    resetCompletePull()
    vi.useRealTimers()
  })

  it('checks, then offers Retry after the wait, then checks again', () => {
    act(() => {
      renderer = create(<Probe onHold={seen} />)
    })
    expect(hold).toBe('checking')
    act(() => {
      vi.advanceTimersByTime(FIRST_SYNC_WAIT_MS)
    })
    expect(hold).toBe('stalled')
    act(() => retryFirstSync())
    expect(hold).toBe('checking')
  })

  it('lets onboarding run once a complete pull lands', () => {
    act(() => {
      renderer = create(<Probe onHold={seen} />)
    })
    act(() => stallFirstSync())
    expect(hold).toBe('stalled')
    act(() => markCompletePull())
    expect(hold).toBe('none')
  })

  it('lets onboarding run when sync can’t run for the account', () => {
    act(() => {
      renderer = create(<Probe onHold={seen} />)
    })
    act(() => releaseFirstSync())
    expect(hold).toBe('none')
  })
})
