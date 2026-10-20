import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BuddiesAvailability } from '@/features/buddies/lib/availability'
import type { AttestationSupport } from '@/lib/attestation'

const runtime = vi.hoisted(() => ({
  availability: 'hidden' as BuddiesAvailability,
  support: null as AttestationSupport | null,
}))

vi.mock('@/features/buddies/hooks/useBuddiesAvailability', () => ({
  default: () => runtime.availability,
}))
vi.mock('@/features/settings/hooks/useAttestationSupport', () => ({
  default: () => runtime.support,
}))

import useOnboardingBuddiesAvailable from '@/features/onboarding/hooks/useOnboardingBuddiesAvailable'

let renderer: ReactTestRenderer | undefined

const Probe = () =>
  React.createElement('probe', {
    available: useOnboardingBuddiesAvailable(),
  })

/** Renders and returns what the hook answered. */
const render = async () => {
  await act(() => {
    if (renderer) renderer.update(<Probe />)
    else renderer = create(<Probe />)
  })
  const json = renderer?.toJSON()
  return json && !Array.isArray(json) ? json.props.available : undefined
}

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  runtime.availability = 'hidden'
  runtime.support = null
})

describe('useOnboardingBuddiesAvailable', () => {
  it('follows availability', async () => {
    expect(await render()).toBe(false)
    runtime.availability = 'enabled'
    expect(await render()).toBe(true)
    runtime.availability = 'hidden'
    expect(await render()).toBe(false)
  })

  it('counts loading and a relay that is off as available', async () => {
    runtime.availability = 'loading'
    expect(await render()).toBe(true)
    runtime.availability = 'disabled'
    expect(await render()).toBe(true)
  })

  it('leaves Buddies out on a device that can never be verified', async () => {
    runtime.availability = 'enabled'
    runtime.support = 'unsupported'
    expect(await render()).toBe(false)
    // Still checking, or unsure: Buddies says so if it can't verify later.
    runtime.support = 'unknown'
    expect(await render()).toBe(true)
  })
})
